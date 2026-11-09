import { lookupAccessDenied } from '@/lib/cloud/api-access';
import { isCompletePropertyAddress, type RentCastLookup } from '@/domain/property-lookup';
import { lookupRentCast } from '@/lib/rentcast/lookup';

// Bounded, short-lived instance cache reduces repeat paid calls. Never cache failures.
const cache = new Map<string, { expires: number; data: RentCastLookup }>();
const pending = new Map<string, Promise<RentCastLookup>>();
export async function GET(request: Request) {
  const denied = await lookupAccessDenied(); if(denied) return denied;
  const headers={'Cache-Control':'private, no-store'};
  const address=new URL(request.url).searchParams.get('address')?.trim()??'';
  if(!isCompletePropertyAddress(address)) return Response.json({error:'Enter a full street address with city and state or ZIP.'},{status:400,headers});
  const apiKey=process.env.RENTCAST_API_KEY;
  if(!apiKey) return Response.json({error:'Property lookup is not configured. You can enter values manually.'},{status:503,headers});
  const key=address.toLowerCase().replace(/\s+/g,' ');
  const hit=cache.get(key);
  if(hit && hit.expires>Date.now()) return Response.json(hit.data,{headers});
  try {
    let work=pending.get(key);
    if(!work) {
      work=lookupRentCast(address,{apiKey}).then(data=>{
        if(data.rent && !data.warnings.length) {
          if(cache.size>=100) cache.delete(cache.keys().next().value!);
          cache.set(key,{expires:Date.now()+60*60*1000,data});
        }
        return data;
      }).finally(()=>pending.delete(key));
      pending.set(key,work);
    }
    return Response.json(await work,{headers});
  } catch {
    return Response.json({error:'Property details or rent could not be retrieved. Check the address and try again, or enter values manually.'},{status:503,headers});
  }
}

// Valuation extends the existing property service; GET retains its original contract.
export async function POST(request:Request) {
  const denied=await lookupAccessDenied();if(denied)return denied;
  const headers={'Cache-Control':'private, no-store'};
  const {dataMode,cloudConfig}=await import('@/lib/config/cloud');
  const {isSameOriginWrite}=await import('@/lib/cloud/http');
  const url=new URL(request.url);
  // Next's local request URL can use localhost even when the browser used 127.0.0.1.
  // Production always uses the configured application origin, never a client header.
  const origin=dataMode()==='supabase'?cloudConfig().origin:`${url.protocol}//${request.headers.get('host')??url.host}`;
  if(!isSameOriginWrite(request,origin))return Response.json({error:'Invalid request origin.'},{status:403,headers});
  let input:import('@/domain/arv').ArvInput;
  let live=false;
  try {
    const raw=await request.text();if(raw.length>500000)return Response.json({error:'Valuation request exceeds 500 KB.'},{status:413,headers});
    const body=JSON.parse(raw);
    if(body?.operation!=='estimate-arv'||typeof body.live!=='boolean')throw new Error('Use operation estimate-arv and an explicit live boolean.');
    const {validateArvInput}=await import('@/lib/arv/validation');
    input=validateArvInput(body.input);live=body.live;
  }catch(error){return Response.json({error:error instanceof SyntaxError?'Invalid valuation JSON.':error instanceof Error?error.message:'Invalid valuation input.'},{status:400,headers});}
  if(live&&!process.env.RENTCAST_API_KEY)return Response.json({error:'Live ARV discovery is not configured. Supply comparable records for an offline estimate.'},{status:503,headers});
  if(live&&input.valuationDate!==new Date().toISOString().slice(0,10))return Response.json({error:'Live discovery requires today’s valuation date. Use supplied records for historical estimates.'},{status:400,headers});
  try {
    const {runArvEstimate}=await import('@/lib/arv/service');
    const result=await runArvEstimate(input,{live,apiKey:process.env.RENTCAST_API_KEY,signal:request.signal,cacheSeconds:Number(process.env.RENTCAST_ARV_CACHE_SECONDS)||0,onUsage:event=>console.info('arv_provider_usage',event)});
    return Response.json(result,{headers});
  }catch{
    return Response.json({error:'ARV estimation could not complete. Provider failure is not proof that comparable sales do not exist. Use supplied comps or retry later.'},{status:503,headers});
  }
}
export const maxDuration=60;
