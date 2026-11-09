import type { ArvProperty, EvaluatedComparable, ArvResult } from '../../domain/arv.ts';
import { daysBetween } from './normalization.ts';
export function confidenceScore(subject:ArvProperty,comps:EvaluatedComparable[],date:string,provisional:boolean):ArvResult['confidence'] {
  const avg=(f:(c:EvaluatedComparable)=>number)=>comps.length?comps.reduce((sum,c)=>sum+f(c),0)/comps.length:0;
  const mean=avg(c=>c.adjustedPrice);const dispersion=mean?Math.sqrt(avg(c=>(c.adjustedPrice-mean)**2))/mean:1;
  const important=['units','bedrooms','bathrooms','glaSqFt','lotSqFt','garageSpaces','basementSqFt','basementFinishedSqFt','condition','quality','floodZone','submarket'] as const;
  const evidenceValue=(value:string|undefined)=>value==='verified'?1:value==='provider-reported'?0.85:value==='user-supplied'?0.8:value==='inferred'?0.35:0;
  const completeness=important.reduce((sum,key)=>sum+(subject[key]!==null?evidenceValue(subject.evidence[key]):0),0)/important.length;
  const factors=[
    {name:'Usable closed sales',score:Math.min(1,comps.length/5),weight:15},
    {name:'Location',score:avg(c=>c.scores.location),weight:15},
    {name:'Recency',score:avg(c=>Math.max(0,1-daysBetween(date,c.comparable.sale.date!)/365)),weight:10},
    {name:'Condition evidence',score:avg(c=>c.scores.condition),weight:15},
    {name:'Subject completeness',score:completeness,weight:10},
    {name:'Adjustment support',score:avg(c=>c.scores.adjustments*(c.adjustments.length?c.adjustments.reduce((sum,a)=>sum+a.confidence*a.evidence.reliability,0)/c.adjustments.length:1)),weight:15},
    {name:'Agreement',score:Math.max(0,1-dispersion/0.25),weight:10},
    {name:'Source reliability',score:avg(c=>c.scores.source),weight:10},
  ];
  let score=Math.round(factors.reduce((sum,f)=>sum+f.score*f.weight,0));const reasons:string[]=[];
  if(provisional){score=Math.min(score,69);reasons.push('Proposed finish/layout includes unverified or provisional assumptions.');}
  if(comps.some(c=>c.comparable.conditionAssessment!=='verified')){score=Math.min(score,69);reasons.push('Condition descriptions or photographs are preliminary, not verified UAD inspections.');}
  if(comps.length<4){score=Math.min(score,59);reasons.push('Fewer than four usable closed sales.');}
  if(comps.some(c=>c.unresolved.length)){score=Math.min(score,59);reasons.push('Material differences or missing characteristics remain unpriced.');}
  if(comps.every(c=>c.conditionMatch==='unknown')){score=Math.min(score,39);reasons.push('No selected sale has known comparable condition.');}
  if(subject.conflicts.length||comps.some(c=>c.comparable.conflicts.length)){score=Math.min(score,49);reasons.push('Conflicting property or transaction evidence requires review.');}
  if(comps.some(c=>c.adjustments.some(a=>a.confidence<0.6||a.evidence.reliability<0.6))){score=Math.min(score,59);reasons.push('Weak or historical adjustment evidence limits valuation confidence.');}
  if(comps.length<3){score=Math.min(score,24);reasons.push('At least three credible closed sales are required for a numeric ARV.');}
  return {score,level:comps.length<3?'Insufficient Evidence':score>=80?'High':score>=60?'Medium':'Low',factors,reasons};
}
