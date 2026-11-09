import { propertyIdentity } from './identity.ts';
import type { ClosingAdjustments } from '../../domain/closing.ts';
import type { PurchaseAdjustments } from '../../domain/purchase.ts';
import type { DealInputs } from '../../domain/models.ts';
import type { ScoutConfig, ScoutEvidence, ScoutEvaluation, ScoutListing } from '../../domain/scout.ts';
import { calculateDeal } from '../calculations/deal.ts';
import { assessDealStrength } from '../calculations/deal-strength.ts';
import { DEFAULT_CLOSING_ADJUSTMENTS } from '../calculations/closing.ts';
import { DEFAULT_PURCHASE_ADJUSTMENTS } from '../calculations/purchase.ts';
import { estimateARV } from '../arv/engine.ts';
import { INPUT_COLUMNS } from '../persistence/deal-records.ts';
export const SCOUT_MODEL_VERSION='railhouse-scout-1.0.0';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function recommendationForScore(score:number) {return score>=80?'Strong Buy':score>=65?'Potential Fit':score>=55?'Watch':'Pass';}
export function preScreen(listing:ScoutListing,config:ScoutConfig):string|null {
  if(listing.status!=='Active')return 'Current listing is not confirmed active.';
  if(listing.conflicts.length)return 'Conflicting listing evidence needs review.';
  if(!listing.price||listing.price<=0)return 'Missing asking price.';
  if(config.maxPrice!==null&&listing.price>config.maxPrice)return 'Above configured asking-price ceiling.';
  if(listing.units!==null&&listing.units>4)return 'More than four units, outside Scout scope.';
  if(listing.propertyType&&!['Single Family','Multi-Family','Duplex','Triplex','Fourplex'].includes(listing.propertyType))return 'Property type outside configured residential strategy.';
  return null;
}
export function financialMetrics(input:DealInputs,closing:ClosingAdjustments=DEFAULT_CLOSING_ADJUSTMENTS,purchase:PurchaseAdjustments=DEFAULT_PURCHASE_ADJUSTMENTS) {
  const r=calculateDeal(input,closing,purchase);
  const strength=assessDealStrength({...r,arv:input.arv,monthlyRent:input.monthlyRent});
  const equity=input.arv-r.refinanceLoanAmount;
  return {totalProjectCost:r.totalProjectCost,refinanceLoanAmount:r.refinanceLoanAmount,netRefinanceRecovery:r.netProjectRecovery,recoveryPercent:r.recoveryPercent,monthlyCashFlow:r.monthlyCashFlow,rentEfficiency:input.arv>0?input.monthlyRent*12/input.arv:null,yearOneRoe:equity>0?r.monthlyCashFlow*12/equity*100:null,remainingEquity:equity,dscr:strength.debtCoverage,cashRemainingInDeal:r.cashRemainingInDeal};
}
export function evaluateScoutProperty(listing:ScoutListing,evidence:ScoutEvidence,config:ScoutConfig,now:string):ScoutEvaluation {
  const warnings:string[]=[];let arv=evidence.arvInput?estimateARV(evidence.arvInput):evidence.arv??null;
  if(arv&&propertyIdentity(arv.subject.address)!==propertyIdentity(listing.address)){warnings.push('ARV subject does not match the listing identity; valuation was withheld.');arv=null;}
  let rent=evidence.rentOverride?{monthly:evidence.rentOverride.monthly,low:evidence.rentOverride.low,high:evidence.rentOverride.high,perUnit:false,comparableCount:0}:evidence.lookup?.rent??null;const rehab=evidence.rehab??null;
  if(!evidence.rentOverride&&evidence.lookup&&propertyIdentity(evidence.lookup.address)!==propertyIdentity(listing.address)){rent=null;warnings.push('Rent lookup does not match the listing identity; rent was withheld.');}
  if(!listing.photos.length)warnings.push('No licensed listing photos supplied; visible and hidden renovation scope remain unverified.');
  if(!rehab)warnings.push('Property-specific rehab low/base/high and sourced scope are required; no cost-per-foot budget was invented.');
  else if(![rehab.low,rehab.base,rehab.high].every(n=>Number.isFinite(n)&&n>=0)||rehab.low>rehab.base||rehab.base>rehab.high||!rehab.source||!rehab.scope||!/^\d{4}-\d{2}-\d{2}/.test(rehab.asOf)||rehab.asOf>now)warnings.push('Invalid or future-dated rehab evidence.');
  if(!arv?.likelyArv)warnings.push('Insufficient closed-sale ARV evidence.');
  if(arv&&arv.valuationDate!==now.slice(0,10))warnings.push('ARV is not current for this evaluation; refresh before qualifying.');
  if(!rent||!Number.isFinite(rent.monthly)||rent.monthly<=0)warnings.push('Stabilized rental evidence is missing.');
  if(rent?.perUnit)warnings.push('Multifamily rent is per unit; confirmed per-unit rents and total are required.');
  if(!evidence.neighborhood?.sources.length)warnings.push('Neighborhood amenities, rental-market positioning and localized public-safety evidence are unavailable; no unsupported classification assigned.');
  const verifiedUnits=listing.units??(arv&&['verified','user-supplied'].includes(arv.subject.evidence.units??'')?arv.subject.units:null);
  if(verifiedUnits===null)warnings.push('Legal unit count is unverified.');
  const draft={...config.assumptions,...evidence.assumptions,purchasePrice:listing.price,rehabBudget:rehab?.base,arv:arv?.likelyArv,monthlyRent:rent?.perUnit?undefined:rent?.monthly};
  const missing=Object.keys(INPUT_COLUMNS).filter(key=>{const value=draft[key as keyof DealInputs];return key==='closingDate'?typeof value!=='string':typeof value!=='number'||!Number.isFinite(value);});
  if(typeof draft.closingDate==='string'&&draft.closingDate<now.slice(0,10))warnings.push('Configured funding date is in the past; update financing assumptions before qualifying.');
  if(missing.length)warnings.push(`Missing underwriting inputs: ${missing.join(', ')}. Configure assumptions or complete Analyze Deal.`);
  let inputs:DealInputs|null=null,metrics:ScoutEvaluation['metrics']=null,downside:ScoutEvaluation['downside']=null;
  const validRehab=rehab&&rehab.source&&rehab.scope&&rehab.asOf<=now&&[rehab.low,rehab.base,rehab.high].every(n=>Number.isFinite(n)&&n>=0)&&rehab.low<=rehab.base&&rehab.base<=rehab.high;
  if(!missing.length&&validRehab&&arv?.valuationDate===now.slice(0,10))try {
    inputs=draft as DealInputs;metrics=financialMetrics(inputs);
    if(arv?.conservativeArv&&rent?.low)downside=financialMetrics({...inputs,arv:arv.conservativeArv,rehabBudget:rehab.high,monthlyRent:rent.low});
  }catch {inputs=null;warnings.push('Underwriting inputs failed the existing calculator validation.');}
  if(metrics?.remainingEquity!=null&&metrics.remainingEquity<=0)warnings.push('Year-1 ROE is undefined because remaining equity is zero or negative; manual review is required.');
  const gates:ScoutEvaluation['gates']=[
    {name:'Refinance recovery (%)',value:metrics?.recoveryPercent??null,threshold:config.gates.recovery,passed:metrics?.recoveryPercent==null?null:metrics.recoveryPercent>=config.gates.recovery},
    {name:'Monthly cash flow ($)',value:metrics?.monthlyCashFlow??null,threshold:config.gates.monthlyCashFlow,passed:metrics?.monthlyCashFlow==null?null:metrics.monthlyCashFlow>=config.gates.monthlyCashFlow},
    {name:'Annual rent / ARV (strictly greater)',value:metrics?.rentEfficiency??null,threshold:config.gates.rentEfficiency,passed:metrics?.rentEfficiency==null?null:metrics.rentEfficiency>config.gates.rentEfficiency},
    {name:'Year-1 ROE (%)',value:metrics?.yearOneRoe??null,threshold:config.gates.roe,passed:metrics?.yearOneRoe==null?null:metrics.yearOneRoe>=config.gates.roe},
  ];
  const blocked=preScreen(listing,config);if(blocked)warnings.push(blocked);
  let score:number|null=null,recommendation:ScoutEvaluation['recommendation']='Needs Review',qualifies=false;
  if(metrics&&arv&&rehab&&rent) {
    const w=config.scoreWeights;
    score=Math.round(clamp((metrics.recoveryPercent??0)/100)*w.recovery+clamp((metrics.monthlyCashFlow??0)/250)*w.cashFlow+clamp((metrics.rentEfficiency??0)/.15)*w.rentEfficiency+clamp((metrics.yearOneRoe??0)/10)*w.roe+clamp((metrics.dscr??0)/1.5)*w.dscr+arv.confidence.score/100*w.arvConfidence+(rehab.photoReviewed?w.rehabEvidence:0)+(rent.comparableCount>=3?w.rentalEvidence:0));
    const pass=gates.every(g=>g.passed===true);
    const nearMiss=!pass&&(metrics.recoveryPercent??0)>=config.gates.recovery-5&&(metrics.rentEfficiency??0)>=config.gates.rentEfficiency-.01&&(metrics.yearOneRoe??-1)>=config.gates.roe&&gates.filter(g=>g.passed===false).length===1&&Boolean(evidence.thesis?.trim()&&evidence.thesisSource?.trim())&&(metrics.monthlyCashFlow??-1)>=0;
    const essential=!blocked&&gates.every(g=>g.passed!==null)&&inputs!.closingDate>=now.slice(0,10)&&verifiedUnits!==null&&verifiedUnits>=1&&verifiedUnits<=4&&arv.confidence.score>=60&&!listing.conflicts.length;
    qualifies=essential&&(pass||nearMiss);
    recommendation=recommendationForScore(score);
    if(!essential)recommendation='Needs Review';
    else if(!pass)recommendation=nearMiss?'Watch':'Pass';
    else if(recommendation==='Strong Buy'&&(!rehab.photoReviewed||!evidence.neighborhood?.sources.length||arv.status!=='final'||rent.comparableCount<3))recommendation='Potential Fit';
  }
  return {stage:inputs?'underwritten':evidence.lookup||arv||rehab?'enriched':'screened',version:SCOUT_MODEL_VERSION,analyzedAt:now,recommendation,score,qualifies,gates,inputs,metrics,downside,arv,rent,rentSource:evidence.rentOverride?.source??(rent?'RentCast provisional automated rent estimate; verify renovated condition and local rental comparables.':null),rehab,neighborhood:evidence.neighborhood??null,thesis:evidence.thesis??null,warnings};
}
