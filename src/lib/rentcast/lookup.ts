import type { PropertyFact, RentCastLookup } from '../../domain/property-lookup.ts';
import { isCompletePropertyAddress } from '../../domain/property-lookup.ts';

const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 240) : '';
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const currency = (value: number) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
function normalized(value: string): string {
  const aliases: Record<string,string> = {STREET:'ST',AVENUE:'AVE',ROAD:'RD',DRIVE:'DR',LANE:'LN',COURT:'CT',BOULEVARD:'BLVD',PLACE:'PL',TERRACE:'TER',PARKWAY:'PKWY',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',APARTMENT:'UNIT',APT:'UNIT',SUITE:'UNIT',STE:'UNIT'};
  return value.toUpperCase().replace(/#/g,' UNIT ').replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean).map(word => aliases[word] ?? word).join(' ');
}
// Reject a nearby/ambiguous result rather than silently attach a different home.
function matches(address: string, property: Record<string,unknown>): boolean {
  const formatted = text(property.formattedAddress);
  if (!formatted) return false;
  const parts = address.split(',').map(part => part.trim());
  const separateUnit = parts.length > 3 && /^(?:apt|apartment|unit|suite|ste|#)\s*/i.test(parts[1]);
  const expectedStreet = [parts[0], separateUnit ? parts[1] : ''].filter(Boolean).join(' ');
  const returnedStreet = [text(property.addressLine1) || formatted.split(',')[0], text(property.addressLine2)].filter(Boolean).join(' ');
  if (parts.length > 1 ? normalized(expectedStreet) !== normalized(returnedStreet) : !normalized(address).startsWith(normalized(returnedStreet) + ' ')) return false;
  const zip = address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  if (zip && zip !== (text(property.zipCode) || formatted.match(/\b(\d{5})\s*$/)?.[1])) return false;
  const cityIndex = separateUnit ? 2 : 1;
  if (parts.length >= cityIndex + 2 && text(property.city) && normalized(parts[cityIndex]) !== normalized(text(property.city))) return false;
  if(parts.length===1 && text(property.city) && !normalized(address).includes(' '+normalized(text(property.city))+' ')) return false;
  const state = parts.at(-1)?.match(/^([A-Z]{2})(?:\s|$)/i)?.[1];
  return !state || !text(property.state) || state.toUpperCase() === text(property.state).toUpperCase();
}
function factsFrom(property: Record<string,unknown>): PropertyFact[] {
  const facts: PropertyFact[] = [];
  const addText = (label: string, value: unknown) => {if (text(value)) facts.push({label,value:text(value)});};
  const addNumber = (label: string, value: unknown, suffix = '') => {const parsed=number(value);if(parsed!==null) facts.push({label,value:parsed.toLocaleString('en-US')+suffix});};
  addText('Property type',property.propertyType); addNumber('Bedrooms',property.bedrooms); addNumber('Bathrooms',property.bathrooms);
  addNumber('Living area',property.squareFootage,' sq ft'); addNumber('Lot size',property.lotSize,' sq ft'); addNumber('Year built',property.yearBuilt);
  addText('County',property.county); addText('Parcel ID',property.assessorID); addText('Subdivision',property.subdivision); addText('Zoning',property.zoning);
  const features=object(property.features);
  for (const [key,label] of Object.entries({floorCount:'Stories',unitCount:'Units',roomCount:'Rooms',garageSpaces:'Garage spaces'})) addNumber(label,features[key]);
  for (const [key,label] of Object.entries({architectureType:'Architecture',exteriorType:'Exterior',foundationType:'Foundation',roofType:'Roof',garageType:'Garage type',heatingType:'Heating type',coolingType:'Cooling type',poolType:'Pool type',fireplaceType:'Fireplace type',viewType:'View'})) addText(label,features[key]);
  for (const [key,label] of Object.entries({garage:'Garage',heating:'Heating',cooling:'Cooling',pool:'Pool',fireplace:'Fireplace'})) if(typeof features[key]==='boolean') facts.push({label,value:features[key]?'Yes':'No'});
  const sale=number(property.lastSalePrice);if(sale!==null) facts.push({label:'Last sale price (historical)',value:currency(sale)});
  const saleDate=text(property.lastSaleDate);if(/^\d{4}-\d{2}-\d{2}/.test(saleDate)) facts.push({label:'Last sale date',value:saleDate.slice(0,10)});
  const hoa=number(object(property.hoa).fee);if(hoa!==null) facts.push({label:'HOA / month',value:currency(hoa)});
  for (const [key,label,amountKey] of [['propertyTaxes','Property tax (historical)','total'],['taxAssessments','Assessed value (historical)','value']]) {
    const history=object(property[key]);const year=Object.keys(history).filter(key=>/^\d{4}$/.test(key)).sort().at(-1);
    const amount=year?number(object(history[year])[amountKey]):null;
    if(year && amount!==null) facts.push({label:`${label} · ${year}`,value:currency(amount)});
  }
  return facts;
}
export async function lookupRentCast(address: string, options: { apiKey: string; fetcher?: typeof fetch; signal?: AbortSignal }): Promise<RentCastLookup> {
  if(!isCompletePropertyAddress(address)) throw new Error('Enter a full street address with city and state or ZIP.');
  if(!options.apiKey.trim()) throw new Error('RentCast is not configured.');
  const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const get=async(path:string) => {
    const url=new URL(`https://api.rentcast.io/v1/${path}`);url.searchParams.set('address',address.trim());
    if(path.startsWith('avm/')) {url.searchParams.set('compCount','5');url.searchParams.set('lookupSubjectAttributes','true');}
    const response=await(options.fetcher??fetch)(url,{headers:{Accept:'application/json','X-Api-Key':options.apiKey},cache:'no-store',signal});
    if(!response.ok) throw new Error('RentCast lookup unavailable.');
    return response.json() as Promise<unknown>;
  };
  const [records,estimate]=await Promise.allSettled([get('properties'),get('avm/rent/long-term')]);
  if(options.signal?.aborted) throw new Error('RentCast lookup interrupted.');
  const warnings:string[]=[];
  const rows=records.status==='fulfilled'&&Array.isArray(records.value)?records.value.map(object).filter(row=>matches(address,row)):[];
  let property=rows.length===1?rows[0]:null;
  if(!property) warnings.push('A unique property record was not available for this address.');
  const avm=estimate.status==='fulfilled'?object(estimate.value):{};
  const subject=object(avm.subjectProperty);
  const matchedSubject=matches(address,subject);
  if(!property && matchedSubject) property=subject;
  const monthly=number(avm.rent);
  const perUnit=['Multi-Family','Apartment'].includes(text(property?.propertyType)) || (number(object(property?.features).unitCount)??0)>1;
  const rent=matchedSubject&&monthly!==null&&monthly>0?{monthly,low:number(avm.rentRangeLow),high:number(avm.rentRangeHigh),perUnit,comparableCount:Array.isArray(avm.comparables)?avm.comparables.length:0}:null;
  if(!rent) warnings.push('A rent estimate was not available for this exact address. Enter expected rent manually.');
  if(perUnit && rent) warnings.push('RentCast estimates rent for one unit. Confirm total property rent before calculating.');
  if(!property && !rent) throw new Error('Property details and rent estimate are unavailable. Check the full address or enter values manually.');
  return {source:'RentCast',address:text(property?.formattedAddress)||address.trim(),fetchedAt:new Date().toISOString(),facts:property?factsFrom(property):[],rent,warnings};
}
