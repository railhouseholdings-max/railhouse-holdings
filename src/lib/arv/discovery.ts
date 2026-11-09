import type { ArvInput, ArvResult } from '../../domain/arv.ts';
import type { ArvDataProvider } from './providers.ts';
import { estimateARV } from './engine.ts';
import { validateArvInput } from './validation.ts';
export async function discoverAndEstimateARV(input:ArvInput,provider:ArvDataProvider):Promise<ArvResult> {
  validateArvInput(input);let subject=structuredClone(input.subject);const comps=[...input.comparables];const warnings:string[]=[];
  if(subject.latitude===null||subject.longitude===null){
    const fetched=await provider.subject(subject.address);
    // Preserve supplied subject assertions and their conflicts. Fill unavailable fields only.
    const {reconcilePropertyEvidence}=await import('./normalization.ts');subject=reconcilePropertyEvidence(subject,fetched);
    subject.latitude??=fetched.latitude;subject.longitude??=fetched.longitude;
  }
  let result=estimateARV({...input,subject,comparables:comps});
  for(const stage of [{radiusMiles:0.5,months:6},{radiusMiles:1,months:6},{radiusMiles:1.5,months:6},{radiusMiles:1.5,months:12}] as const){
    if(result.comparables.length>=4)break;
    try {comps.push(...await provider.discover(subject,{...stage,valuationDate:input.valuationDate}));result=estimateARV({...input,subject,comparables:comps});}
    catch{warnings.push(`Provider query failed for ${stage.radiusMiles}mi/${stage.months}mo; this is not evidence that sales do not exist.`);break;}
  }
  result.warnings.push('Live property records may omit condition, legal-unit verification, basement detail and closed-sale concessions. Verify them before relying on ARV.','Discovery queries are capped at 50 records per stage (not an exhaustive market search).',...warnings);
  if(warnings.length&&result.status==='final')result.status='provisional';
  return result;
}
