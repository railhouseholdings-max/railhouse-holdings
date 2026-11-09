import type { ScoutConfig, ScoutEvidence, ScoutListing, ScoutStore, TrackedProperty } from '../../domain/scout.ts';
import type { ScoutEvaluation } from '../../domain/scout.ts';
import type { CloudConfig } from '../config/cloud.ts';
import { DEFAULT_SCOUT_CONFIG } from './config.ts';
import { fromDealRow,type DbRow } from '../persistence/deal-records.ts';
import { calculatorArvInput } from '../arv/application.ts';
import { totalUnitRent } from '../deals/property-details.ts';
import type { PropertyDetailsDraft } from '../deals/property-details.ts';
import type { RentCastLookup } from '../../domain/property-lookup.ts';
export function createScoutStore(config:CloudConfig,secret:string,fetcher:typeof fetch=fetch):ScoutStore {
  if(!secret||!(secret.startsWith('sb_secret_')||secret.split('.').length===3))throw new Error('Configure a server-only Supabase secret/service role key for unattended Scout jobs.');
  if(!secret.startsWith('sb_secret_')){try{if(JSON.parse(Buffer.from(secret.split('.')[1],'base64url').toString()).role!=='service_role')throw new Error();}catch{throw new Error('Scout requires a Supabase secret or service-role key, not an anon/user token.');}}
  const request=async<T>(path:string,body?:unknown):Promise<T>=>{
    const response=await fetcher(`${config.url}/rest/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:secret,...(!secret.startsWith('sb_secret_')?{Authorization:`Bearer ${secret}`}:{ }),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Scout database operation failed. Check the Scout migration and server credential.');
    const text=await response.text();return(text?JSON.parse(text):null) as T;
  };
  const settings=async()=>request<{config:ScoutConfig;discovery_checkpoint:string|null}[]>(`scout_settings?owner_id=eq.${config.ownerId}&select=config,discovery_checkpoint`);
  return {
    config:async()=>(await settings())[0]?.config??structuredClone(DEFAULT_SCOUT_CONFIG),
    checkpoint:async()=>(await settings())[0]?.discovery_checkpoint??null,
    begin:async(key)=>{
      const row=await request<{id:string;started_at:string}|null>('rpc/scout_begin',{p_key:key});
      return row?{id:row.id,startedAt:row.started_at,completedAt:null,status:'running',discovered:0,evaluated:0,added:0,updated:0,rejected:0,requests:0,sources:[],warnings:[],errors:[],report:[]}:null;
    },
    tracked:async()=>{
      const result:TrackedProperty[]=[];
      for(let offset=0;;offset+=500){
        const rows=await request<{id:string;address:string;listing:ScoutListing|null;property_details:{lookup?:RentCastLookup;draft?:PropertyDetailsDraft};scout_evaluation:ScoutEvaluation|null;manual_review?:{evidence?:ScoutEvidence};deals?:DbRow[]}[]>(`properties?owner_id=eq.${config.ownerId}&select=id,address,listing,property_details,scout_evaluation,manual_review,deals(*,deal_adjustments(*),deal_tax_assumptions(*))&order=updated_at.asc,id.asc&limit=500&offset=${offset}`);
        for(const row of rows){
          const ev=row.scout_evaluation;const details=row.property_details;
          const evidence:ScoutEvidence={rehab:ev?.rehab??undefined,arv:ev?.arv??undefined,neighborhood:ev?.neighborhood??undefined,...row.manual_review?.evidence};
          const latestDeal=row.deals?.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))[0];
          if(latestDeal)evidence.assumptions={...fromDealRow(latestDeal).inputs,...evidence.assumptions};
          if(details?.lookup)evidence.lookup=details.lookup;
          // Presence of a prior enrichment result puts raw discoveries first in the next run.
          if(!evidence.lookup&&ev?.stage==='enriched'&&!evidence.arv)evidence.arv=ev.arv??undefined;
          const unitRent=details?.draft?.units?totalUnitRent(details.draft.units):null;
          if(unitRent!==null&&!evidence.rentOverride)evidence.rentOverride={monthly:unitRent,low:null,high:null,source:'User-supplied per-unit rent plan saved in Analyze Deal; range unavailable.'};
          if(details?.draft&&!evidence.arvInput)evidence.arvInput=calculatorArvInput(row.address,details.lookup,details.draft,new Date().toISOString().slice(0,10));
          result.push({id:row.id,address:row.address,listing:row.listing,evidence,manual:Boolean(details?.draft)});
        }
        if(rows.length<500)break;
      }
      return result;
    },
    reserveRequest:(id,month,limit)=>request<boolean>('rpc/scout_reserve',{p_run:id,p_month:month,p_limit:limit}),
    saveListing:(runId,listing,evaluation)=>request<{id:string;created:boolean;changed:boolean}>('rpc/scout_save_listing',{p_run:runId,p_listing:listing,p_evaluation:evaluation??null}),
    finish:async(run,checkpoint)=>{await request('rpc/scout_finish',{p_run:run.id,p_summary:run,p_checkpoint:checkpoint});},
  };
}
