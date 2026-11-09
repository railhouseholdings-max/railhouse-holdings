import type { ArvComparable, ArvProperty, ArvSource } from '../../domain/arv.ts';
import type { RentCastLookup } from '../../domain/property-lookup.ts';
import { rentCastRequest, type RentCastRequestOptions } from '../rentcast/client.ts';
import { lookupRentCast } from '../rentcast/lookup.ts';
import { propertyRecord, normalizePropertyType, addressKey, distanceMiles } from './normalization.ts';
import { record, validDate } from './validation.ts';
export interface ComparableSearch {radiusMiles:number;months:6|12;valuationDate:string}
export interface ArvDataProvider {
  name:string;
  subject(address:string):Promise<ArvProperty>;
  discover(subject:ArvProperty,search:ComparableSearch):Promise<ArvComparable[]>;
}
const num=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const txt=(x:unknown)=>typeof x==='string'&&x.trim()?x.trim():null;
export function subjectFromLookup(data:RentCastLookup):ArvProperty {
  const value=(label:string)=>data.facts.find(f=>f.label===label)?.value??'';
  const amount=(label:string)=>{const text=value(label).replace(/,/g,'').replace(/\s*sq ft$/,'');return text.trim()!==''&&Number.isFinite(Number(text))?Number(text):null;};
  const source:ArvSource={provider:data.source,recordId:addressKey(data.address),reference:data.sourceReference??(data.source==='RentCast'?'https://developers.rentcast.io/reference/property-records':'Google Sheets imported property facts'),retrievedAt:data.fetchedAt.slice(0,10),reliability:data.source==='RentCast'?0.75:0.65,status:data.source==='RentCast'?'provider-reported':'user-supplied'};
  const type=normalizePropertyType(value('Property type'));
  const p=propertyRecord(source.recordId,data.address,source,{propertyType:type,units:amount('Units')??(type==='Single Family'?1:null),bedrooms:amount('Bedrooms'),bathrooms:amount('Bathrooms'),glaSqFt:amount('Living area'),lotSqFt:amount('Lot size'),yearBuilt:amount('Year built'),garageSpaces:amount('Garage spaces'),style:value('Architecture')||null,latitude:data.coordinates?.latitude??null,longitude:data.coordinates?.longitude??null});
  for(const key of ['units','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','style','latitude','longitude'] as const) if(p[key]!==null)p.evidence[key]=source.status;
  if(amount('Units')===null&&p.units===1)p.evidence.units='inferred';return p;
}
export function normalizeRentCastProperty(raw:unknown,retrievedAt:string):ArvProperty|null {
  const r=record(raw);const address=txt(r.formattedAddress);if(!address)return null;
  const id=txt(r.id)??addressKey(address);const source:ArvSource={provider:'RentCast',recordId:id,reference:`https://api.rentcast.io/v1/properties?${new URLSearchParams({address})}`,retrievedAt,reliability:0.75,status:'provider-reported'};
  const f=record(r.features);const type=normalizePropertyType(txt(r.propertyType));
  const p=propertyRecord(id,address,source,{propertyType:type,units:num(f.unitCount)??(type==='Single Family'?1:null),bedrooms:num(r.bedrooms),bathrooms:num(r.bathrooms),glaSqFt:num(r.squareFootage),lotSqFt:num(r.lotSize),yearBuilt:num(r.yearBuilt),garageSpaces:num(f.garageSpaces),style:txt(f.architectureType),latitude:typeof r.latitude==='number'&&Number.isFinite(r.latitude)&&Math.abs(r.latitude)<=90?r.latitude:null,longitude:typeof r.longitude==='number'&&Number.isFinite(r.longitude)&&Math.abs(r.longitude)<=180?r.longitude:null});
  for(const key of ['propertyType','units','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','style','latitude','longitude'] as const) if(p[key]!==null)p.evidence[key]='provider-reported';
  if(num(f.unitCount)===null&&p.units===1)p.evidence.units='inferred';return p;
}
export function normalizeRentCastSales(payload:unknown,subject:ArvProperty,retrievedAt:string):ArvComparable[] {
  if(!Array.isArray(payload))throw new Error('Invalid RentCast property-record response.');
  return payload.flatMap(raw=>{
    const r=record(raw);const property=normalizeRentCastProperty(raw,retrievedAt);if(!property)return [];
    // Only documented recorded-sale fields. Listing price/status are never substituted.
    const price=num(r.lastSalePrice);const date=txt(r.lastSaleDate)?.slice(0,10)??null;
    if(price===null||price<=0||!validDate(date))return [];
    return [{...property,sale:{status:'closed' as const,price,date,armsLength:null,source:property.sources[0]},distanceMiles:distanceMiles(subject,property),competingMarketEvidence:null,conditionAssessment:'unknown' as const}];
  });
}
export function createRentCastArvProvider(options:RentCastRequestOptions):ArvDataProvider {
  return {name:'RentCast recorded sales',
    async subject(address){return subjectFromLookup(await lookupRentCast(address,options));},
    async discover(subject,search){
      if(subject.latitude===null||subject.longitude===null)throw new Error('Verified subject coordinates are required for nearby sale discovery.');
      const params=new URLSearchParams({latitude:String(subject.latitude),longitude:String(subject.longitude),radius:String(search.radiusMiles),saleDateRange:String(search.months===6?183:365),limit:'50',offset:'0'});
      const type=normalizePropertyType(subject.propertyType);if(type)params.set('propertyType',type);
      const data=await rentCastRequest('properties',params,options);
      return normalizeRentCastSales(data,subject,new Date().toISOString().slice(0,10));
    },
  };
}
export function fixtureProvider(subject:ArvProperty,comparables:ArvComparable[]):ArvDataProvider {
  return {name:'Supplied offline records',subject:async()=>structuredClone(subject),discover:async()=>structuredClone(comparables)};
}
