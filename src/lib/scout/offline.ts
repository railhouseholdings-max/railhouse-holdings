/** Explicitly offline/test-only persistence. Production always uses the Supabase store. */
import type { ScoutConfig,ScoutEvidence,ScoutEvaluation,ScoutListing,ScoutRun,ScoutStore,TrackedProperty } from '../../domain/scout.ts';
import { propertyIdentity } from './identity.ts';
import { DEFAULT_SCOUT_CONFIG } from './config.ts';
export class OfflineScoutStore implements ScoutStore {
  settings:ScoutConfig=structuredClone(DEFAULT_SCOUT_CONFIG);
  runs=new Map<string,ScoutRun>();properties=new Map<string,TrackedProperty&{evaluation?:ScoutEvaluation;notes:string;visible?:boolean}>();
  history:{propertyId:string;listing:ScoutListing}[]=[];lastCheckpoint:string|null=null;monthlyRequests=0;
  async config(){return structuredClone(this.settings);}
  async begin(key:string,now:string){if(this.runs.has(key)||[...this.runs.values()].some(r=>r.status==='running'))return null;const run:ScoutRun={id:key,startedAt:now,completedAt:null,status:'running',discovered:0,evaluated:0,added:0,updated:0,rejected:0,requests:0,sources:[],warnings:[],errors:[],report:[]};this.runs.set(key,run);return run;}
  async checkpoint(){return this.lastCheckpoint;}
  async tracked(){return structuredClone([...this.properties.values()]);}
  async reserveRequest(_id:string,_month:string,limit:number){if(this.monthlyRequests>=limit)return false;this.monthlyRequests++;return true;}
  async saveListing(_runId:string,listing:ScoutListing,evaluation?:ScoutEvaluation){
    const key=propertyIdentity(listing.address),old=this.properties.get(key);
    const changed=!old?.listing||old.listing.status!==listing.status||old.listing.price!==listing.price;
    if(changed)this.history.push({propertyId:old?.id??key,listing:structuredClone(listing)});
    const evidence:ScoutEvidence={...(old?.evidence??{})};
    if(evaluation?.arv)evidence.arv=evaluation.arv;if(evaluation?.rehab)evidence.rehab=evaluation.rehab;
    const visible=Boolean(listing.provider==='Google Sheets'||old?.visible||old?.manual||(evaluation&&evaluation.stage!=='screened'&&evaluation.recommendation!=='Pass'));
    this.properties.set(key,{visible,id:old?.id??key,address:old?.address??listing.address,listing:structuredClone(listing),evaluation:evaluation?structuredClone(evaluation):old?.evaluation,evidence,manual:old?.manual??false,notes:old?.notes??''});
    return {id:old?.id??key,created:!old?.visible&&visible,changed,visible};
  }
  async finish(run:ScoutRun,checkpoint:string|null){this.runs.set(run.id,structuredClone(run));if(checkpoint)this.lastCheckpoint=checkpoint;}
}
