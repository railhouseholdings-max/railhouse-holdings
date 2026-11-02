import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { RentalTaxParcel } from '../src/domain/property-tax.ts';
import { estimateCountyRentalTaxes, selectAnnualTaxes, withSelectedPropertyTaxes, roundAssessment } from '../src/lib/calculations/tax-estimate.ts';
import { matchRentalParcel, normalizeParcelId } from '../src/lib/taxes/rental-lookup.ts';
import { calculateDeal } from '../src/lib/calculations/deal.ts';
import { DEFAULT_CLOSING_ADJUSTMENTS, closingLoanFromDeal, estimateClosingCosts } from '../src/lib/calculations/closing.ts';
import { DEFAULT_PURCHASE_ADJUSTMENTS } from '../src/lib/calculations/purchase.ts';
import { spreadsheetExample } from '../src/lib/data/spreadsheet-example.ts';
import { assessDealStrength } from '../src/lib/calculations/deal-strength.ts';
const snapshot = JSON.parse(readFileSync(new URL('../src/lib/taxes/data/allen-rentals-2026.json',import.meta.url),'utf8'));
const lines: string[] = snapshot.rows.split('\n');
function sourceParcel(id: string): RentalTaxParcel {
  const rows = lines.filter(line=>line.split('\t')[0]===normalizeParcelId(id));
  assert.equal(rows.length,1,'Source parcel must be unambiguous');
  const r=rows[0].split('\t'), nb=snapshot.neighborhoods[Number(r[3])];
  const num=(v:string)=>v===''?null:Number(v);
  return {parcelId:r[0],address:r[1],zip:r[2],neighborhood:nb[0],neighborhoodName:nb[1],grm:num(r[4]),assessedAsRental:r[5]==='Y'?true:r[5]==='N'?false:null,propertyClass:r[6],baseRentAssessment:num(r[7]),incomeCap2:num(r[8]),incomeCap3:num(r[9]),otherCap3:num(r[10]),lookupRow:Number(r[11])};
}
const eby=sourceParcel('02-12-10-306-013.000-074'), laverne=sourceParcel('02-08-32-301-012.000-072');
const meta=snapshot.metadata;
const estimate=(parcel=eby,rent:number|null=1400,year=2027)=>estimateCountyRentalTaxes(parcel,meta,rent,year);
test('direct workbook extraction verifies Eby and Laverne inputs and projected-rent scenarios', () => {
  assert.equal(meta.assessmentYear,2026); assert.equal(meta.payableYear,2027);
  assert.equal(eby.neighborhood,'471211-074');assert.equal(eby.grm,94.57);assert.equal(eby.lookupRow,22963);
  assert.equal(laverne.neighborhood,'727601-072');assert.equal(laverne.grm,84.14);assert.equal(laverne.lookupRow,68494);
  assert.equal(estimate().assessedValue,132400);assert.equal(estimate().annualTaxes,2330.24);
  assert.equal(estimate(laverne,1700).assessedValue,143000);assert.equal(estimate(laverne,1700).annualTaxes,2516.8);
  assert.equal(eby.assessedAsRental,false);assert.match(estimate().warning!,/not assessed as a rental/);
});
test('normalized exact addresses and formatted/unformatted parcel IDs match', () => {
  const records=[eby,laverne];
  for(const query of [{address:'2221 Eby Avenue, Fort Wayne, Indiana 46802'},{address:' 2221 EBY AVE. '},{parcelId:'02-12-10-306-013.000-074'},{address:'021210306013000074'}]) assert.equal(matchRentalParcel(records,query).status,'found');
  assert.equal(matchRentalParcel(records,{address:'2115 Laverne Avenue, Fort Wayne, IN 46805'}).status,'found');
  for(const address of ['222 Eby Ave','2221 Eby','2221 Eby Ave, Austin, TX 78701','2221 Eby Ave, Fort Wayne, IN 46805']) assert.equal(matchRentalParcel(records,{address}).status,'missing');
  assert.equal(matchRentalParcel(records,{address:'2115 Laverne Ave',parcelId:eby.parcelId}).status,'conflict');
  assert.equal(matchRentalParcel(records,{parcelId:'123'}).status,'missing');
});
test('ambiguous addresses and conflicting duplicate parcels are rejected, not first matched', () => {
  const second={...eby,parcelId:'021210306013000075'};
  assert.equal(matchRentalParcel([eby,second],{address:'2221 Eby Ave'}).status,'ambiguous');
  assert.equal(matchRentalParcel([eby,second],{parcelId:eby.parcelId}).status,'found');
  assert.equal(matchRentalParcel([eby,{...eby,grm:100}],{parcelId:eby.parcelId}).status,'ambiguous');
});
test('Excel nearest-$100 rounding includes half-up boundaries', () => {
  for(const [value,expected] of [[132449.99,132400],[132450,132500],[132450.01,132500],[0,0],[50,100]]) assert.equal(roundAssessment(value),expected);
  assert.throws(()=>roundAssessment(-1));
});
test('missing records, GRM, rent and unsupported classes/components do not become zero taxes', () => {
  assert.equal(estimateCountyRentalTaxes(null,null,1400,2027).status,'missing');
  for(const change of [{grm:0},{grm:null},{neighborhood:''},{propertyClass:'101'},{incomeCap3:1000},{otherCap3:500},{incomeCap2:94700},{incomeCap2:null},{baseRentAssessment:null}]) assert.equal(estimate({...eby,...change}).annualTaxes,null);
  for(const rent of [null,0,-1,NaN]) assert.equal(estimate(eby,rent).annualTaxes,null);
});
test('the 12% factor cannot leak into other assessment or payable years', () => {
  assert.equal(estimate(eby,1400,2028).annualTaxes,null);
  assert.equal(estimateCountyRentalTaxes(eby,{...meta,assessmentYear:2025,payableYear:2026},1400,2026).annualTaxes,null);
  assert.equal(estimateCountyRentalTaxes(eby,{...meta,assessmentYear:2027,payableYear:2028},1400,2028).annualTaxes,null);
});
test('manual override wins, including zero, even with missing or unsupported county data', () => {
  const missing=estimate({...eby,incomeCap3:1000});
  for(const county of [estimate(),missing]) {
    assert.equal(selectAnnualTaxes('0',county).annualTaxes,0);
    assert.equal(selectAnnualTaxes(' 1234.56 ',county).annualTaxes,1234.56);
    assert.equal(selectAnnualTaxes('-1',county).source,'missing');
    assert.equal(selectAnnualTaxes('NaN',county).annualTaxes,null);
  }
  assert.equal(selectAnnualTaxes('',estimate()).annualTaxes,2330.24);
  assert.equal(selectAnnualTaxes('  ',missing).annualTaxes,null);
  assert.equal(selectAnnualTaxes('0',estimate(eby,1400,2028)).annualTaxes,0);
});
test('selected tax amount propagates identically to preview, cash flow, escrow, closing costs, explanations and ratings', () => {
  const current={...spreadsheetExample,arv:151000,monthlyRent:1400,annualPropertyTaxes:99999};
  const automatic=selectAnnualTaxes('',estimate());
  const input=withSelectedPropertyTaxes(current,automatic);
  const result=calculateDeal(input,DEFAULT_CLOSING_ADJUSTMENTS,DEFAULT_PURCHASE_ADJUSTMENTS);
  const preview=estimateClosingCosts(closingLoanFromDeal(input),DEFAULT_CLOSING_ADJUSTMENTS);
  assert.equal(current.annualPropertyTaxes,99999);
  assert.equal(result.monthlyTaxes,194.19);assert.equal(preview.monthlyTaxes,194.19);
  assert.deepEqual(preview,result.closing);
  assert.match(automatic.explanation,/2330.24/);
  const zero=selectAnnualTaxes('0',estimate());
  const noTaxes=calculateDeal(withSelectedPropertyTaxes(current,zero),DEFAULT_CLOSING_ADJUSTMENTS,DEFAULT_PURCHASE_ADJUSTMENTS);
  assert.equal(noTaxes.monthlyTaxes,0);
  assert.equal(Number((noTaxes.monthlyCashFlow-result.monthlyCashFlow).toFixed(2)),194.19);
  assert.equal(Number((result.closing!.escrowDeposit-noTaxes.closing!.escrowDeposit).toFixed(2)),776.76);
  assert.equal(Number((result.refinanceCosts-noTaxes.refinanceCosts).toFixed(2)),776.76);
  assert.equal(Number((noTaxes.netProjectRecovery-result.netProjectRecovery).toFixed(2)),776.76);
  const strength=assessDealStrength({...result,arv:current.arv,monthlyRent:current.monthlyRent});
  assert.equal(strength.cashFlowStatus,result.monthlyCashFlow<0?'Negative':result.monthlyCashFlow<=50?'Neutral':'Positive');
  assert.throws(()=>withSelectedPropertyTaxes(current,selectAnnualTaxes('',estimate(eby,1400,2028))),/missing/);
  assert.deepEqual(calculateDeal(withSelectedPropertyTaxes({...current,annualPropertyTaxes:NaN},automatic),DEFAULT_CLOSING_ADJUSTMENTS,DEFAULT_PURCHASE_ADJUSTMENTS),result);
});

test('real workbook mixed-cap parcel is not silently taxed entirely as residential', () => {
  const mixed=sourceParcel('02-12-01-256-002.000-074');
  assert.equal(mixed.address,'406 RIVER BEND CT');
  assert.equal(mixed.incomeCap3,900);
  assert.notEqual(mixed.incomeCap2,mixed.baseRentAssessment);
  assert.equal(estimate(mixed).annualTaxes,null);
  assert.match(estimate(mixed).message,/3%-cap/);
  assert.equal(selectAnnualTaxes('3000',estimate(mixed)).annualTaxes,3000);
});
