export class RentCastError extends Error {
  readonly status:number;
  readonly retryAfterSeconds:number|null;
  constructor(status:number,retryAfterSeconds:number|null=null){super(status===429?'RentCast rate limit reached; retry later.':'RentCast request failed.');this.status=status;this.retryAfterSeconds=retryAfterSeconds;}
}
export interface RentCastRequestOptions {apiKey:string;fetcher?:typeof fetch;signal?:AbortSignal;onUsage?:(event:{path:string;status:number;attempt:number})=>void}
/** Fixed provider origin; never accepts arbitrary URLs or logs credentials/addresses. */
export async function rentCastRequest(path:'properties'|'avm/rent/long-term'|'listings/sale',params:URLSearchParams,options:RentCastRequestOptions):Promise<unknown> {
  if(!options.apiKey.trim())throw new Error('RentCast is not configured.');
  const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  for(let attempt=1;attempt<=2;attempt++){
    const url=new URL(`https://api.rentcast.io/v1/${path}`);url.search=params.toString();
    const response=await(options.fetcher??fetch)(url,{headers:{Accept:'application/json','X-Api-Key':options.apiKey},cache:'no-store',signal});
    options.onUsage?.({path,status:response.status,attempt});
    if(response.ok)return response.json();
    const raw=response.headers.get('Retry-After');const after=raw!==null&&/^\d+$/.test(raw)?Number(raw):null;
    if(attempt===1&&[429,502,503,504].includes(response.status)&&(after===null||after<=1)){
      await response.body?.cancel();await new Promise<void>((resolve,reject)=>{const done=()=>{signal.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,after===null?250:after*1000);const abort=()=>{clearTimeout(timer);reject(new Error('RentCast request interrupted.'));};if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});continue;
    }
    await response.body?.cancel();throw new RentCastError(response.status,after);
  }
  throw new Error('RentCast request failed.');
}
