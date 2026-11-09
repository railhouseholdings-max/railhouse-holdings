import { createHash } from 'node:crypto';
import type { CloudConfig } from '../config/cloud.ts';
import type { PropertyPhoto,ScoutListing } from '../../domain/scout.ts';
import { propertyIdentity } from '../scout/identity.ts';
import { listingPhotoUrl } from '../deals/listing-photo.ts';
import { PHOTO_BUCKET,PHOTO_MAX_BYTES,storedPhoto } from './storage.ts';
// Fixed, established image origins. Arbitrary sheet URLs never become a server-side fetch proxy.
const IMAGE_HOSTS=new Set(['photos.zillowstatic.com','ap.rdcpix.com','ssl.cdn-redfin.com','imagescdn.homes.com','images.homes.com','images1.apartments.com','lh3.googleusercontent.com']);
export function archivalPhotoUrl(value:string):string {
  const safe=listingPhotoUrl(value);if(!safe||!IMAGE_HOSTS.has(new URL(safe).hostname.toLowerCase()))throw new Error('Photo URL is not on a supported listing-image CDN.');
  return safe;
}
function imageFormat(bytes:Uint8Array):{type:string;extension:string} {
  const b=Buffer.from(bytes);
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return {type:'image/jpeg',extension:'jpg'};
  if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {type:'image/png',extension:'png'};
  if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return {type:'image/webp',extension:'webp'};
  if(b.length>=16&&b.toString('ascii',4,8)==='ftyp'&&['avif','avis'].some(s=>b.toString('ascii',8,32).includes(s)))return {type:'image/avif',extension:'avif'};
  throw new Error('Photo response is not a supported JPEG, PNG, WebP or AVIF image.');
}
async function imageBytes(response:Response):Promise<Uint8Array> {
  if(!response.ok){await response.body?.cancel();throw new Error('The source listing image could not be downloaded.');}
  const size=response.headers.get('content-length');if(size!==null&&Number(size)>PHOTO_MAX_BYTES){await response.body?.cancel();throw new Error('Listing image exceeds the 6 MB archive limit.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('The source listing image was empty.');
  const chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>PHOTO_MAX_BYTES)throw new Error('Listing image exceeds the 6 MB archive limit.');chunks.push(value);}}catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
export function createPhotoArchiver(options:{config:CloudConfig;secret:string;fetcher?:typeof fetch;now?:()=>string}) {
  const fetcher=options.fetcher??fetch,now=options.now??(()=>new Date().toISOString());
  const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
  return async(listing:ScoutListing,previous:ScoutListing|null,signal:AbortSignal):Promise<{listing:ScoutListing;warnings:string[]} >=>{
    const archived=(previous?.photos??[]).filter(photo=>storedPhoto(photo,options.config.ownerId));
    const incoming=listing.photos[0]??(archived.length?undefined:previous?.photos[0]);
    if(!incoming)return {listing:{...listing,photos:archived},warnings:[]};
    const existing=archived.find(photo=>photo.url===incoming.url);
    if(existing)return {listing:{...listing,photos:[{...existing,source:incoming.source},...archived.filter(photo=>photo.storagePath!==existing.storagePath)]},warnings:[]};
    try {
      const url=archivalPhotoUrl(incoming.url);
      const bounded=AbortSignal.any([signal,AbortSignal.timeout(20000)]);
      const bytes=await imageBytes(await fetcher(url,{headers:{Accept:'image/jpeg,image/png,image/webp,image/avif'},redirect:'error',cache:'no-store',signal:bounded}));
      const format=imageFormat(bytes),sha256=hash(bytes);
      const storagePath=`${options.config.ownerId}/${hash(propertyIdentity(listing.address))}/${sha256}.${format.extension}`;
      if(!archived.some(photo=>photo.storagePath===storagePath)){
        const response=await fetcher(`${options.config.url}/storage/v1/object/${PHOTO_BUCKET}/${storagePath}`,{method:'POST',headers:{apikey:options.secret,...(!options.secret.startsWith('sb_secret_')?{Authorization:`Bearer ${options.secret}`}:{ }),'Content-Type':format.type,'x-upsert':'false','Cache-Control':'max-age=31536000'},body:Buffer.from(bytes),cache:'no-store',signal:bounded,redirect:'error'});
        if(!response.ok){
          let duplicate=response.status===409;
          if(response.status===400){const raw=await response.text();if(raw.length<=4096)try{const error=JSON.parse(raw);duplicate=error.error==='Duplicate'||error.message==='The resource already exists'||error.message==='Asset Already Exists';}catch{/* Other errors remain failures. */}}
          else await response.body?.cancel();
          if(!duplicate)throw new Error('Photo could not be saved to private storage. Check the photo bucket migration and server storage access.');
        }else await response.body?.cancel();
      }
      const photo:PropertyPhoto={...incoming,storagePath,sha256,contentType:format.type,bytes:bytes.length,savedAt:now()};
      return {listing:{...listing,photos:[photo,...archived.filter(old=>old.storagePath!==storagePath)]},warnings:[]};
    }catch(error){return {listing:{...listing,photos:archived.length?archived:[incoming]},warnings:[`${error instanceof Error?error.message:'Photo archive failed.'} ${archived.length?'Previously saved image retained.':'No permanent image copy was saved; the source URL remains available.'}`]};}
  };
}
