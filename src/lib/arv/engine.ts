import type { ArvInput, ArvProperty, ArvResult, ArvSource, EvaluatedComparable } from '../../domain/arv.ts';
import { METHODOLOGY_VERSION, CALIBRATION_VERSION } from './calibration.ts';
import { validateArvInput, validateArvResult } from './validation.ts';
import { normalizePropertyType } from './normalization.ts';
import { eligibleComparables } from './selection.ts';
import { adjustComparable } from './adjustments.ts';
import { normalizeWeights, scoreComparable } from './weighting.ts';
import { confidenceScore } from './confidence.ts';
import { reconcileIndications } from './reconciliation.ts';
export function estimateARV(value:ArvInput):ArvResult {
  const input=validateArvInput(value);
  const assumptions:string[]=[];const warnings:string[]=[];
  const proposed:ArvProperty={...structuredClone(input.subject),...input.proposed,propertyType:normalizePropertyType(input.subject.propertyType)};
  if(!input.proposed?.condition){proposed.condition='C3';assumptions.push('Proposed investor-grade finish assumed C3: updated kitchen/baths, flooring, paint, fixtures and functional mechanicals; not luxury.');}
  if(!input.proposed?.quality){proposed.quality='Q4';assumptions.push('Proposed construction quality assumed Q4; no luxury premium.');}
  for(const key of ['units','bedrooms','bathrooms','glaSqFt','garageSpaces','basementSqFt','basementFinishedSqFt'] as const) {
    if(!input.proposed||!(key in input.proposed))assumptions.push(`${key}: current record used provisionally; no unrequested addition assumed.`);
    else proposed.evidence[key]='user-supplied';
  }
  const missingSubjectEvidence=(['units','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','basementSqFt','basementFinishedSqFt','condition','quality','floodZone','style','submarket'] as const).some(field=>proposed[field]===null||!proposed.evidence[field]||proposed.evidence[field]==='unavailable');
  if(missingSubjectEvidence)assumptions.push('Subject field-level verification or material characteristics are incomplete.');
  const provisional=assumptions.length>0||Object.values(proposed.evidence).some(status=>status==='inferred'||status==='unavailable')||proposed.conflicts.length>0;
  const {candidates,excluded}=eligibleComparables(proposed,input.comparables,input.valuationDate);
  const evaluated:EvaluatedComparable[]=[];
  for(const candidate of candidates){
    const adjusted=adjustComparable(input,proposed,candidate.comparable);
    if(adjusted.adjustedPrice<=0||adjusted.grossAdjustmentPercent>40){excluded.push({id:candidate.comparable.id,reason:'Nonpositive adjusted price or gross adjustments above the 40% screening guardrail.'});continue;}
    if(adjusted.grossAdjustmentPercent>25)adjusted.warnings.push('Gross adjustments exceed the 25% review threshold.');
    const a=proposed.condition,b=candidate.comparable.condition;
    const conditionMatch=a===null||b===null?'unknown':a===b?'similar':Number(b.slice(1))<Number(a.slice(1))?'superior':'inferior';
    evaluated.push(scoreComparable(proposed,{...candidate,...adjusted,conditionMatch,scores:{},rawWeight:0,weight:0},input.valuationDate));
  }
  if(evaluated.length>=3){
    const values=evaluated.map(c=>c.adjustedPrice).sort((a,b)=>a-b);
    const median=(values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2;
    const deviations=values.map(value=>Math.abs(value-median)).sort((a,b)=>a-b);
    const mad=(deviations[Math.floor((deviations.length-1)/2)]+deviations[Math.ceil((deviations.length-1)/2)])/2;
    const threshold=Math.max(median*0.35,3*mad);
    for(let i=evaluated.length-1;i>=0;i--)if(Math.abs(evaluated[i].adjustedPrice-median)>threshold){excluded.push({id:evaluated[i].comparable.id,reason:'Adjusted-price outlier exceeds max(35% of median, 3× median absolute deviation); withheld pending market-substitution review.'});evaluated.splice(i,1);}
  }
  let tier=0;while(tier<3&&evaluated.filter(c=>c.tier<=tier).length<4)tier++;
  const ordered=evaluated.filter(c=>c.tier<=tier).sort((a,b)=>b.rawWeight-a.rawWeight||a.comparable.id.localeCompare(b.comparable.id));
  const selected=normalizeWeights(ordered.slice(0,6));
  for(const c of evaluated.filter(c=>!selected.some(s=>s.comparable.id===c.comparable.id)))excluded.push({id:c.comparable.id,reason:'Lower-ranked or outside the earliest sufficient search expansion.'});
  const confidence=confidenceScore(proposed,selected,input.valuationDate,provisional);
  const sufficient=selected.length>=3&&proposed.glaSqFt!==null&&proposed.glaSqFt>0&&proposed.units!==null&&proposed.propertyType!==null;
  if(!sufficient){confidence.level='Insufficient Evidence';confidence.score=Math.min(24,confidence.score);}
  if(selected.some(c=>!proposed.submarket||!c.comparable.submarket))warnings.push('Micro-location/submarket verification is incomplete; proximity alone does not establish buyer substitution.');
  if(proposed.conflicts.length)warnings.push('Subject source conflicts are preserved; primary supplied values were used, not silently resolved.');
  warnings.push(...selected.flatMap(c=>c.warnings));
  if(selected.some(c=>c.unresolved.length))warnings.push('Unresolved characteristics are not assigned invented adjustments. The range is not a statistical prediction interval and does not price all uncertainty.');
  const reconciliation=sufficient?reconcileIndications(selected.map(c=>({value:c.adjustedPrice,weight:c.weight})),confidence.score<60):{conservativeArv:null,likelyArv:null,highArv:null};
  const weak=selected.some(c=>c.comparable.conditionAssessment!=='verified'||c.unresolved.length||c.comparable.conflicts.length||c.adjustments.some(a=>a.confidence<0.6));
  const status:ArvResult['status']=!sufficient?'insufficient-evidence':provisional||weak?'provisional':'final';
  const sources:ArvSource[]=[];const seen=new Set<string>();
  for(const source of [...proposed.sources,...selected.flatMap(c=>[...c.comparable.sources,c.comparable.sale.source,...c.adjustments.map(a=>a.evidence)])]){const key=JSON.stringify(source);if(!seen.has(key)){seen.add(key);sources.push(source);}}
  return validateArvResult({methodologyVersion:METHODOLOGY_VERSION,calibrationVersion:CALIBRATION_VERSION,valuationDate:input.valuationDate,scenarioName:input.scenarioName??null,subject:structuredClone(input.subject),proposed,status,...reconciliation,confidence,comparables:selected,excluded,
    reasoning:[`${selected.length} closed sales selected; search expansion tier ${tier} (0: 0.5mi/6mo, 1: 1mi/6mo, 2: 1.5mi competing area/6mo, 3: up to 12mo).`,
      sufficient?'Likely ARV is the quality-weighted mean of supported adjusted closed prices, rounded to $100. Conservative/high use observed weighted tails; low confidence uses full observed bounds.':'Insufficient credible closed-sale evidence: ARV values withheld.',
      'Weights reflect location, recency, condition, size, layout, type/units, adjustments and source reliability; each indication is capped at 45% when at least three comps exist.',
      'Appraisal-style investment estimate, not a licensed appraisal. Final means no tracked provisional assumptions; it is not professional certification.'],assumptions,warnings:[...new Set(warnings)],sources});
}
