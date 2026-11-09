import { propertyAddedDate } from '../deals/feed-presentation';
import 'server-only';
import type { DealAnalysis, Property } from '../../domain/models';
import type { RentCastLookup } from '../../domain/property-lookup';
import type { PropertyDetailsDraft } from '../deals/property-details';
import type { PropertyReview, ScoutConfig, ScoutEvaluation, ScoutListing } from '../../domain/scout';
import { cloudConfig,dataMode,UUID_PATTERN } from '../config/cloud';
import { requireOwner } from '../cloud/session';
import { restRequest } from '../cloud/http';
import { fromDealRow,type DbRow } from '../persistence/deal-records';
import { mockDeals,mockProperties } from './mock';
import { propertyIdentity } from '../scout/identity';
import { DEFAULT_SCOUT_CONFIG } from '../scout/config';
export interface FeedProperty {
  ownership?:{purchaseDate?:string;purchasePrice?:number;recordedAt?:string;source?:string};review:Partial<PropertyReview>;id:string;address:string;city:string;state:string;zip:string;lifecycle:'owned'|'prospect';
  newMarkedAt?:string|null;addedDate?:string|null;firstViewedAt?:string|null;visible?:boolean;facts?:Record<string,string>;updatedAt:string;propertyRevision:number;details:{draft?:PropertyDetailsDraft;lookup?:RentCastLookup};
  listing:ScoutListing|null;evaluation:ScoutEvaluation|null;deal:DealAnalysis|null;
}
export async function listPropertyFeed():Promise<FeedProperty[]> {
  if(dataMode()==='demo'){
    const entries=new Map<string,FeedProperty>();
    for(const p of mockProperties)entries.set(propertyIdentity(`${p.address}, ${p.city}, ${p.state}`),demoProperty(p));
    for(const deal of mockDeals){const key=propertyIdentity(deal.address);const old=entries.get(key);entries.set(key,{...(old??{addedDate:propertyAddedDate(undefined,null,deal.updatedAt),firstViewedAt:deal.updatedAt,review:{},id:`deal-${deal.id}`,address:deal.address,city:'',state:'',zip:'',lifecycle:'prospect' as const,updatedAt:deal.updatedAt,propertyRevision:0,details:{},listing:null,evaluation:null}),deal});}
    return [...entries.values()];
  }
  const config=cloudConfig(),session=await requireOwner();const result:FeedProperty[]=[];
  for(let offset=0;;offset+=500){
    const rows=await restRequest<DbRow[]>(config,session,`properties?${new URLSearchParams({select:'*,deals(*,deal_adjustments(*),deal_tax_assumptions(*))',order:'updated_at.desc,id.asc',limit:'500',offset:String(offset)})}`);
    for(const row of rows){
      const details=(row.property_details??{}) as FeedProperty['details'];
      const deals=Array.isArray(row.deals)?[...row.deals].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))):[];
      const fields:Record<string,string>={};for(const [column,label] of Object.entries({property_type:'Property type',beds:'Bedrooms',baths:'Bathrooms',square_feet:'Living area',lot_square_feet:'Lot size',year_built:'Year built',garage:'Garage type'}))if(row[column]!=null)fields[label]=String(row[column]);
      result.push({ownership:(row.ownership??{}) as FeedProperty['ownership'],newMarkedAt:row.new_marked_at as string|null,addedDate:(row.added_date_override as string|null)??propertyAddedDate((row.scout_evaluation as ScoutEvaluation|null)?.imported?.raw['Date Added'],row.first_discovered_at as string|null,row.created_at as string|null),firstViewedAt:row.first_viewed_at as string|null,visible:row.feed_visible!==false,facts:fields,review:(row.manual_review??{}) as Partial<PropertyReview>,id:String(row.id),address:String(row.address),city:String(row.city),state:String(row.state),zip:String(row.zip),lifecycle:row.lifecycle as FeedProperty['lifecycle'],updatedAt:String(row.updated_at),propertyRevision:Number(row.details_revision),details,listing:row.listing as ScoutListing|null,evaluation:row.scout_evaluation as ScoutEvaluation|null,deal:deals[0]?fromDealRow({...deals[0],properties:{property_details:details,details_revision:row.details_revision}}):null});
    }
    if(rows.length<500)break;
  }
  return result;
}
function demoProperty(p:Property):FeedProperty {return {addedDate:p.acquisition.acquisitionDate,firstViewedAt:p.acquisition.acquisitionDate,facts:{'Property type':p.propertyType,'Bedrooms':String(p.beds),'Bathrooms':String(p.baths),'Living area':String(p.squareFeet),'Lot size':String(p.lotSquareFeet),'Year built':String(p.yearBuilt)},review:{},id:p.id,address:p.address,city:p.city,state:p.state,zip:p.zip,lifecycle:'owned',updatedAt:p.valuation.asOfDate,propertyRevision:0,details:{},listing:null,evaluation:null,deal:null};}
export async function getFeedProperty(id:string) {if(dataMode()==='supabase'&&!UUID_PATTERN.test(id))return null;return(await listPropertyFeed()).find(p=>p.id===id)??null;}
export async function scoutDashboard():Promise<{config:ScoutConfig;runs:DbRow[];changes:DbRow[]}> {
  if(dataMode()==='demo')return {config:structuredClone(DEFAULT_SCOUT_CONFIG),runs:[],changes:[]};
  const config=cloudConfig(),session=await requireOwner();
  const [settings,runs,changes]=await Promise.all([
    restRequest<{config:ScoutConfig}[]>(config,session,'scout_settings?select=config&limit=1'),
    restRequest<DbRow[]>(config,session,'scout_runs?select=*&order=started_at.desc&limit=10'),
    restRequest<DbRow[]>(config,session,'property_listing_history?select=*&order=recorded_at.desc&limit=30'),
  ]);
  return {config:settings[0]?.config??structuredClone(DEFAULT_SCOUT_CONFIG),runs,changes};
}
