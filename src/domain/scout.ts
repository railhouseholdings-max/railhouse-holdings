import type { DealInputs } from './models.ts';
import type { ArvInput, ArvResult } from './arv.ts';
import type { RentCastLookup } from './property-lookup.ts';
export const SCOUT_CITIES=['Fort Wayne','New Haven','Huntertown','Leo-Cedarville','Grabill','Woodburn','Monroeville','Roanoke','Auburn'] as const;
export type ListingStatus='Active'|'Pending'|'Contingent'|'Sold'|'Off Market'|'Inactive'|'Unknown';
export interface ScoutListing {
  provider:'RentCast'|'Supplied'|'Google Sheets';sourceId:string;address:string;city:string;state:string;zip:string;
  latitude:number|null;longitude:number|null;propertyType:string|null;units:number|null;
  bedrooms:number|null;bathrooms:number|null;squareFeet:number|null;lotSquareFeet:number|null;yearBuilt:number|null;
  price:number|null;listedAt:string|null;lastSeenAt:string|null;daysOnMarket:number|null;
  closedSale?:{price:number|null;date:string|null;source:string}|null;
  status:ListingStatus;checkedAt:string;url:string|null;description:string|null;
  photos:{url:string;source:string;licensed:boolean}[];conflicts:string[];sourceReference:string;
}
export interface ScoutConfig {
  enabled:boolean;region:{latitude:number;longitude:number;radiusMiles:number}|null;cities:string[];maxPrice:number|null;maxRequestsPerRun:number;monthlyRequestLimit:number;
  maxEnrichments:number;backfillDays:number;overlapDays:number;
  gates:{recovery:number;monthlyCashFlow:number;rentEfficiency:number;roe:number};
  scoreWeights:{recovery:number;cashFlow:number;rentEfficiency:number;roe:number;dscr:number;arvConfidence:number;rehabEvidence:number;rentalEvidence:number};
  assumptions:Partial<DealInputs>;
}
export interface RehabEvidence {low:number;base:number;high:number;scope:string;source:string;asOf:string;photoReviewed:boolean}
export interface ScoutEvidence {
  rentOverride?:{monthly:number;low:number|null;high:number|null;source:string};
  lookup?:RentCastLookup;arvInput?:ArvInput;arv?:ArvResult;rehab?:RehabEvidence;
  neighborhood?:{summary:string;sources:{url:string;retrievedAt:string}[]};
  thesis?:string;thesisSource?:string;assumptions?:Partial<DealInputs>;
}
export type ScoutRecommendation='Strong Buy'|'Potential Fit'|'Watch'|'Pass'|'Needs Review';
export interface ImportedSheetAnalysis {
  source:'Google Sheets';spreadsheetId:string;sheetId:number;tab:string;row:number;fetchedAt:string;sourceUpdatedAt:string|null;
  raw:Record<string,string>;estimates:{arvLow:number|null;arvBase:number|null;arvHigh:number|null;rehabLow:number|null;rehabBase:number|null;rehabHigh:number|null;rentLow:number|null;rentBase:number|null;rentHigh:number|null;rentBasis:'total'|'per-unit'|'unknown'};
}
export interface ScoutEvaluation {
  imported?:ImportedSheetAnalysis;
  stage:'screened'|'enriched'|'underwritten';version:string;analyzedAt:string;recommendation:ScoutRecommendation;score:number|null;qualifies:boolean;
  gates:{name:string;value:number|null;threshold:number;passed:boolean|null}[];
  inputs:DealInputs|null;metrics:Record<string,number|null>|null;downside:Record<string,number|null>|null;
  arv:ArvResult|null;rent:RentCastLookup['rent'];rentSource:string|null;rehab:RehabEvidence|null;
  neighborhood:ScoutEvidence['neighborhood']|null;thesis:string|null;warnings:string[];
}
export interface ScoutRun {
  id:string;startedAt:string;completedAt:string|null;status:'running'|'succeeded'|'partial'|'failed';
  discovered:number;evaluated:number;added:number;updated:number;rejected:number;requests:number;
  sources:string[];warnings:string[];errors:string[];report:string[];
}
export interface PropertyReview {notes:string;workflow:'Researching'|'Under Review'|'Watch'|'Dismissed';decision:ScoutRecommendation|null;evidence:ScoutEvidence}
export interface TrackedProperty {id:string;address:string;listing:ScoutListing|null;evidence:ScoutEvidence;manual:boolean}
export interface ScoutStore {
  begin(key:string,now:string):Promise<ScoutRun|null>;
  config():Promise<ScoutConfig>;
  checkpoint():Promise<string|null>;
  tracked():Promise<TrackedProperty[]>;
  reserveRequest(runId:string,month:string,limit:number):Promise<boolean>;
  saveListing(runId:string,listing:ScoutListing,evaluation?:ScoutEvaluation):Promise<{id:string;created:boolean;changed:boolean;visible?:boolean}>;
  finish(run:ScoutRun,checkpoint:string|null):Promise<void>;
}
export interface ScoutProvider {
  discover(city:string,days:number,offset:number,signal:AbortSignal):Promise<ScoutListing[]>;
  verify(address:string,signal:AbortSignal):Promise<ScoutListing[]>;
  enrich(listing:ScoutListing,evidence:ScoutEvidence,signal:AbortSignal):Promise<ScoutEvidence>;
}
