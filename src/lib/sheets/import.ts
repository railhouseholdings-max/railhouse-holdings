import type { ListingStatus, ScoutEvaluation, ScoutListing, ScoutRecommendation } from '../../domain/scout.ts';
import type { SheetGrid } from './client.ts';
import { propertyIdentity } from '../scout/identity.ts';
import { SCOUT_CITIES } from '../../domain/scout.ts';
export const SHEET_HEADERS=['Date Added','Status','Recommendation','List Price','Address','City','ZIP','Property Type','Units','Beds','Baths','Sq Ft','Year Built','Listing Date','Days on Market','Source','Listing URL','Rehab Low','Rehab Base','Rehab High','ARV Low','ARV Base','ARV High','Rent Low / mo','Rent Base / mo','Rent High / mo','Taxes / yr','Insurance / yr','Holding Costs','Unforeseen Construction','Refi LTV','Interest Rate','Term (yrs)','Property Mgmt Rate','CapEx Reserve / mo','Fixed Refi Costs','Origination Rate','Refi Recovery','Monthly Cash Flow','Rent Efficiency','Year-1 ROE','DSCR','Deal Score','Confidence','Investment Thesis','Key Risks','Next Action','Last Checked','Mashvisor Rent','Mashvisor Trad ROI','Mashvisor Cap Rate','Realtor ID','Zillow ID','ARV Comp Count','ARV Comps','Neighborhood Context','Rehab Scope','Source Notes'] as const;
const key=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const number=(v:string):number|null=>{
  const clean=v.trim().replace(/[$,%\s]/g,'');if(!/^-?\d+(?:\.\d+)?$/.test(clean))return null;
  const n=Number(clean);return Number.isFinite(n)&&Math.abs(n)<=1e12?n:null;
};
export function sheetDate(value:string):string|null {
  if(!value.trim())return null;let date=value.trim();
  const us=date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(us)date=`${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;
  if(!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d\d:\d\d))?$/.test(date))return null;
  const calendar=new Date(date.slice(0,10)+'T00:00:00Z');if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==date.slice(0,10))return null;
  const d=new Date(date);return Number.isFinite(d.getTime())?d.toISOString():null;
}
const url=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export interface ImportedSheetRow {listing:ScoutListing;evaluation:ScoutEvaluation}
export function normalizeSheet(grid:SheetGrid):{rows:ImportedSheetRow[];errors:string[];warnings:string[]} {
  const header=grid.values[0]?.map(v=>(v??'').trim())??[];
  if(!header.length||!header.some(h=>key(h)==='address'))throw new Error('Source tab needs its header row in row 1, including Address.');
  const normalized=header.filter(Boolean).map(key);if(new Set(normalized).size!==normalized.length)throw new Error('Source tab contains duplicate column headers.');
  const rows:ImportedSheetRow[]=[],errors:string[]=[],warnings:string[]=[];
  for(let index=1;index<grid.values.length;index++){
    const cells=grid.values[index]??[];if(!cells.some(v=>v?.trim()))continue;
    try {
      if(cells.slice(header.length).some(v=>v?.trim()))throw new Error('Row contains data beyond the named header columns.');
      const raw=Object.fromEntries(header.flatMap((h,j)=>h?[[h,(cells[j]??'').trim()]]:[]));
      if(JSON.stringify(raw).length>60000)throw new Error('Row exceeds 60 KB.');
      const fields=new Map(Object.entries(raw).map(([h,v])=>[key(h),v]));
      const get=(...names:string[])=>names.map(name=>fields.get(key(name))).find(v=>v!==undefined&&v!=='')??'';
      const n=(...names:string[])=>{const v=get(...names);const result=number(v);if(v&&result===null)rowWarnings.push(`Unrecognized numeric value in ${names[0]}; original text retained.`);return result;};
      const nonnegative=(name:string)=>{const v=n(name);if(v!==null&&v<0)throw new Error(`${name} cannot be negative.`);return v;};
      const rowWarnings=['Imported from the agent-populated sheet; listing status, estimates and comparable narratives were not independently verified or recalculated.'];
      const street=get('Address','Property Address');if(!street||street.length>240||!/^\d/.test(street))throw new Error('A numbered street Address is required.');
      const parts=street.split(',').map(v=>v.trim());
      const city=get('City')||(parts.length>=3?parts.at(-2)!:'');
      const zip=get('ZIP','Zip Code')||street.match(/\b\d{5}(?:-\d{4})?$/)?.[0]||'';
      let state=get('State')||parts.at(-1)?.match(/^([A-Za-z]{2})(?:\s|$)/)?.[1]?.toUpperCase()||'';
      if(!state&&(SCOUT_CITIES as readonly string[]).some(c=>key(c)===key(city))){state='IN';rowWarnings.push('State inferred from the configured Indiana target community; the source sheet has no State column.');}
      if(!city||!state)throw new Error('City and state are needed for reliable property identity. Supply City; Indiana target towns infer IN.');
      if(zip&&!/^\d{5}(?:-\d{4})?$/.test(zip))throw new Error('ZIP must be five digits or ZIP+4.');
      const address=parts.length>=3?street:`${street}, ${city}, ${state}${zip?' '+zip:''}`;
      const sourceUpdatedAt=sheetDate(get('Last Checked','Last Updated'));
      if(get('Last Checked')&&!sourceUpdatedAt)rowWarnings.push('Last Checked date is not recognized; import time does not establish verification freshness.');
      if(sourceUpdatedAt&&sourceUpdatedAt>grid.fetchedAt)throw new Error('Last Checked cannot be in the future.');
      const sourceStatus=get('Listing Status','Status');
      const statuses:Record<string,ListingStatus>={active:'Active',forsale:'Active',pending:'Pending',contingent:'Contingent',sold:'Sold',offmarket:'Off Market',inactive:'Inactive',unknown:'Unknown',needsverification:'Unknown'};
      const status=statuses[key(sourceStatus)]??'Unknown';
      if(!statuses[key(sourceStatus)])rowWarnings.push(`Sheet status “${sourceStatus||'blank'}” is a workflow label, not verified listing availability. Availability remains Unknown.`);
      const recommendations:Record<string,ScoutRecommendation>={strongbuy:'Strong Buy',potentialfit:'Potential Fit',watch:'Watch',pass:'Pass',needsreview:'Needs Review'};
      const recommendation=recommendations[key(get('Recommendation'))]??'Needs Review';
      const linkIndex=header.findIndex(h=>['listingurl','listinglink','url'].includes(key(h))),addressIndex=header.findIndex(h=>key(h)==='address');
      const suppliedLink=grid.hyperlinks[index]?.[linkIndex]||get('Listing URL','Listing Link')||grid.hyperlinks[index]?.[addressIndex]||'';
      const listingUrl=url(suppliedLink);if(suppliedLink&&!listingUrl)rowWarnings.push('Listing URL was not a usable HTTPS link; original text retained.');
      const listing:ScoutListing={provider:'Google Sheets',sourceId:`${grid.spreadsheetId}:${grid.sheetId}:${propertyIdentity(address)}`,address,city,state,zip,
        latitude:null,longitude:null,propertyType:get('Property Type')||null,units:nonnegative('Units'),bedrooms:nonnegative('Beds'),bathrooms:nonnegative('Baths'),squareFeet:nonnegative('Sq Ft'),lotSquareFeet:null,yearBuilt:nonnegative('Year Built'),price:nonnegative('List Price'),listedAt:sheetDate(get('Listing Date')),lastSeenAt:sourceUpdatedAt,daysOnMarket:nonnegative('Days on Market'),status,checkedAt:grid.fetchedAt,url:listingUrl,description:null,photos:[],conflicts:[],sourceReference:`https://docs.google.com/spreadsheets/d/${grid.spreadsheetId}/edit#gid=${grid.sheetId}&range=A${index+1}`};
      const estimates={arvLow:nonnegative('ARV Low'),arvBase:nonnegative('ARV Base'),arvHigh:nonnegative('ARV High'),rehabLow:nonnegative('Rehab Low'),rehabBase:nonnegative('Rehab Base'),rehabHigh:nonnegative('Rehab High'),rentLow:nonnegative('Rent Low / mo'),rentBase:nonnegative('Rent Base / mo'),rentHigh:nonnegative('Rent High / mo'),rentBasis:'total' as const};
      for(const [low,base,high,label] of [[estimates.arvLow,estimates.arvBase,estimates.arvHigh,'ARV'],[estimates.rehabLow,estimates.rehabBase,estimates.rehabHigh,'Rehab'],[estimates.rentLow,estimates.rentBase,estimates.rentHigh,'Rent']] as const)if((low!==null&&base!==null&&low>base)||(base!==null&&high!==null&&base>high))rowWarnings.push(`${label} range is not ordered; source values retained for review.`);
      const score=n('Deal Score');if(score!==null&&(score<0||score>100))throw new Error('Deal Score must be between 0 and 100.');
      const recovery=n('Refi Recovery'),cashFlow=n('Monthly Cash Flow'),efficiency=n('Rent Efficiency'),roe=n('Year-1 ROE'),dscr=n('DSCR');
      const hasMetrics=[recovery,cashFlow,efficiency,roe,dscr].some(v=>v!==null);
      const evaluation:ScoutEvaluation={stage:'enriched',version:'railhouse-sheet-import-1.0.0',analyzedAt:sourceUpdatedAt??sheetDate(get('Date Added'))??grid.fetchedAt,recommendation,score,qualifies:false,gates:[],inputs:null,
        metrics:hasMetrics?{recoveryPercent:recovery,monthlyCashFlow:cashFlow,rentEfficiency:efficiency===null?null:efficiency/100,yearOneRoe:roe,dscr}:null,downside:null,arv:null,
        rent:estimates.rentBase===null?null:{monthly:estimates.rentBase,low:estimates.rentLow,high:estimates.rentHigh,perUnit:false,comparableCount:0},rentSource:'Agent-populated Google Sheet; Rent Low/Base/High are stabilized property totals per the supplied Scout schema.',rehab:null,neighborhood:null,thesis:get('Investment Thesis')||null,warnings:rowWarnings,
        imported:{source:'Google Sheets',spreadsheetId:grid.spreadsheetId,sheetId:grid.sheetId,tab:grid.title,row:index+1,fetchedAt:grid.fetchedAt,sourceUpdatedAt,raw,estimates}};
      rows.push({listing,evaluation});
    }catch(error){errors.push(`Row ${index+1}: ${error instanceof Error?error.message:'Invalid row.'}`);}
  }
  const grouped=new Map<string,ImportedSheetRow[]>();for(const row of rows){const identity=propertyIdentity(row.listing.address);const group=grouped.get(identity)??[];group.push(row);grouped.set(identity,group);}
  const unique:ImportedSheetRow[]=[];
  for(const group of grouped.values()){
    if(group.length>1){const same=group.every(r=>JSON.stringify(r.evaluation.imported!.raw)===JSON.stringify(group[0].evaluation.imported!.raw));if(!same){errors.push(`Conflicting duplicate rows ${group.map(r=>r.evaluation.imported!.row).join(', ')}; property retained without an update.`);continue;}warnings.push(`Duplicate rows for ${group[0].listing.address} imported once.`);}
    unique.push(group[0]);
  }
  return {rows:unique,errors,warnings};
}

/** Prefill supplied estimates only; the existing calculator retains its own defaults for absent inputs. */
export function sheetInputEstimates(imported:ScoutEvaluation['imported']):Partial<import('../../domain/models.ts').DealInputs> {
  if(!imported)return {};
  const mapping={purchasePrice:'List Price',rehabBudget:'Rehab Base',arv:'ARV Base',monthlyRent:'Rent Base / mo',annualPropertyTaxes:'Taxes / yr',annualInsurance:'Insurance / yr',holdingCosts:'Holding Costs',unexpectedConstructionCosts:'Unforeseen Construction',refinanceLtv:'Refi LTV',interestRate:'Interest Rate',loanTermYears:'Term (yrs)',managementPercent:'Property Mgmt Rate',monthlyCapexReserve:'CapEx Reserve / mo',closingCosts:'Fixed Refi Costs',originationPercent:'Origination Rate'} as const;
  return Object.fromEntries(Object.entries(mapping).flatMap(([field,header])=>{const value=number(imported.raw[header]??'');return value!==null&&value>=0?[[field,value]]:[];}));
}
