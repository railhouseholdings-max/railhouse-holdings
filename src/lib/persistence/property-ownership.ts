import { UUID_PATTERN } from '../config/cloud.ts';
export interface PurchaseRequest {dealId:string;revision:number;purchasePrice:number;purchaseDate:string}
export function validatePurchase(value:unknown,today:string):PurchaseRequest {
  if(!value||typeof value!=='object')throw new Error('Invalid purchase.');
  const v=value as Record<string,unknown>;
  if(typeof v.dealId!=='string'||!UUID_PATTERN.test(v.dealId)||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw new Error('Save the latest analysis before recording a purchase.');
  if(typeof v.purchasePrice!=='number'||!Number.isFinite(v.purchasePrice)||v.purchasePrice<0||v.purchasePrice>1e9)throw new Error('Enter the actual purchase price.');
  if(typeof v.purchaseDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.purchaseDate)||!Number.isFinite(Date.parse(v.purchaseDate))||new Date(v.purchaseDate).toISOString().slice(0,10)!==v.purchaseDate||v.purchaseDate<'1900-01-01'||v.purchaseDate>today)throw new Error('Enter a valid purchase date on or before today.');
  return {dealId:v.dealId,revision:Number(v.revision),purchasePrice:v.purchasePrice,purchaseDate:v.purchaseDate};
}
/** Ownership alone is not enough evidence to include an asset in actual portfolio totals. */
export function hasPortfolioRecords(row:Record<string,unknown>):boolean {
  const one=(v:unknown)=>Array.isArray(v)&&v.length===1;
  const current=(v:unknown)=>Array.isArray(v)&&v.filter(r=>r.is_current===true).length===1;
  return ['beds','baths','square_feet','year_built','garage','lot_square_feet','property_type','status'].every(k=>row[k]!=null)
    &&one(row.property_financials)&&one(row.property_operations)&&current(row.property_valuations);
}
