import type { CloudConfig } from '../config/cloud.ts';
import type { OwnerSession } from '../cloud/http.ts';
import { cloudHeaders,restRequest } from '../cloud/http.ts';
import type { ScoutListing } from '../../domain/scout.ts';
import { PHOTO_BUCKET,storedPhoto } from './storage.ts';
/** Resolve only an owner-visible canonical property's stored path, never a caller-supplied object path. */
export async function downloadPropertyPhoto(config:CloudConfig,session:OwnerSession,propertyId:string,version:string|null,fetcher:typeof fetch=fetch):Promise<Response> {
  const rows=await restRequest<{listing:ScoutListing|null}[]>(config,session,`properties?${new URLSearchParams({select:'listing',id:`eq.${propertyId}`,limit:'1'})}`,{},fetcher);
  const photo=rows[0]?.listing?.photos.find(p=>storedPhoto(p,config.ownerId)&&(!version||p.sha256===version));
  if(!photo?.storagePath)return Response.json({error:'Saved listing photo not found.'},{status:404,headers:{'Cache-Control':'no-store'}});
  const response=await fetcher(`${config.url}/storage/v1/object/authenticated/${PHOTO_BUCKET}/${photo.storagePath}`,{headers:cloudHeaders(config,session.accessToken),cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();return Response.json({error:'Saved listing photo could not be loaded.'},{status:response.status===404?404:502,headers:{'Cache-Control':'no-store'}});}
  const type=response.headers.get('content-type')?.split(';')[0];
  if(!type||!['image/jpeg','image/png','image/webp','image/avif'].includes(type)){await response.body?.cancel();return Response.json({error:'Unsupported saved photo format.'},{status:502,headers:{'Cache-Control':'no-store'}});}
  return new Response(response.body,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=86400','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
}
