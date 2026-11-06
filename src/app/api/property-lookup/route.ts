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
