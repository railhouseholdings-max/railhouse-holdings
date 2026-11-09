import { createPhotoArchiver } from '@/lib/photos/archive';
import { timingSafeEqual } from 'node:crypto';
import { cloudConfig, dataMode, UUID_PATTERN } from '@/lib/config/cloud';
import { ownerSession } from '@/lib/cloud/session';
import { isSameOriginWrite, restRequest } from '@/lib/cloud/http';
import { isScoutScheduleHour, scoutDay, validateScoutConfig } from '@/lib/scout/config';
import { createScoutStore } from '@/lib/scout/store';
import { readScoutSheet } from '@/lib/sheets/client';
import { syncSheetToFeed } from '@/lib/sheets/workflow';
import { validatePropertyReview } from '@/lib/scout/review';
import type { ScoutRun } from '@/domain/scout';
export const runtime='nodejs';
export const maxDuration=300;
const headers={'Cache-Control':'no-store'};
function authorizedCron(request:Request) {
  const secret=process.env.CRON_SECRET;if(!secret||secret.length<32)return false;
  const given=Buffer.from(request.headers.get('authorization')??'');const expected=Buffer.from(`Bearer ${secret}`);
  return given.length===expected.length&&timingSafeEqual(given,expected);
}
async function execute(key:string) {
  const config=cloudConfig();
  if(!process.env.SCOUT_SUPABASE_SECRET_KEY)throw new Error('Sheet import requires SCOUT_SUPABASE_SECRET_KEY on the server.');
  const base=createScoutStore(config,process.env.SCOUT_SUPABASE_SECRET_KEY);
  if(!(await base.config()).enabled)return Response.json({skipped:true,reason:'Daily sheet import is disabled.'},{headers});
  let active:ScoutRun|null=null;const signal=AbortSignal.timeout(240000);
  const store={...base,begin:async(key:string,now:string)=>{active=await base.begin(key,now);return active;}};
  const fetcher=(async(...args:Parameters<typeof fetch>)=>{if(active)active.requests++;return fetch(...args);}) as typeof fetch;
  const run=await syncSheetToFeed({store,key,now:()=>new Date().toISOString(),signal,archivePhoto:createPhotoArchiver({config,secret:process.env.SCOUT_SUPABASE_SECRET_KEY,fetcher}),read:()=>readScoutSheet({credentialJson:process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON??'',spreadsheetId:process.env.SCOUT_GOOGLE_SHEET_ID,sheetId:process.env.SCOUT_GOOGLE_SHEET_GID===undefined?0:Number(process.env.SCOUT_GOOGLE_SHEET_GID),signal,fetcher})});
  if(run?.status==='failed')return Response.json({run,error:run.errors[0]??'Google Sheets import failed.'},{status:502,headers});
  return Response.json(run?{run}:{skipped:true,reason:'This run already exists or another run is active.'},{headers});
}
export async function GET(request:Request) {
  if(!authorizedCron(request))return Response.json({error:'Unauthorized.'},{status:401,headers});
  if(dataMode()!=='supabase')return Response.json({skipped:true,reason:'Scout requires private cloud storage.'},{headers});
  if(!isScoutScheduleHour(new Date()))return Response.json({skipped:true,reason:'Outside the 9am America/New_York schedule.'},{headers});
  try{return await execute(`scheduled:${scoutDay(new Date())}`);}catch(error){return Response.json({error:error instanceof Error?error.message:'Scout failed.'},{status:503,headers});}
}
export async function POST(request:Request) {
  if(dataMode()!=='supabase')return Response.json({error:'Scout is disabled in demo mode.'},{status:403,headers});
  const config=cloudConfig();if(!isSameOriginWrite(request,config.origin))return Response.json({error:'Invalid request origin.'},{status:403,headers});
  const session=await ownerSession();if(!session)return Response.json({error:'Sign in to manage Scout.'},{status:401,headers});
  try {
    const raw=await request.text();if(raw.length>16000)return Response.json({error:'Request too large.'},{status:413,headers});
    const body=JSON.parse(raw);
    if(body.operation==='view'){
      if(!UUID_PATTERN.test(body.propertyId))throw new Error('Invalid property ID.');
      await restRequest(config,session,`properties?id=eq.${body.propertyId}&first_viewed_at=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({first_viewed_at:new Date().toISOString()})});
      return Response.json({viewed:true},{headers});
    }
    if(body.operation==='review'){
      if(!UUID_PATTERN.test(body.propertyId)||!Number.isSafeInteger(body.revision)||body.revision<0)throw new Error('Invalid property/revision.');
      const review=validatePropertyReview(body.review,new Date().toISOString());
      const saved=await restRequest<unknown[]>(config,session,`properties?id=eq.${body.propertyId}&details_revision=eq.${body.revision}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({manual_review:review,details_revision:body.revision+1,updated_at:new Date().toISOString()})});
      if(!saved.length)return Response.json({error:'This property changed in another session. Reload before saving.'},{status:409,headers});
      return Response.json({saved:true},{headers});
    }
    if(body.operation==='configure'){
      const value=validateScoutConfig(body.config);
      await restRequest(config,session,'scout_settings?on_conflict=owner_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({owner_id:config.ownerId,config:value,updated_at:new Date().toISOString()})});
      return Response.json({config:value},{headers});
    }
    if(body.operation!=='run')throw new Error('Unsupported Scout operation.');
    return await execute(`manual:${new Date().toISOString().slice(0,16)}`);
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Scout failed.'},{status:400,headers});}
}
