import type { ArvComparable, ArvProperty } from '../../domain/arv.ts';
import { addressKey, daysBetween, distanceMiles, normalizePropertyType } from './normalization.ts';
export function eligibleComparables(subject:ArvProperty,comps:ArvComparable[],valuationDate:string) {
  const excluded:{id:string;reason:string}[]=[];const candidates:{comparable:ArvComparable;distanceMiles:number;tier:number}[]=[];
  const ids=new Set<string>();
  const seen=new Map<string,ArvComparable>();
  const ordered=[...comps].sort((a,b)=>(b.sale.date??'').localeCompare(a.sale.date??'')||b.sale.source.reliability-a.sale.source.reliability||a.id.localeCompare(b.id));
  for(const comparable of ordered){
    const comp=structuredClone(comparable);const age=comp.sale.date?daysBetween(valuationDate,comp.sale.date):Infinity;
    const distance=distanceMiles(subject,comp)??comp.distanceMiles;
    let reason='';
    if(comp.id===subject.id||addressKey(comp.address)===addressKey(subject.address))reason='Subject property is not its own comparable.';
    else if(comp.sale.status!=='closed')reason='Not a verified/provider-reported closed sale; asking prices are context only.';
    else if(!comp.sale.price||!comp.sale.date||['unavailable','inferred'].includes(comp.sale.source.status)||comp.sale.source.reliability<0.5)reason='Closed price/date or reliable sale source unavailable.';
    else if(age<0||age>365)reason='Sale is after valuation date or older than 12 months.';
    else if(comp.sale.armsLength===false)reason='Non-arms-length transaction.';
    else if(!subject.propertyType||normalizePropertyType(comp.propertyType)!==normalizePropertyType(subject.propertyType))reason='Different or unknown property type.';
    else if(subject.units===null||comp.units!==subject.units)reason='Different or unknown legal unit count.';
    else if(!comp.glaSqFt||!subject.glaSqFt||comp.glaSqFt/subject.glaSqFt<0.5||comp.glaSqFt/subject.glaSqFt>2)reason='GLA missing or outside the 0.5–2× substitution guardrail.';
    else if(distance===null||distance>1.5)reason='Distance unavailable or beyond the 1.5-mile search boundary.';
    else if(subject.submarket&&comp.submarket&&subject.submarket.toLowerCase()!==comp.submarket.toLowerCase()&&!comp.competingMarketEvidence)reason='Different submarket without evidence of buyer substitution.';
    else if(distance>1&&!(subject.submarket&&comp.submarket&&subject.submarket.toLowerCase()===comp.submarket.toLowerCase())&&!comp.competingMarketEvidence)reason='Expansion beyond 1 mile requires competing-market evidence.';
    if(reason){excluded.push({id:comp.id,reason});continue;}
    if(ids.has(comp.id)&&!seen.has(addressKey(comp.address))){excluded.push({id:comp.id,reason:'Duplicate record identifier for different properties; ambiguous identity.'});continue;}
    ids.add(comp.id);
    const key=addressKey(comp.address);
    const prior=seen.get(key);
    if(prior){
      if(prior.sale.date===comp.sale.date&&prior.sale.price!==comp.sale.price)prior.conflicts.push({field:'sale.price',values:[String(prior.sale.price),String(comp.sale.price)],references:[prior.sale.source.reference,comp.sale.source.reference]});
      prior.sources.push(...comp.sources);excluded.push({id:comp.id,reason:'Duplicate property/transaction; one indication per property. Conflicting same-date prices are retained as a conflict on the selected record.'});continue;
    }
    seen.set(key,comp);candidates.push({comparable:comp,distanceMiles:distance!,tier:age>183?3:distance!<=0.5?0:distance!<=1?1:2});
  }
  return {candidates,excluded};
}
