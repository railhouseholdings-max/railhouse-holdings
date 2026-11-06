import type { RentCastLookup } from '../../domain/property-lookup.ts';

export const PROPERTY_DETAIL_FIELDS = [
  {label:'Property type',type:'text',unit:''},
  {label:'Bedrooms',type:'number',unit:'',step:1},
  {label:'Bathrooms',type:'number',unit:'',step:0.25},
  {label:'Living area',type:'number',unit:'sq ft',step:1},
  {label:'Lot size',type:'number',unit:'sq ft',step:1},
  {label:'Year built',type:'number',unit:'',step:1},
] as const;
export interface PropertyDetailsDraft {
  overrides: Record<string,string>;
  additions: {bedrooms:string;bathrooms:string;squareFeet:string};
}
export function emptyPropertyDetails(): PropertyDetailsDraft {
  return {overrides:{},additions:{bedrooms:'0',bathrooms:'0',squareFeet:'0'}};
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
