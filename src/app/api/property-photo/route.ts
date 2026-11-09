import { cloudConfig,dataMode,UUID_PATTERN } from '@/lib/config/cloud';
import { ownerSession } from '@/lib/cloud/session';
import { downloadPropertyPhoto } from '@/lib/photos/download';
export async function GET(request:Request) {
  const headers={'Cache-Control':'no-store'};
  if(dataMode()!=='supabase')return Response.json({error:'Photo storage is unavailable in demo mode.'},{status:404,headers});
  const session=await ownerSession();if(!session)return Response.json({error:'Sign in to view property photos.'},{status:401,headers});
  const params=new URL(request.url).searchParams,id=params.get('propertyId')??'',version=params.get('version');
  if(!UUID_PATTERN.test(id)||version!==null&&!/^[a-f0-9]{64}$/.test(version))return Response.json({error:'Invalid photo reference.'},{status:400,headers});
  try{return await downloadPropertyPhoto(cloudConfig(),session,id,version);}catch{return Response.json({error:'Saved listing photo is temporarily unavailable.'},{status:503,headers});}
}
