import type { ArvInput, ArvProperty, ArvSource, ArvResult, AdjustmentFeature } from '../../domain/arv.ts';
const statuses=['verified','provider-reported','user-supplied','inferred','unavailable'];
const features:AdjustmentFeature[]=['glaSqFt','bathrooms','bedrooms','lotSqFt','garageSpaces','basementUnfinishedSqFt','basementFinishedSqFt','condition','quality','floodZone','marketTime','external'];
export const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown> : {};
function fail(message:string):never {throw new Error(message);}
function string(value:unknown,label:string,limit=500):asserts value is string {if(typeof value!=='string'||!value.trim()||value.length>limit) fail(`Invalid ${label}.`);}
export function validDate(value:unknown):value is string {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function numeric(value:unknown,label:string,min=0,max=1e9) {if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`Invalid ${label}.`);}
export function validateSource(value:unknown):asserts value is ArvSource {
  const v=record(value);string(v.provider,'source provider');string(v.recordId,'source ID');string(v.reference,'source reference',2000);
  if(!validDate(v.retrievedAt))fail('Source retrieval date must be YYYY-MM-DD.');numeric(v.reliability,'source reliability',0,1);
  if(!statuses.includes(String(v.status)))fail('Invalid source evidence status.');
}
export const propertyNumbers=['units','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','basementSqFt','basementFinishedSqFt','latitude','longitude'] as const;
function config(v:Record<string,unknown>,partial=false) {
  for(const field of propertyNumbers) {
    if(partial && !(field in v)) continue;
    if(v[field]===null)continue;
    numeric(v[field],field,field==='latitude'?-90:field==='longitude'?-180:0,field==='latitude'?90:field==='longitude'?180:1e9);
    if(field==='units' && (!Number.isInteger(v[field])||Number(v[field])<1))fail('Legal unit count must be a positive integer or null.');
  }
  for(const [field,prefix] of [['condition','C'],['quality','Q']] as const) {
    if(partial && !(field in v))continue;
    if(v[field]!==null&&!new RegExp(`^${prefix}[1-6]$`).test(String(v[field])))fail(`Invalid ${field}.`);
  }
  if(typeof v.basementSqFt==='number'&&typeof v.basementFinishedSqFt==='number'&&v.basementFinishedSqFt>v.basementSqFt)fail('Finished basement cannot exceed total basement area.');
}
export function validateProperty(value:unknown):asserts value is ArvProperty {
  const v=record(value);const allowed=['id','address','propertyType','units','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','basementSqFt','basementFinishedSqFt','condition','quality','floodZone','style','submarket','latitude','longitude','sources','evidence','conflicts','sale','distanceMiles','competingMarketEvidence','conditionAssessment','manualAdjustments'];if(Object.keys(v).some(key=>!allowed.includes(key)))fail('Unknown property/comparable field.');string(v.id,'property ID',240);string(v.address,'property address',240);config(v);
  for(const field of ['propertyType','floodZone','style','submarket']) if(v[field]!==null)string(v[field],field,240);
  if(!Array.isArray(v.sources)||!v.sources.length||v.sources.length>25)fail('Property needs 1–25 attributable sources.');v.sources.forEach(validateSource);
  if(!v.evidence||typeof v.evidence!=='object'||Array.isArray(v.evidence))fail('Missing field evidence map.');
  for(const state of Object.values(record(v.evidence))) if(!statuses.includes(String(state)))fail('Invalid field evidence status.');
  if(!Array.isArray(v.conflicts)||v.conflicts.length>50)fail('Invalid conflicts.');
  for(const conflict of v.conflicts) {const c=record(conflict);string(c.field,'conflict field');if(!Array.isArray(c.values)||!Array.isArray(c.references)||c.values.length<2||c.values.length>20||c.references.length<1||c.references.length>20)fail('Invalid conflicting evidence.');c.values.forEach(x=>string(x,'conflicting value'));c.references.forEach(x=>string(x,'conflict reference',2000));}
}
export function validateArvInput(value:unknown):ArvInput {
  const v=record(value);if(!validDate(v.valuationDate))fail('Valuation date must be YYYY-MM-DD.');validateProperty(v.subject);
  if(v.scenarioName!==undefined)string(v.scenarioName,'scenario name',120);
  if(v.proposed!==undefined){const p=record(v.proposed);const allowed=['units','bedrooms','bathrooms','glaSqFt','garageSpaces','basementSqFt','basementFinishedSqFt','condition','quality'];if(!Object.keys(p).length||Object.keys(p).some(key=>!allowed.includes(key)))fail('Invalid proposed configuration fields.');config(p,true);config({...v.subject,...p});}
  if(!Array.isArray(v.comparables)||v.comparables.length>500)fail('Supply at most 500 comparable records.');
  for(const comp of v.comparables) {
    validateProperty(comp);const c=record(comp),sale=record(c.sale);
    if(!['closed','active','pending','unknown'].includes(String(sale.status)))fail('Invalid transaction status.');
    if(sale.price!==null)numeric(sale.price,'sale price');if(sale.date!==null&&!validDate(sale.date))fail('Invalid sale date.');
    if(sale.armsLength!==null&&typeof sale.armsLength!=='boolean')fail('Invalid arms-length status.');validateSource(sale.source);
    if(c.distanceMiles!==null)numeric(c.distanceMiles,'distance',0,25000);
    if(c.competingMarketEvidence!==null)string(c.competingMarketEvidence,'competing market evidence',2000);
    if(!['verified','preliminary-photo','description','unknown'].includes(String(c.conditionAssessment)))fail('Invalid comparable condition assessment.');
    if(c.manualAdjustments!==undefined){if(!Array.isArray(c.manualAdjustments)||c.manualAdjustments.length>features.length)fail('Invalid manual adjustments.');const seen=new Set<string>();for(const item of c.manualAdjustments){const a=record(item);if(a.effectiveDate!==undefined&&!validDate(a.effectiveDate))fail('Invalid adjustment effective date.');if(!features.includes(a.feature as AdjustmentFeature)||seen.has(String(a.feature)))fail('Duplicate or invalid manual adjustment feature.');seen.add(String(a.feature));numeric(a.amount,'adjustment amount',-1e9,1e9);numeric(a.confidence,'adjustment confidence',0,1);validateSource(a.evidence);string(a.rationale,'adjustment rationale',2000);if(a.direction!==(Number(a.amount)>0?'up':Number(a.amount)<0?'down':'none'))fail('Adjustment direction disagrees with amount.');for(const key of ['subjectValue','comparableValue'])if(a[key]!==null&&(typeof a[key]!=='string'&&typeof a[key]!=='number'||typeof a[key]==='number'&&!Number.isFinite(a[key])))fail('Invalid adjustment characteristic.');}}
  }
  if(v.settings!==undefined){if(!v.settings||typeof v.settings!=='object'||Array.isArray(v.settings))fail('Invalid settings.');const s=record(v.settings);if(s.rates!==undefined&&(!s.rates||typeof s.rates!=='object'||Array.isArray(s.rates)))fail('Invalid adjustment rates.');for(const key of ['historicalEbyScope','independentBedroomEvidence'])if(s[key]!==undefined)string(s[key],key,2000);for(const key of ['glaMaterialitySqFt','lotMaterialitySqFt'])if(s[key]!==undefined)numeric(s[key],key,0,10000);for(const [key,value] of Object.entries(record(s.rates))){if(!features.includes(key as AdjustmentFeature))fail('Unknown adjustment rate.');const rate=record(value);if(rate.effectiveDate!==undefined&&!validDate(rate.effectiveDate))fail('Invalid rate effective date.');numeric(rate.value,'adjustment rate',key==='marketTime'?-50:0,key==='marketTime'?100:1e6);numeric(rate.confidence,'rate confidence',0,1);validateSource(rate.evidence);string(rate.rationale,'rate rationale',2000);if(!['current-market','eby-historical'].includes(String(rate.basis)))fail('Invalid rate basis.');}}
  return value as ArvInput;
}
export function validateArvResult(result:ArvResult):ArvResult {
  const {conservativeArv:lo,likelyArv:mid,highArv:hi}=result;
  if(result.status==='insufficient-evidence'){if(lo!==null||mid!==null||hi!==null)fail('Insufficient evidence must not return numeric ARV.');}
  else if(lo===null||mid===null||hi===null||![lo,mid,hi].every(Number.isFinite)||lo<0||lo>mid||mid>hi)fail('Invalid ARV reconciliation.');
  numeric(result.confidence.score,'confidence score',0,100);
  if(result.comparables.length && Math.abs(result.comparables.reduce((sum,c)=>sum+c.weight,0)-1)>1e-8)fail('Comparable weights must normalize to 1.');
  if(!result.sources.length)fail('Missing valuation sources.');
  return result;
}
