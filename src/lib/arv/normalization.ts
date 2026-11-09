import type { ArvProperty, ArvSource } from '../../domain/arv.ts';
export function normalizePropertyType(value:string|null):string|null {
  if(!value)return null;const text=value.toLowerCase().replace(/[^a-z]/g,'');
  if(['singlefamily','singlefamilyresidence','sfr'].includes(text))return 'Single Family';
  if(['multifamily','duplex','triplex','fourplex','quadplex'].includes(text))return 'Multi-Family';
  return ({apartment:'Apartment',condo:'Condo',condominium:'Condo',townhouse:'Townhouse',manufactured:'Manufactured'} as Record<string,string>)[text]??value.trim();
}
export function propertyRecord(id:string,address:string,source:ArvSource,fields:Partial<ArvProperty>={}):ArvProperty {
  return {id,address,propertyType:null,units:null,bedrooms:null,bathrooms:null,glaSqFt:null,lotSqFt:null,yearBuilt:null,garageSpaces:null,basementSqFt:null,basementFinishedSqFt:null,condition:null,quality:null,floodZone:null,style:null,submarket:null,latitude:null,longitude:null,sources:[source],evidence:{},conflicts:[],...fields,};
}
export function reconcilePropertyEvidence(primary:ArvProperty,other:ArvProperty):ArvProperty {
  const result=structuredClone(primary);
  for(const field of ['units','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','basementSqFt','basementFinishedSqFt','condition','quality','floodZone','style','submarket','propertyType'] as const){
    if(primary[field]===null && other[field]!==null){Object.assign(result,{[field]:other[field]});result.evidence[field]=other.evidence[field]??'provider-reported';}
    else if(primary[field]!==null&&other[field]!==null&&primary[field]!==other[field])result.conflicts.push({field,values:[String(primary[field]),String(other[field])],references:[...primary.sources,...other.sources].map(s=>s.reference)});
  }
  result.sources=[...primary.sources,...other.sources];return result;
}
export function distanceMiles(a:ArvProperty,b:ArvProperty):number|null {
  if(a.latitude===null||a.longitude===null||b.latitude===null||b.longitude===null)return null;
  const rad=(x:number)=>x*Math.PI/180;const dLat=rad(b.latitude-a.latitude),dLon=rad(b.longitude-a.longitude);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 3958.7613*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export const daysBetween=(later:string,earlier:string)=>(Date.parse(later+'T00:00:00Z')-Date.parse(earlier+'T00:00:00Z'))/86400000;
export const cents=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function addressKey(address:string):string {
  const aliases:Record<string,string>={AVENUE:'AVE',STREET:'ST',ROAD:'RD',DRIVE:'DR',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',LANE:'LN',COURT:'CT',BOULEVARD:'BLVD'};
  return address.toUpperCase().replace(/[^A-Z0-9]/g,' ').split(/\s+/).filter(Boolean).map(part=>aliases[part]??part).join(' ');
}
