import { cloudConfig,dataMode,UUID_PATTERN } from '@/lib/config/cloud';
import { ownerSession } from '@/lib/cloud/session';
import { isSameOriginWrite,restRequest } from '@/lib/cloud/http';
import { validateOwnedValues } from '@/lib/persistence/owned-fields';
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store'};
  if(dataMode()!=='supabase')return Response.json({error:'Saving is disabled in demo mode.'},{status:403,headers});
  const config=cloudConfig();if(!isSameOriginWrite(request,config.origin))return Response.json({error:'Invalid request origin.'},{status:403,headers});
  const session=await ownerSession();if(!session)return Response.json({error:'Sign in before saving.'},{status:401,headers});
  try{
    const raw=await request.text();if(raw.length>24000)throw new Error('Property record is too large.');
    const body=JSON.parse(raw);if(!UUID_PATTERN.test(body.id)||!Number.isSafeInteger(body.revision)||body.revision<0)throw new Error('Invalid property or revision.');
    const rows=validateOwnedValues(body.values);
    const saved=await restRequest(config,session,'rpc/save_owned_property',{method:'POST',body:JSON.stringify({p_id:body.id,p_revision:body.revision,p_data:rows})});
    return Response.json(saved,{headers});
  }catch(error){const message=error instanceof Error?error.message:'Could not save property.';return Response.json({error:message},{status:message.includes('another session')?409:400,headers});}
}
