export type EvidenceStatus = 'verified' | 'provider-reported' | 'user-supplied' | 'inferred' | 'unavailable';
export interface ArvSource {
  provider:string; recordId:string; reference:string; retrievedAt:string;
  reliability:number; status:EvidenceStatus;
}
export interface ArvProperty {
  id:string; address:string; propertyType:string|null; units:number|null;
  bedrooms:number|null; bathrooms:number|null; glaSqFt:number|null;
  lotSqFt:number|null; yearBuilt:number|null; garageSpaces:number|null;
  basementSqFt:number|null; basementFinishedSqFt:number|null;
  condition:'C1'|'C2'|'C3'|'C4'|'C5'|'C6'|null;
  quality:'Q1'|'Q2'|'Q3'|'Q4'|'Q5'|'Q6'|null;
  floodZone:string|null; style:string|null; submarket:string|null;
  latitude:number|null; longitude:number|null;
  sources:ArvSource[];
  evidence:Partial<Record<keyof Omit<ArvProperty,'sources'|'evidence'|'conflicts'>,EvidenceStatus>>;
  conflicts:{field:string;values:string[];references:string[]}[];
}
export type AdjustmentFeature = 'glaSqFt'|'bathrooms'|'bedrooms'|'lotSqFt'|'garageSpaces'|'basementUnfinishedSqFt'|'basementFinishedSqFt'|'condition'|'quality'|'floodZone'|'marketTime'|'external';
export interface AdjustmentRate {effectiveDate?:string;value:number; basis:'current-market'|'eby-historical'; evidence:ArvSource; rationale:string; confidence:number}
export interface ArvAdjustment {
  effectiveDate?:string;
  feature:AdjustmentFeature;subjectValue:string|number|null;comparableValue:string|number|null;
  amount:number;direction:'up'|'down'|'none'; evidence:ArvSource;
  rationale:string;confidence:number;
}
export interface ArvComparable extends ArvProperty {
  sale:{status:'closed'|'active'|'pending'|'unknown';price:number|null;date:string|null;armsLength:boolean|null;source:ArvSource};
  distanceMiles:number|null;
  competingMarketEvidence:string|null;
  conditionAssessment:'verified'|'preliminary-photo'|'description'|'unknown';
  manualAdjustments?:ArvAdjustment[];
}
export interface ArvSettings {
  rates?:Partial<Record<AdjustmentFeature,AdjustmentRate>>;
  historicalEbyScope?:string;
  independentBedroomEvidence?:string;
  glaMaterialitySqFt?:number;
  lotMaterialitySqFt?:number;
}
export interface ArvInput {
  valuationDate:string;subject:ArvProperty;
  proposed?:Partial<Pick<ArvProperty,'units'|'bedrooms'|'bathrooms'|'glaSqFt'|'garageSpaces'|'basementSqFt'|'basementFinishedSqFt'|'condition'|'quality'>>;
  comparables:ArvComparable[];settings?:ArvSettings;scenarioName?:string;
}
export interface EvaluatedComparable {
  comparable:ArvComparable;distanceMiles:number;tier:number;conditionMatch:'similar'|'superior'|'inferior'|'unknown';
  adjustments:ArvAdjustment[];adjustedPrice:number;netAdjustment:number;netAdjustmentPercent:number;grossAdjustmentPercent:number;
  unresolved:string[];warnings:string[];scores:Record<string,number>;rawWeight:number;weight:number;
}
export interface ArvResult {
  methodologyVersion:string;calibrationVersion:string;valuationDate:string;scenarioName:string|null;
  subject:ArvProperty;proposed:ArvProperty;
  status:'provisional'|'final'|'insufficient-evidence';
  conservativeArv:number|null;likelyArv:number|null;highArv:number|null;
  confidence:{score:number;level:'High'|'Medium'|'Low'|'Insufficient Evidence';factors:{name:string;score:number;weight:number}[];reasons:string[]};
  comparables:EvaluatedComparable[];excluded:{id:string;reason:string}[];
  reasoning:string[];assumptions:string[];warnings:string[];sources:ArvSource[];
}
