import type { RentCastLookup } from '../../domain/property-lookup.ts';

export const PROPERTY_DETAIL_FIELDS = [
  {label:'Property type',type:'text',unit:''},
  {label:'Units',type:'number',unit:'',step:1},
  {label:'Bedrooms',type:'number',unit:'',step:1},
  {label:'Bathrooms',type:'number',unit:'',step:0.25},
  {label:'Living area',type:'number',unit:'sq ft',step:1},
  {label:'Lot size',type:'number',unit:'sq ft',step:1},
  {label:'Year built',type:'number',unit:'',step:1},
] as const;
export interface PropertyDetailsDraft {
  units?: PropertyUnitDraft[];
  overrides: Record<string,string>;
  additions: {bedrooms:string;bathrooms:string;squareFeet:string};
}
export function emptyPropertyDetails(): PropertyDetailsDraft {
  return {units:undefined,overrides:{},additions:{bedrooms:'0',bathrooms:'0',squareFeet:'0'}};
}
export function propertyDetailValue(data: RentCastLookup | undefined, draft: PropertyDetailsDraft, label: string): string {
  if (Object.hasOwn(draft.overrides,label)) return draft.overrides[label];
  const source=data?.facts.find(fact=>fact.label===label)?.value??'';
  const numeric=PROPERTY_DETAIL_FIELDS.some(field=>field.label===label && field.type==='number');
  return numeric?source.replace(/,/g,'').replace(/\s*sq ft$/,''):source;
}
function proposedValue(current: string, additional: string): number | null {
  if(current.trim()==='') return null;
  const base=Number(current), added=additional.trim()===''?0:Number(additional);
  return [base,added].every(value=>Number.isFinite(value)&&value>=0&&value<=1e9)?Math.round((base+added)*100)/100:null;
}
export function proposedPropertyTotals(data: RentCastLookup | undefined, draft: PropertyDetailsDraft) {
  return {
    bedrooms:proposedValue(propertyDetailValue(data,draft,'Bedrooms'),draft.additions.bedrooms),
    bathrooms:proposedValue(propertyDetailValue(data,draft,'Bathrooms'),draft.additions.bathrooms),
    squareFeet:proposedValue(propertyDetailValue(data,draft,'Living area'),draft.additions.squareFeet),
  };
}

export interface PropertyUnitDraft {
  id:string;
  name:string;
  status:'existing'|'proposed';
  bedrooms:string;
  bathrooms:string;
  squareFeet:string;
  monthlyRent:string;
  additions:PropertyDetailsDraft['additions'];
}
export function emptyPropertyUnit(id:string,name:string,status:'existing'|'proposed'='existing'):PropertyUnitDraft {
  return {id,name,status,bedrooms:'',bathrooms:'',squareFeet:'',monthlyRent:'',additions:{bedrooms:'0',bathrooms:'0',squareFeet:'0'}};
}
export function isMultifamilyProperty(data:RentCastLookup|undefined,draft:PropertyDetailsDraft):boolean {
  return /multi|apartment|duplex|triplex|fourplex|quadplex/i.test(propertyDetailValue(data,draft,'Property type')) || Number(propertyDetailValue(data,draft,'Units'))>1 || Boolean(draft.units?.length);
}
export function propertyUnits(data:RentCastLookup|undefined,draft:PropertyDetailsDraft):PropertyUnitDraft[] {
  if(draft.units) return draft.units;
  const count=Number(propertyDetailValue(data,draft,'Units'));
  // Seed blank unit rows only when the provider/user explicitly supplies a small count.
  // Large buildings can be entered incrementally without rendering hundreds of fields.
  return isMultifamilyProperty(data,draft)&&Number.isInteger(count)&&count>0&&count<=12
    ? Array.from({length:count},(_,index)=>emptyPropertyUnit(`unit-${index+1}`,`Unit ${index+1}`)) : [];
}
export function unitProposedTotals(unit:PropertyUnitDraft) {
  return {bedrooms:proposedValue(unit.bedrooms,unit.additions.bedrooms),bathrooms:proposedValue(unit.bathrooms,unit.additions.bathrooms),squareFeet:proposedValue(unit.squareFeet,unit.additions.squareFeet)};
}
export function hasPropertyAdditions(additions:PropertyDetailsDraft['additions']):boolean {
  return Object.values(additions).some(value=>value.trim()!=='' && Number(value)!==0);
}
export function totalUnitRent(units:PropertyUnitDraft[]):number|null {
  if(!units.length || units.some(unit=>unit.monthlyRent.trim()==='' || !Number.isFinite(Number(unit.monthlyRent)) || Number(unit.monthlyRent)<0)) return null;
  return Math.round(units.reduce((sum,unit)=>sum+Number(unit.monthlyRent),0)*100)/100;
}
