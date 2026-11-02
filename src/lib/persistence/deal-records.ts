import type { DealInputs, DealAnalysis } from '../../domain/models.ts';
import type { SaveDealRequest } from '../../domain/saved-deal.ts';
import type { RentalTaxMatch } from '../../domain/property-tax.ts';
import { DEFAULT_CLOSING_ADJUSTMENTS } from '../calculations/closing.ts';
import { DEFAULT_PURCHASE_ADJUSTMENTS } from '../calculations/purchase.ts';
import { calculateDeal } from '../calculations/deal.ts';
import { UUID_PATTERN } from '../config/cloud.ts';

export const INPUT_COLUMNS = {
  purchasePrice:'purchase_price',rehabBudget:'rehab_budget',unexpectedConstructionCosts:'unexpected_construction_costs',holdingCosts:'holding_costs',arv:'arv',monthlyRent:'monthly_rent',interestRate:'interest_rate',refinanceLtv:'refinance_ltv',loanTermYears:'loan_term_years',closingCosts:'closing_costs',appraisalFee:'appraisal_fee',originationPercent:'origination_percent',closingDate:'closing_date',taxEscrow:'tax_escrow',insuranceEscrow:'insurance_escrow',annualPropertyTaxes:'annual_property_taxes',annualInsurance:'annual_insurance',managementPercent:'management_percent',monthlyCapexReserve:'monthly_capex_reserve',vacancyPercent:'vacancy_percent',maintenancePercent:'maintenance_percent',
} satisfies Record<keyof DealInputs,string>;
export const ADJUSTMENT_COLUMNS = {
  annualFloodInsurance:'annual_flood_insurance',aggregateEscrowAdjustment:'aggregate_escrow_adjustment',brokerCredit:'broker_credit',lenderCredit:'lender_credit',existingLoanPayoff:'existing_loan_payoff',additionalClosingCosts:'additional_closing_costs',quotedTitlePremium:'quoted_title_premium',appraisalPaidBeforeClosing:'appraisal_paid_before_closing',floodPremiumPaidBeforeClosing:'flood_premium_paid_before_closing',additionalCosts:'additional_purchase_costs',buyerCredits:'buyer_credits',
} as const;
export type DbRow = Record<string,unknown>;
export function dbNumber(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) throw new Error('A stored financial value is missing or invalid.');
  return Number(value);
}
export function validateSaveDeal(value: unknown): SaveDealRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid deal.');
  const v = value as Record<string,unknown>;
  const address = typeof v.address === 'string' ? v.address.trim() : '';
  if (!address || address.length > 240) throw new Error('Enter a property address before saving.');
  if (v.id !== null && (typeof v.id !== 'string' || !UUID_PATTERN.test(v.id))) throw new Error('Invalid saved deal ID.');
  if (v.expectedRevision !== null && (!Number.isSafeInteger(v.expectedRevision) || Number(v.expectedRevision) < 1)) throw new Error('Invalid saved deal revision.');
  if (v.status !== 'Reviewing' && v.status !== 'Researching') throw new Error('Invalid deal status.');
  if (!v.inputs || typeof v.inputs !== 'object') throw new Error('Missing financial inputs.');
  const input = v.inputs as Record<string,unknown>;
  const inputs = Object.fromEntries(Object.keys(INPUT_COLUMNS).map(key=> {
    const value = input[key];
    if (key === 'closingDate') {if (typeof value !== 'string') throw new Error('Missing funding date.');}
    else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) throw new Error(`Invalid ${key}.`);
    return [key,value];
  })) as unknown as DealInputs;
  const adjustments = v.closingAdjustments as Record<string,unknown> | undefined;
  if (!adjustments) throw new Error('Missing closing adjustments.');
  const closingAdjustments = {...DEFAULT_CLOSING_ADJUSTMENTS};
  for (const key of Object.keys(closingAdjustments) as (keyof typeof closingAdjustments)[]) {
    const x = adjustments[key];
    if (key === 'quotedTitlePremium' && x === null) continue;
    if (typeof closingAdjustments[key] === 'boolean') {if(typeof x !== 'boolean') throw new Error('Invalid fee payment timing.');}
    else if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 1e9) throw new Error('Invalid closing adjustment.');
    Object.assign(closingAdjustments,{[key]:x});
  }
  const purchase = v.purchaseAdjustments as Record<string,unknown> | undefined;
  const purchaseAdjustments = {...DEFAULT_PURCHASE_ADJUSTMENTS};
  for (const key of Object.keys(purchaseAdjustments) as (keyof typeof purchaseAdjustments)[]) {
    if (typeof purchase?.[key] !== 'number' || !Number.isFinite(purchase[key]) || Number(purchase[key]) < 0 || Number(purchase[key]) > 1e9) throw new Error('Invalid purchase adjustment.');
    purchaseAdjustments[key] = Number(purchase[key]);
  }
  const tax = v.taxAssumptions as Record<string,unknown> | undefined;
  if (!tax || typeof tax.parcelId !== 'string' || tax.parcelId.length > 40 || !Number.isInteger(tax.payableYear) || Number(tax.payableYear) < 2020 || Number(tax.payableYear) > 2100) throw new Error('Invalid tax assumptions.');
  if (tax.annualOverride !== null && (typeof tax.annualOverride !== 'number' || !Number.isFinite(tax.annualOverride) || tax.annualOverride < 0 || tax.annualOverride > 1e9)) throw new Error('Invalid annual tax override.');
  calculateDeal(inputs,closingAdjustments,purchaseAdjustments);
  return {id:v.id as string|null,expectedRevision:v.expectedRevision as number|null,address,status:v.status,inputs,closingAdjustments,purchaseAdjustments,taxAssumptions:{parcelId:tax.parcelId,payableYear:Number(tax.payableYear),annualOverride:tax.annualOverride as number|null}};
}
export function toDealRows(request: SaveDealRequest, evidence: RentalTaxMatch) {
  const deal: DbRow = {address:request.address,status:request.status};
  for (const [key,column] of Object.entries(INPUT_COLUMNS)) deal[column] = request.inputs[key as keyof DealInputs];
  const adjustments: DbRow = {};
  const all = {...request.closingAdjustments,...request.purchaseAdjustments};
  for (const [key,column] of Object.entries(ADJUSTMENT_COLUMNS)) adjustments[column] = all[key as keyof typeof all];
  return {deal,adjustments,taxes:{parcel_id:request.taxAssumptions.parcelId,payable_year:request.taxAssumptions.payableYear,annual_override:request.taxAssumptions.annualOverride,evidence}};
}
export function oneRelation(value: unknown, label: string): DbRow {
  const row = Array.isArray(value) ? value.length === 1 ? value[0] : null : value;
  if (!row || typeof row !== 'object') throw new Error(`Stored ${label} is missing or ambiguous.`);
  return row as DbRow;
}
export function fromDealRow(row: DbRow): DealAnalysis {
  const inputs = Object.fromEntries(Object.entries(INPUT_COLUMNS).map(([key,column])=>[key,key === 'closingDate' ? String(row[column]) : dbNumber(row[column])])) as unknown as DealInputs;
  const adj = oneRelation(row.deal_adjustments,'deal adjustments'), tax = oneRelation(row.deal_tax_assumptions,'tax assumptions');
  const closingAdjustments = {...DEFAULT_CLOSING_ADJUSTMENTS};
  for (const key of Object.keys(closingAdjustments) as (keyof typeof closingAdjustments)[]) {
    const value = adj[ADJUSTMENT_COLUMNS[key]];
    if (key === 'quotedTitlePremium' && value === null) {closingAdjustments.quotedTitlePremium=null;continue;}
    if (typeof closingAdjustments[key] === 'boolean') {if (typeof value !== 'boolean') throw new Error('Stored payment timing is invalid.');Object.assign(closingAdjustments,{[key]:value});}
    else Object.assign(closingAdjustments,{[key]:dbNumber(value)});
  }
  const purchaseAdjustments = {additionalCosts:dbNumber(adj.additional_purchase_costs),buyerCredits:dbNumber(adj.buyer_credits)};
  calculateDeal(inputs,closingAdjustments,purchaseAdjustments);
  if (row.status !== 'Reviewing' && row.status !== 'Researching') throw new Error('Stored deal status is invalid.');
  return {id:String(row.id),address:String(row.address),status:row.status,updatedAt:String(row.updated_at),revision:dbNumber(row.revision),inputs,closingAdjustments,purchaseAdjustments,
    taxAssumptions:{parcelId:String(tax.parcel_id ?? ''),payableYear:dbNumber(tax.payable_year),annualOverride:tax.annual_override === null ? null : dbNumber(tax.annual_override)},taxEvidence:tax.evidence as RentalTaxMatch};
}
