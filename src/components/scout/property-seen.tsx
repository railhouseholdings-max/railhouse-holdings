'use client';
import { useEffect,useSyncExternalStore } from 'react';
import { UUID_PATTERN } from '@/lib/config/cloud';
const localSeen=new Set<string>(),listeners=new Set<()=>void>();
const inflight=new Map<string,Promise<void>>();
const storageKey=(id:string)=>`railhouse:property-viewed:${id}`;
function locallySeen(id:string):boolean {
  if(localSeen.has(id))return true;
  try{return typeof window!=='undefined'&&window.localStorage.getItem(storageKey(id))==='1';}catch{return false;}
}
function subscribe(listener:()=>void){
  listeners.add(listener);window.addEventListener('storage',listener);
  return()=>{listeners.delete(listener);window.removeEventListener('storage',listener);};
}
export function usePropertySeen(propertyId:string,persisted?:string|null){
  const local=useSyncExternalStore(subscribe,()=>locallySeen(propertyId),()=>false);
  return Boolean(persisted)||local;
}
export async function markPropertySeen(propertyId:string):Promise<void> {
  if(!UUID_PATTERN.test(propertyId)||locallySeen(propertyId))return;
  const existing=inflight.get(propertyId);if(existing)return existing;
  const work=(async()=>{
    const response=await fetch('/api/scout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'view',propertyId}),keepalive:true});
    if(!response.ok)throw new Error('Could not mark this property as seen. Try again.');
    localSeen.add(propertyId);
    try{window.localStorage.setItem(storageKey(propertyId),'1');}catch{/* Database remains authoritative if browser storage is unavailable. */}
    for(const listener of listeners)listener();
  })().finally(()=>inflight.delete(propertyId));
  inflight.set(propertyId,work);return work;
}
/** Client mount only: route prefetching must never mark an unopened property read. */
export function PropertySeenTracker({propertyId}:{propertyId?:string}) {
  useEffect(()=>{if(propertyId)void markPropertySeen(propertyId).catch(()=>{/* Retry on the next actual view; the database marker remains unset. */});},[propertyId]);
  return null;
}
