import type { ScoutListing, ScoutProvider, ScoutRun, ScoutStore } from '../../domain/scout.ts';
import { validateScoutConfig } from './config.ts';
import { evaluateScoutProperty, preScreen } from './evaluate.ts';
import { propertyIdentity } from './identity.ts';
export function discoveryDays(checkpoint:string|null,now:string,backfill:number,overlap:number):number {
  return checkpoint?Math.max(1,Math.ceil((Date.parse(now)-Date.parse(checkpoint))/86400000)+overlap):backfill;
}
export function currentListing(rows:ScoutListing[]):ScoutListing|null {
  if(!rows.length)return null;
  const sorted=[...rows].sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt));
  const winner=structuredClone(sorted[0]);
  if(rows.some(r=>r.status!==winner.status||r.price!==winner.price)){
    winner.conflicts.push('Provider records disagree on current status or asking price.');winner.status='Unknown';
  }
  return winner;
}
export async function runScout(options:{store:ScoutStore;provider:ScoutProvider;key:string;now:()=>string;signal:AbortSignal}):Promise<ScoutRun|null> {
  const {store,provider,now,signal}=options;const config=validateScoutConfig(await store.config());
  if(!config.enabled)throw new Error('Scout is disabled. Configure request limits and enable it in Properties.');
  const run=await store.begin(options.key,now());if(!run)return null;
  let complete=true;const processed=new Set<string>();let enriched=0;let newlyQualified=0;
  try {
    const checkpoint=await store.checkpoint();const tracked=(await store.tracked()).sort((a,b)=>Number(Boolean(a.evidence.arv||a.evidence.lookup||a.evidence.rehab))-Number(Boolean(b.evidence.arv||b.evidence.lookup||b.evidence.rehab)));
    // Existing records always retain manual underwriting/notes. Automated evidence is separate.
    for(const property of tracked){
      if(signal.aborted){complete=false;run.warnings.push('Time budget reached; remaining tracked properties will be retried.');break;}
      if(property.listing&&['Sold','Off Market'].includes(property.listing.status))continue;
      try {
        const listing=currentListing(await provider.verify(property.address,signal));
        if(!listing){run.warnings.push(`No current listing returned for tracked property ${property.id}; previous status retained.`);continue;}
        processed.add(propertyIdentity(listing.address));
        if(listing.status!=='Active'||listing.conflicts.length){await store.saveListing(run.id,listing);run.updated++;continue;}
        let evidence=property.evidence;
        if(!preScreen(listing,config)&&enriched<config.maxEnrichments){enriched++;try{evidence=await provider.enrich(listing,evidence,signal);}catch{complete=false;run.warnings.push(`Enrichment failed for tracked property ${property.id}; retained prior evidence.`);}}
        const evaluation=evaluateScoutProperty(listing,evidence,config,now());
        const saved=await store.saveListing(run.id,listing,evaluation);if(saved.created){run.added++;if(evaluation.qualifies)newlyQualified++;}else run.updated++;if(evaluation.stage!=='screened')run.evaluated++;
      }catch{complete=false;run.errors.push(`Listing check failed for tracked property ${property.id}; previous data retained.`);}
    }
    const days=discoveryDays(checkpoint,run.startedAt,config.backfillDays,config.overlapDays);
    for(const city of config.cities){
      if(signal.aborted){complete=false;run.warnings.push('Discovery paused at time limit; checkpoint retained.');break;}
      try {
        for(let offset=0;;offset+=500){
          const rows=await provider.discover(city,days,offset,signal);run.sources.push(`RentCast listings: ${city}`);
          for(const listing of rows){
            if(listing.state!=='IN'||listing.city!==city){run.warnings.push('Provider returned a listing outside the requested town; skipped.');continue;}
            const key=propertyIdentity(listing.address);if(processed.has(key))continue;
            processed.add(key);run.discovered++;
            const listed=listing.listedAt&&Date.parse(listing.listedAt);
            if(!listed||listed>Date.parse(run.startedAt)||listed<Date.parse(run.startedAt)-days*86400000){run.rejected++;continue;}
            const reason=preScreen(listing,config);if(reason){run.rejected++;continue;}
            // Persist the discovery before expensive enrichment. Missing evidence is a review queue,
            // never a qualifying recommendation. The next run can resume from canonical records.
            let evidence=tracked.find(p=>propertyIdentity(p.address)===key)?.evidence??{};
            if(enriched<config.maxEnrichments){enriched++;try{evidence=await provider.enrich(listing,evidence,signal);}catch{complete=false;run.warnings.push(`Enrichment unavailable for listing ${listing.sourceId}; saved for review.`);}}
            const evaluation=evaluateScoutProperty(listing,evidence,config,now());
            const saved=await store.saveListing(run.id,listing,evaluation);if(evaluation.stage!=='screened')run.evaluated++;
            if(saved.created){run.added++;if(evaluation.qualifies)newlyQualified++;}else run.updated++;
            if(evaluation.recommendation==='Pass')run.rejected++;
          }
          if(rows.length<500)break;
          if(signal.aborted)throw new Error('Run interrupted.');
        }
      }catch{complete=false;run.errors.push(`Discovery incomplete for ${city}; checkpoint retained.`);}
    }
    run.status=complete?'succeeded':'partial';run.completedAt=now();
    run.report=[`${newlyQualified} new qualifying candidates.`,...(newlyQualified===0?['No new qualifying BRRRR candidates were identified.']:[]),`${run.added} new properties saved; ${run.updated} tracked records refreshed.`,`${run.evaluated} evaluations; ${run.rejected} screened out.`,...(run.added===0?['No new properties added. No filler candidates were created.']:[]),'Unenriched discoveries remain in the feed research queue until detailed review. Needs Review is not a qualifying opportunity.',...run.warnings,...run.errors];
    await store.finish(run,complete?run.startedAt:null);return run;
  }catch{
    run.status='failed';run.completedAt=now();run.errors.push('Run interrupted; committed property updates remain intact and discovery checkpoint retained.');run.report=[...run.errors];
    await store.finish(run,null);return run;
  }
}
