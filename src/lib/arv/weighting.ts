import type { ArvProperty, EvaluatedComparable } from '../../domain/arv.ts';
import { daysBetween } from './normalization.ts';
export const WEIGHT_FACTORS={location:25,recency:15,condition:15,size:15,layout:5,typeAndUnits:5,adjustments:10,source:10} as const;
export function scoreComparable(subject:ArvProperty,c:EvaluatedComparable,date:string) {
  const p=c.comparable;
  const condition=p.condition&&subject.condition?p.condition===subject.condition?1:0.45:0.25;
  const scores={
    location:Math.max(0.15,1-c.distanceMiles/2)*(subject.submarket&&p.submarket?1:0.85),
    recency:Math.max(0.15,1-daysBetween(date,p.sale.date!)/450),
    condition:condition*(p.conditionAssessment==='preliminary-photo'?0.7:p.conditionAssessment==='description'?0.8:p.conditionAssessment==='unknown'?0.5:1),
    size:Math.max(0.1,1-Math.abs(subject.glaSqFt!-p.glaSqFt!)/subject.glaSqFt!),
    layout:subject.bedrooms!==null&&p.bedrooms!==null&&subject.bathrooms!==null&&p.bathrooms!==null?1/(1+Math.abs(subject.bedrooms-p.bedrooms)*0.25+Math.abs(subject.bathrooms-p.bathrooms)*0.5):0.3,
    typeAndUnits:1,
    adjustments:Math.max(0.1,1-c.grossAdjustmentPercent/50)/(1+c.unresolved.length*0.1),
    source:p.sale.source.reliability*(p.sale.armsLength===null?0.8:1)*(p.conflicts.length?0.65:1),
  };
  const rawWeight=Object.entries(WEIGHT_FACTORS).reduce((sum,[key,weight])=>sum+scores[key as keyof typeof scores]*weight/100,0);
  return {...c,scores,rawWeight};
}
export function normalizeWeights(comps:EvaluatedComparable[]):EvaluatedComparable[] {
  if(!comps.length)return [];
  const cap=comps.length>=3?0.45:1;
  const result=comps.map(c=>({...c,weight:0}));let remaining=result.map((_,i)=>i),budget=1;
  while(remaining.length){
    const denominator=remaining.reduce((sum,i)=>sum+result[i].rawWeight,0);
    const capped=remaining.filter(i=>budget*(denominator?result[i].rawWeight/denominator:1/remaining.length)>cap);
    if(!capped.length){for(const i of remaining)result[i].weight=budget*(denominator?result[i].rawWeight/denominator:1/remaining.length);break;}
    for(const i of capped){result[i].weight=cap;budget-=cap;}remaining=remaining.filter(i=>!capped.includes(i));
  }
  return result;
}
