import test from "node:test";
import assert from "node:assert/strict";
import { estimatePurchaseCosts, DEFAULT_PURCHASE_ADJUSTMENTS, PURCHASE_STATEMENT_REFERENCE } from "../src/lib/calculations/purchase.ts";
import { DEFAULT_CLOSING_ADJUSTMENTS } from "../src/lib/calculations/closing.ts";
import { calculateDeal } from "../src/lib/calculations/deal.ts";
import { spreadsheetExample } from "../src/lib/data/spreadsheet-example.ts";

const sourceProject = { ...spreadsheetExample, purchasePrice: 80000, rehabBudget: 50000, holdingCosts: 0, unexpectedConstructionCosts: 0, arv: 151000, annualPropertyTaxes: 2410.08, annualInsurance: 970 };
const sourceRefinance = { ...DEFAULT_CLOSING_ADJUSTMENTS, annualFloodInsurance: 905, aggregateEscrowAdjustment: -604.99, brokerCredit: 339.75 };

test("all five buyer-paid fees reconcile to the purchase statement", () => {
  const r = estimatePurchaseCosts(80000);
  assert.deepEqual(r.items.map(item => item.amount), [25, 230, 30, 25, 4]);
  assert.equal(r.baselineClosingCosts, 314);
  assert.equal(r.grossClosingCosts, 314);
  assert.equal(r.buyerCredits, 0);
  assert.equal(r.acquisitionCost, 80314);
});

test("purchase and rehab reproduce $130,314 without adding the rehab twice", () => {
  const r = calculateDeal(sourceProject, sourceRefinance, DEFAULT_PURCHASE_ADJUSTMENTS);
  assert.equal(r.totalProjectCost, PURCHASE_STATEMENT_REFERENCE.buyerStatementTotal);
  assert.equal(r.purchaseClosingCosts, 314);
  assert.equal(r.purchase?.items.length, 5);
  assert.equal(r.refinanceCosts, 9336.12);
  assert.equal(r.cashOutProceeds, 105833.63);
  assert.ok(Math.abs(r.cashRemainingInDeal - 26060.37) < 0.000001);
});

test("purchase charges affect project capital, not refinance fees or rental cash flow", () => {
  const base = calculateDeal(sourceProject, sourceRefinance, DEFAULT_PURCHASE_ADJUSTMENTS);
  const changed = calculateDeal(sourceProject, sourceRefinance, { additionalCosts: 100, buyerCredits: 25 });
  assert.equal(changed.purchaseClosingCosts, 389);
  assert.equal(changed.totalProjectCost - base.totalProjectCost, 75);
  assert.ok(Math.abs(changed.cashRemainingInDeal - base.cashRemainingInDeal - 75) < 0.000001);
  assert.equal(changed.refinanceCosts, base.refinanceCosts);
  assert.equal(changed.cashOutProceeds, base.cashOutProceeds);
  assert.equal(changed.monthlyCashFlow, base.monthlyCashFlow);
});

test("observed flat fees do not acquire an invented purchase-price percentage", () => {
  assert.equal(estimatePurchaseCosts(160000).netClosingCosts, 314);
  assert.equal(estimatePurchaseCosts(40000).netClosingCosts, 314);
});

test("changing rehab adjusts the project once, without changing either closing quote", () => {
  const base = calculateDeal(sourceProject, sourceRefinance, DEFAULT_PURCHASE_ADJUSTMENTS);
  const changed = calculateDeal({ ...sourceProject, rehabBudget: 60000 }, sourceRefinance, DEFAULT_PURCHASE_ADJUSTMENTS);
  assert.equal(changed.totalProjectCost - base.totalProjectCost, 10000);
  assert.equal(changed.purchaseClosingCosts, base.purchaseClosingCosts);
  assert.equal(changed.refinanceCosts, base.refinanceCosts);
});

test("invalid purchase charges and credits cannot produce a negative acquisition cost", () => {
  assert.throws(() => estimatePurchaseCosts(-1), RangeError);
  assert.throws(() => estimatePurchaseCosts(80000, { additionalCosts: -1, buyerCredits: 0 }), RangeError);
  assert.throws(() => estimatePurchaseCosts(80000, { additionalCosts: 0, buyerCredits: Infinity }), RangeError);
  assert.throws(() => estimatePurchaseCosts(80000, { additionalCosts: 0, buyerCredits: 90000 }), RangeError);
});
