import type { ArvInput, ArvResult } from '../../domain/arv.ts';
import { createRentCastArvProvider } from './providers.ts';
import { discoverAndEstimateARV } from './discovery.ts';
import { estimateARV } from './engine.ts';
import { validateArvInput } from './validation.ts';
const cache=new Map<string,{expires:number;value:ArvResult}>();
const inflight=new Map<string,Promise<ArvResult>>();
export async function runArvEstimate(input:ArvInput,options:{live?:boolean;apiKey?:string;fetcher?:typeof fetch;signal?:AbortSignal;cacheSeconds?:number;onUsage?:(event:{requests:number;status:number})=>void}={}):Promise<ArvResult> {
  validateArvInput(input);
  if(!options.live)return estimateARV(input);
  if(!options.apiKey)throw new Error('RENTCAST_API_KEY is required for live comparable discovery. Offline supplied comps remain available.');
  if(input.valuationDate!==new Date().toISOString().slice(0,10))throw new Error('Live discovery searches recent records relative to today. Historical valuations require supplied dated sales.');
  const key=JSON.stringify([input,options.apiKey]);const hit=cache.get(key);
  if(hit&&hit.expires>Date.now())return structuredClone(hit.value);
  const existing=inflight.get(key);if(existing)return structuredClone(await existing);
  const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000);
  let requests=0;
  const fetcher=(async(...args:Parameters<typeof fetch>)=>{if(++requests>6)throw new Error('ARV provider request budget exhausted.');return(options.fetcher??fetch)(...args);}) as typeof fetch;
  const provider=createRentCastArvProvider({apiKey:options.apiKey,fetcher,signal,onUsage:event=>options.onUsage?.({requests,status:event.status})});
  const work=discoverAndEstimateARV(input,provider).then(result=>{
    const seconds=Math.max(0,Math.min(3600,options.cacheSeconds??0));
    if(seconds>0&&result.likelyArv!==null&&!result.warnings.some(w=>w.includes('Provider query failed'))){if(cache.size>=50)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+seconds*1000,value:structuredClone(result)});}
    return result;
  }).finally(()=>inflight.delete(key));
  inflight.set(key,work);return structuredClone(await work);
}
