'use client';
import Image from 'next/image';
import { useState } from 'react';
import { listingPhotoUrl } from '@/lib/deals/listing-photo';
export function ListingPhoto({url,address,source,stored=false}:{url:string;address:string;source:string;stored?:boolean}) {
  const [failed,setFailed]=useState(false);const safe=stored&&url.startsWith('/api/property-photo?')?url:listingPhotoUrl(url);
  if(!safe)return null;
  if(failed)return <p className="note listing-photo-unavailable">Listing photo unavailable. You can still open the listing below.</p>;
  return <figure className="listing-photo"><Image src={safe} alt={`Listing photo of ${address}`} width={720} height={480} unoptimized loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/><figcaption>{stored?'Saved photo · ':''}{source}</figcaption></figure>;
}
