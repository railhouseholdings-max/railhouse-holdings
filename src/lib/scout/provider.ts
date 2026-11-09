import type { ScoutListing, ScoutProvider } from '../../domain/scout.ts';
import { rentCastRequest } from '../rentcast/client.ts';
import { lookupRentCast } from '../rentcast/lookup.ts';
import { calculatorArvInput } from '../arv/application.ts';
import { emptyPropertyDetails } from '../deals/property-details.ts';
import { runArvEstimate } from '../arv/service.ts';
import { propertyIdentity } from './identity.ts';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown)=>typeof v==='string'?v.trim().slice(0,240):'';
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const timestamp=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function normalizeScoutListing(raw:unknown,now:string):ScoutListing|null {
  const r=object(raw);const address=text(r.formattedAddress),city=text(r.city),state=text(r.state),zip=text(r.zipCode),id=text(r.id);
  if(!id||!address||!city||!state||!/^\d{5}$/.test(zip))return null;
  const lat=typeof r.latitude==='number'&&Math.abs(r.latitude)<=90?r.latitude:null,lon=typeof r.longitude==='number'&&Math.abs(r.longitude)<=180?r.longitude:null;
  // RentCast documents Active/Inactive only. Inactive is NOT proof of a sale/pending state.
  return {provider:'RentCast',sourceId:id,address,city,state,zip,latitude:lat,longitude:lon,propertyType:text(r.propertyType)||null,units:null,bedrooms:num(r.bedrooms),bathrooms:num(r.bathrooms),squareFeet:num(r.squareFootage),lotSquareFeet:num(r.lotSize),yearBuilt:num(r.yearBuilt),price:num(r.price),listedAt:timestamp(r.listedDate),lastSeenAt:timestamp(r.lastSeenDate),daysOnMarket:num(r.daysOnMarket),status:r.status==='Active'&&timestamp(r.lastSeenDate)&&Date.parse(now)-Date.parse(String(r.lastSeenDate))<=7*86400000&&Date.parse(String(r.lastSeenDate))<=Date.parse(now)?'Active':r.status==='Inactive'?'Inactive':'Unknown',checkedAt:now,url:null,description:null,photos:[],conflicts:[],sourceReference:`RentCast listings/sale record ${id}`};
}
export function createScoutProvider(options:{region?:{latitude:number;longitude:number;radiusMiles:number}|null;apiKey:string;fetcher:typeof fetch;now:()=>string;taxEstimate?:(address:string,rent:number)=>number|null}):ScoutProvider {
  const get=async(params:URLSearchParams,signal:AbortSignal)=>{
    const raw=await rentCastRequest('listings/sale',params,{apiKey:options.apiKey,fetcher:options.fetcher,signal});
    if(!Array.isArray(raw))throw new Error('Unexpected listing response; discovery was not complete.');
    const rows=raw.map(r=>normalizeScoutListing(r,options.now()));
    if(rows.some(r=>r===null))throw new Error('Listing rows lack identity; discovery checkpoint retained.');
    return rows as ScoutListing[];
  };
  let regional:Promise<ScoutListing[]>|null=null;
  const regionRows=(signal:AbortSignal)=>{
    if(!regional)regional=(async()=>{
      const result:ScoutListing[]=[];const area=options.region!;
      for(let offset=0;;offset+=500){
        const rows=await get(new URLSearchParams({latitude:String(area.latitude),longitude:String(area.longitude),radius:String(area.radiusMiles),propertyType:'Single Family|Multi-Family',status:'Active',limit:'500',offset:String(offset)}),signal);
        result.push(...rows);if(rows.length<500)break;
      }
      return result;
    })();
    return regional;
  };
  return {
    discover:async(city,days,offset,signal)=>options.region
      ?(await regionRows(signal)).filter(r=>r.city===city&&r.state==='IN').slice(offset,offset+500)
      :await get(new URLSearchParams({city,state:'IN',status:'Active',daysOld:`*:${days}`,limit:'500',offset:String(offset)}),signal),
    verify:async(address,signal)=>{
      if(options.region){const regionalMatches=(await regionRows(signal)).filter(r=>propertyIdentity(r.address)===propertyIdentity(address));if(regionalMatches.length)return regionalMatches;}
      // Specific-address retrieval follows the provider's documented query contract.
      return (await get(new URLSearchParams({address}),signal)).filter(r=>propertyIdentity(r.address)===propertyIdentity(address));
    },
    enrich:async(listing,evidence,signal)=>{
      const lookup=await lookupRentCast(listing.address,{apiKey:options.apiKey,fetcher:options.fetcher,signal});
      const input=evidence.arvInput??calculatorArvInput(listing.address,lookup,emptyPropertyDetails(),options.now().slice(0,10));
      const arv=input.comparables.length?await runArvEstimate(input):await runArvEstimate(input,{live:true,apiKey:options.apiKey,fetcher:options.fetcher,signal});
      const annualTaxes=lookup.rent&&!lookup.rent.perUnit?options.taxEstimate?.(listing.address,lookup.rent.monthly):null;
      return {...evidence,lookup,arv,arvInput:undefined,assumptions:{...(annualTaxes!=null?{annualPropertyTaxes:annualTaxes}:{}),...evidence.assumptions}};
    },
  };
}
