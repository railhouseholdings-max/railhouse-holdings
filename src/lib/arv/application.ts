import type { ArvInput, ArvProperty, ArvResult, ArvSource } from '../../domain/arv.ts';
import type { RentCastLookup } from '../../domain/property-lookup.ts';
import { propertyDetailValue, proposedPropertyTotals, type PropertyDetailsDraft } from '../deals/property-details.ts';
import { propertyRecord, addressKey, normalizePropertyType } from './normalization.ts';
import { subjectFromLookup } from './providers.ts';
/** Bridge the existing calculator draft; unknowns stay null, basement never enters GLA. */
export function calculatorArvInput(address:string,data:RentCastLookup|undefined,draft:PropertyDetailsDraft,valuationDate:string):ArvInput {
  const source:ArvSource={provider:'Railhouse user input',recordId:addressKey(address)||'unaddressed-draft',reference:'Calculator Property details: user-supplied corrections and proposed additions',retrievedAt:valuationDate,reliability:0.8,status:'user-supplied'};
  const subject:ArvProperty=data?subjectFromLookup(data):propertyRecord(source.recordId,address,source);
  const mapping={propertyType:'Property type',units:'Units',bedrooms:'Bedrooms',bathrooms:'Bathrooms',glaSqFt:'Living area',lotSqFt:'Lot size',yearBuilt:'Year built',garageSpaces:'Garage spaces',style:'Architecture'} as const;
  for(const [key,label] of Object.entries(mapping)){
    const value=propertyDetailValue(data,draft,label);
    if(!value.trim())continue;
    Object.assign(subject,{[key]:key==='propertyType'?normalizePropertyType(value):key==='style'?value:Number(value.replace(/,/g,''))});
    if(Object.hasOwn(draft.overrides,label))subject.evidence[key as keyof typeof subject.evidence]='user-supplied';
  }
  if(subject.units===null&&subject.propertyType==='Single Family'){subject.units=1;subject.evidence.units='inferred';}
  if(Object.keys(draft.overrides).length)subject.sources.push(source);
  const totals=proposedPropertyTotals(data,draft);
  // The calculator's building-level additions are authoritative here. Unit-level plans
  // remain separate to avoid double-counting common areas or duplicate addition entries.
  const proposed:ArvInput['proposed']={condition:'C3',quality:'Q4'};
  for(const [field,value] of [['bedrooms',totals.bedrooms],['bathrooms',totals.bathrooms],['glaSqFt',totals.squareFeet]] as const)if(value!==null)proposed[field]=value;
  return {subject,proposed,valuationDate,comparables:[],scenarioName:'Calculator proposed renovation'};
}
export function describeArv(result:ArvResult):string {
  if(result.likelyArv===null)return `ARV withheld: ${result.comparables.length} usable closed sales; at least three and a complete type/unit/GLA identity are required. ${result.confidence.reasons.join(' ')}`;
  return `${result.status==='provisional'?'Provisional':'Evidence-complete'} ARV ${result.likelyArv.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}, supported range ${result.conservativeArv!.toLocaleString()}–${result.highArv!.toLocaleString()}. ${result.comparables.length} adjusted closed sales. Confidence ${result.confidence.score}/100 (${result.confidence.level}). ${result.reasoning[1]}`;
}
