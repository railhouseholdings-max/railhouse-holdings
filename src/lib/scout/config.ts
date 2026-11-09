import { SCOUT_CITIES, type ScoutConfig } from '../../domain/scout.ts';
import { INPUT_COLUMNS } from '../persistence/deal-records.ts';
export const DEFAULT_SCOUT_CONFIG:ScoutConfig={enabled:false,region:{latitude:41.0881396,longitude:-85.1426619,radiusMiles:40},cities:[...SCOUT_CITIES],maxPrice:null,maxRequestsPerRun:20,monthlyRequestLimit:40,maxEnrichments:2,backfillDays:30,overlapDays:3,gates:{recovery:85,monthlyCashFlow:0,rentEfficiency:0.10,roe:0},scoreWeights:{recovery:30,cashFlow:30,rentEfficiency:10,roe:5,dscr:5,arvConfidence:10,rehabEvidence:5,rentalEvidence:5},assumptions:{}};
export function validateScoutConfig(raw:unknown):ScoutConfig {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid Scout configuration.');
  const v=raw as ScoutConfig;
  if(typeof v.enabled!=='boolean'||!Array.isArray(v.cities)||v.cities.length<1||v.cities.length>9||v.cities.some(c=>!(SCOUT_CITIES as readonly string[]).includes(c))||new Set(v.cities).size!==v.cities.length)throw new Error('Select supported search towns.');
  for(const [key,min,max] of [['maxRequestsPerRun',1,100],['monthlyRequestLimit',1,10000],['maxEnrichments',0,10],['backfillDays',1,365],['overlapDays',1,30]] as const)if(!Number.isInteger(v[key])||v[key]<min||v[key]>max)throw new Error(`Invalid ${key}.`);
  if(v.region!==null&&(!v.region||!Number.isFinite(v.region.latitude)||Math.abs(v.region.latitude)>90||!Number.isFinite(v.region.longitude)||Math.abs(v.region.longitude)>180||!Number.isFinite(v.region.radiusMiles)||v.region.radiusMiles<=0||v.region.radiusMiles>100))throw new Error('Invalid regional search.');
  if(v.maxPrice!==null&&(!Number.isFinite(v.maxPrice)||v.maxPrice<=0||v.maxPrice>1e9))throw new Error('Invalid search price ceiling.');
  if(!v.gates||Object.keys(DEFAULT_SCOUT_CONFIG.gates).some(key=>!Number.isFinite(v.gates[key as keyof typeof v.gates])))throw new Error('Invalid screening gates.');
  if(v.gates.recovery<0||v.gates.recovery>200||v.gates.rentEfficiency<0||v.gates.rentEfficiency>1||v.gates.monthlyCashFlow<0||v.gates.roe<0)throw new Error('Invalid screening thresholds.');
  if(!v.scoreWeights||Object.keys(DEFAULT_SCOUT_CONFIG.scoreWeights).some(k=>!Number.isFinite(v.scoreWeights[k as keyof typeof v.scoreWeights])||v.scoreWeights[k as keyof typeof v.scoreWeights]<0)||Math.abs(Object.values(v.scoreWeights).reduce((sum,n)=>sum+n,0)-100)>.000001)throw new Error('Score weights must be nonnegative and total 100.');
  if(!v.assumptions||typeof v.assumptions!=='object'||Array.isArray(v.assumptions))throw new Error('Invalid financing assumptions.');
  for(const [key,value] of Object.entries(v.assumptions))if(!(key in INPUT_COLUMNS)||(key==='closingDate'?typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value):typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9))throw new Error(`Invalid assumption ${key}.`);
  return structuredClone(v);
}
/** Both UTC schedules invoke; only the 9am New York invocation performs work. */
export function isScoutScheduleHour(now:Date):boolean {return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now)==='09';}
export function scoutDay(now:Date):string {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
