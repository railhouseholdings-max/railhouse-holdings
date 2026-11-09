/** Historical grid audit. Does not fabricate daily dates to bypass live comp selection. */
import type { AdjustmentFeature, ArvAdjustment, ArvComparable, ArvInput, ArvProperty } from '../../domain/arv.ts';
import { EBY_SOURCE, EBY_SUBJECT, CALIBRATION_VERSION } from './calibration.ts';
import { adjustComparable } from './adjustments.ts';
import { reconcileIndications } from './reconciliation.ts';
export interface EbyGridSale {
  id:string;address:string;status:'closed';price:number;saleMonth:string;contractMonth:string;
  mls:string;page:number;distanceMiles:number;bedrooms:number;bathrooms:number;glaSqFt:number;
  lotSqFt:number;basementSqFt:number;basementFinishedSqFt:number;garageSpaces:number;floodZone:string|null;
  amounts:Partial<Record<AdjustmentFeature,number>>;net:number;adjusted:number;
  netPercent:number;grossPercent:number;weight:number;
}
export interface EbyGrid {valuationDate:string;appraisedValue:number;sha256:string;closedSales:EbyGridSale[];activeContext:{address:string;status:string}[];limitations:string[]}
export function auditEbyGrid(grid:EbyGrid) {
  if(grid.valuationDate!=='2026-04-24'||grid.closedSales.length!==4)throw new Error('Expected the four original Eby closed-sale grid rows.');
  const input:ArvInput={valuationDate:grid.valuationDate,subject:EBY_SUBJECT,comparables:[]};
  const comparisons=grid.closedSales.map(row=>{
    if(row.status!=='closed'||!/^\d{4}-\d{2}$/.test(row.saleMonth)||row.price<=0||!Number.isFinite(row.price)||!Number.isFinite(row.weight)||row.weight<0)throw new Error('Invalid Eby historical row.');
    const source={...EBY_SOURCE,recordId:row.mls,reference:`appraisal and 1007.pdf#page=${row.page}; MLS ${row.mls}; SHA256 ${grid.sha256}`};
    const fields:Partial<ArvProperty>={bedrooms:row.bedrooms,bathrooms:row.bathrooms,glaSqFt:row.glaSqFt,lotSqFt:row.lotSqFt,basementSqFt:row.basementSqFt,basementFinishedSqFt:row.basementFinishedSqFt,garageSpaces:row.garageSpaces,floodZone:row.floodZone,yearBuilt:null};
    const manualAdjustments:ArvAdjustment[]=Object.entries(row.amounts).map(([feature,amount])=>{
      if(!Number.isFinite(amount))throw new Error('Invalid grid adjustment.');
      return {feature:feature as AdjustmentFeature,amount,direction:amount>0?'up':amount<0?'down':'none',subjectValue:null,comparableValue:null,effectiveDate:grid.valuationDate,evidence:source,confidence:0.95,rationale:'Recorded historical appraiser grid entry, not an independently estimated current rate. Basement entry covers combined utility; zero unfinished adjustment avoids double counting.'};
    });
    const comp:ArvComparable={...EBY_SUBJECT,...fields,id:row.id,address:row.address,sources:[source],evidence:Object.fromEntries(Object.keys(fields).map(key=>[key,'verified'])),sale:{status:'closed',price:row.price,date:null,armsLength:true,source},distanceMiles:row.distanceMiles,competingMarketEvidence:null,conditionAssessment:'verified',manualAdjustments};
    // Daily date deliberately null: explicit recorded time adjustment supplies the historical amount.
    const result=adjustComparable(input,EBY_SUBJECT,comp);
    return {id:row.id,address:row.address,saleMonth:row.saleMonth,contractMonth:row.contractMonth,...result,recordedWeight:row.weight,expectedAdjustedPrice:row.adjusted,difference:result.adjustedPrice-row.adjusted,netDifference:result.netAdjustment-row.net,displayedNetPercent:row.netPercent,displayedGrossPercent:row.grossPercent};
  });
  const indications=comparisons.map(c=>({value:c.adjustedPrice,weight:c.recordedWeight}));
  const weightedMean=indications.reduce((s,c)=>s+c.value*c.weight,0)/indications.reduce((s,c)=>s+c.weight,0);
  const reconciliation=reconcileIndications(indications,true);
  return {calibrationVersion:CALIBRATION_VERSION,originalGridAvailable:true,comparisons,recordedWeightReconciliation:{...reconciliation,unroundedWeightedMean:weightedMean,actualAppraisal:grid.appraisedValue,difference:reconciliation.likelyArv-grid.appraisedValue},independentEqualWeightSensitivity:reconcileIndications(indications.map(c=>({...c,weight:0.25})),true),excludedActiveListings:grid.activeContext.map(c=>({address:c.address,reason:'Active asking price is not a closed sale.'})),limitations:[...grid.limitations,'This audits recorded historical adjustments with the production adjustment calculator; it does not independently derive those adjustments or appraiser weights. Full selection/ranking regression needs exact settlement dates; none were invented.']};
}
