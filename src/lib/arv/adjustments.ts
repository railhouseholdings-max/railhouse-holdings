import type { AdjustmentFeature, AdjustmentRate, ArvAdjustment, ArvComparable, ArvInput, ArvProperty, ArvSource } from '../../domain/arv.ts';
import { historicalEbyRates, EBY_CALIBRATION } from './calibration.ts';
import { cents, daysBetween } from './normalization.ts';
const MATERIALITY:ArvSource={provider:'Railhouse methodology',recordId:'materiality-v1',reference:'docs/arv-estimator.md#adjustments',retrievedAt:'2026-11-09',reliability:1,status:'inferred'};
export function adjustComparable(input:ArvInput,subject:ArvProperty,comp:ArvComparable) {
  const adjustments:ArvAdjustment[]=[];const unresolved:string[]=[];const warnings:string[]=[];
  const settings=input.settings??{};
  const historical=input.valuationDate>=EBY_CALIBRATION.valuationDate&&Boolean(settings.historicalEbyScope?.trim())&&subject.propertyType==='Single Family'&&subject.units===1&&/fort wayne/i.test(subject.address);
  if(settings.historicalEbyScope&&!historical)warnings.push('Eby historical rates are outside the confirmed single-family Fort Wayne scope and were not used.');
  const rates={...(historical?historicalEbyRates():{}),...settings.rates};
  const manual=new Map((comp.manualAdjustments??[]).map(a=>[a.feature,a]));
  const add=(feature:AdjustmentFeature,subjectValue:string|number|null,comparableValue:string|number|null,difference:number|null,options:{immaterial?:boolean;historicalAllowed?:boolean}={})=>{
    const override=manual.get(feature);
    if(override){if((override.effectiveDate??override.evidence.retrievedAt)>input.valuationDate||['unavailable','inferred'].includes(override.evidence.status)||override.confidence<0.5||override.evidence.reliability<0.5){unresolved.push(`${feature}: manual adjustment support is unavailable, inferred, too weak or effective after the valuation date`);return;}adjustments.push({...override,subjectValue,comparableValue});return;}
    if(difference===null){unresolved.push(`${feature}: characteristic or evidence missing`);return;}
    if(difference===0)return;
    if(options.immaterial){adjustments.push({feature,subjectValue,comparableValue,amount:0,direction:'none',evidence:MATERIALITY,rationale:'Difference within configured materiality threshold; no adjustment.',confidence:0.6});return;}
    const rate:AdjustmentRate|undefined=rates[feature];
    if(!rate||['unavailable','inferred'].includes(rate.evidence.status)||rate.evidence.reliability<0.5||rate.confidence===0||rate.value===0||(rate.effectiveDate??rate.evidence.retrievedAt)>input.valuationDate||(rate.basis==='current-market'&&rate.confidence<0.5)||(rate.basis==='eby-historical'&&(!historical||options.historicalAllowed===false||historicalEbyRates()[feature]?.value!==rate.value))){unresolved.push(`${feature}: no supported adjustment rate`);return;}
    if(feature==='bedrooms'&&!settings.independentBedroomEvidence){unresolved.push('bedrooms: independent evidence required to avoid double-counting GLA');return;}
    const amount=cents(feature==='marketTime'?comp.sale.price!*(Math.pow(1+rate.value/100,difference/365.25)-1):difference*rate.value);
    adjustments.push({feature,subjectValue,comparableValue,amount,direction:amount>0?'up':amount<0?'down':'none',evidence:rate.evidence,rationale:rate.rationale+(rate.basis==='eby-historical'?` Scope confirmed: ${settings.historicalEbyScope}`:''),confidence:rate.confidence});
    if(rate.basis==='eby-historical')warnings.push(`${feature}: historical Eby fallback; not independently current-market-supported.`);
  };
  const delta=(a:number|null,b:number|null)=>a===null||b===null?null:a-b;
  const gla=delta(subject.glaSqFt,comp.glaSqFt);add('glaSqFt',subject.glaSqFt,comp.glaSqFt,gla,{immaterial:gla!==null&&Math.abs(gla)<=(settings.glaMaterialitySqFt??75)});
  const lot=delta(subject.lotSqFt,comp.lotSqFt);add('lotSqFt',subject.lotSqFt,comp.lotSqFt,lot,{immaterial:lot!==null&&Math.abs(lot)<=(settings.lotMaterialitySqFt??0)});
  const baths=delta(subject.bathrooms,comp.bathrooms);add('bathrooms',subject.bathrooms,comp.bathrooms,baths===null?null:baths/0.5,{historicalAllowed:baths!==null&&Math.abs(baths)===0.5});
  const garage=delta(subject.garageSpaces,comp.garageSpaces);add('garageSpaces',subject.garageSpaces,comp.garageSpaces,garage,{historicalAllowed:garage!==null&&Math.abs(garage)===1});
  if(subject.bedrooms===null||comp.bedrooms===null)unresolved.push('bedrooms: current/proposed or comparable characteristic missing');
  if(subject.bedrooms!==null&&comp.bedrooms!==null&&subject.bedrooms!==comp.bedrooms){if(settings.independentBedroomEvidence)add('bedrooms',subject.bedrooms,comp.bedrooms,subject.bedrooms-comp.bedrooms,{historicalAllowed:false});else warnings.push('Bedroom difference not separately adjusted; no independent evidence beyond GLA.');}
  add('basementFinishedSqFt',subject.basementFinishedSqFt,comp.basementFinishedSqFt,delta(subject.basementFinishedSqFt,comp.basementFinishedSqFt),{historicalAllowed:false});
  const unfinished=(p:ArvProperty)=>p.basementSqFt===null||p.basementFinishedSqFt===null?null:p.basementSqFt-p.basementFinishedSqFt;
  add('basementUnfinishedSqFt',unfinished(subject),unfinished(comp),delta(unfinished(subject),unfinished(comp)),{historicalAllowed:false});
  for(const field of ['condition','quality'] as const){const a=subject[field],b=comp[field];add(field,a,b,a===null||b===null?null:Number(b.slice(1))-Number(a.slice(1)),{historicalAllowed:false});}
  const sf=subject.floodZone?.toUpperCase()??null,cf=comp.floodZone?.toUpperCase()??null;
  add('floodZone',sf,cf,sf===null||cf===null?null:sf===cf?0:sf==='AE'&&cf==='X'?-1:sf==='X'&&cf==='AE'?1:null);
  const age=daysBetween(input.valuationDate,comp.sale.date!);
  if(age>90||manual.has('marketTime')||rates.marketTime)add('marketTime',input.valuationDate,comp.sale.date,age);
  const external=manual.get('external');if(external)add('external',external.subjectValue,external.comparableValue,1,{historicalAllowed:false});
  if(subject.style&&comp.style&&subject.style.toLowerCase()!==comp.style.toLowerCase())unresolved.push('Architectural style/utility difference requires review; no automatic dollar adjustment.');
  for(const field of ['units','propertyType','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','basementSqFt','basementFinishedSqFt','condition','quality','floodZone','style'] as const){if(comp[field]===null)unresolved.push(`${field}: comparable characteristic missing`);else if(!comp.evidence[field]||comp.evidence[field]==='unavailable'||comp.evidence[field]==='inferred')unresolved.push(`${field}: field-level evidence unavailable or inferred`);}
  if(comp.conditionAssessment==='preliminary-photo')warnings.push('Photo-based condition assessment is preliminary, not an official UAD grade.');
  if(comp.sale.armsLength===null)warnings.push('Arms-length transaction status not verified.');
  const net=cents(adjustments.reduce((sum,a)=>sum+a.amount,0));const gross=cents(adjustments.reduce((sum,a)=>sum+Math.abs(a.amount),0));
  return {adjustments,unresolved:[...new Set(unresolved)],warnings,netAdjustment:net,netAdjustmentPercent:net/comp.sale.price!*100,grossAdjustmentPercent:gross/comp.sale.price!*100,adjustedPrice:cents(comp.sale.price!+net)};
}
