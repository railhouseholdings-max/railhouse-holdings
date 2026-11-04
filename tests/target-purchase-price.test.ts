import test from 'node:test';
import assert from 'node:assert/strict';
import { targetPurchasePrice } from '../src/lib/calculations/target-purchase-price.ts';
import { calculateDeal } from '../src/lib/calculations/deal.ts';
import { assessDealStrength } from '../src/lib/calculations/deal-strength.ts';
import { spreadsheetExample } from '../src/lib/data/spreadsheet-example.ts';
import { DEFAULT_CLOSING_ADJUSTMENTS } from '../src/lib/calculations/closing.ts';

const input = {...spreadsheetExample, monthlyRent:3000};
const closing = DEFAULT_CLOSING_ADJUSTMENTS;
const purchase = { additionalCosts:1234.56, buyerCredits:500 };

test('target is the highest whole-dollar price that reaches Good with the actual fee model', () => {
  const original = calculateDeal(input, closing, purchase);
  const target = targetPurchasePrice(input, original);
  assert.notEqual(target, null);
  const atTarget = {...input, purchasePrice:target!};
  const result = calculateDeal(atTarget, closing, purchase);
  assert.equal(assessDealStrength({...result, arv:input.arv, monthlyRent:input.monthlyRent}).rating, 'Good');
  const above = calculateDeal({...atTarget, purchasePrice:target! + 1}, closing, purchase);
  assert.equal(assessDealStrength({...above, arv:input.arv, monthlyRent:input.monthlyRent}).rating, 'Moderate');
  assert.equal(result.monthlyCashFlow, original.monthlyCashFlow);
  assert.equal(result.netProjectRecovery, original.netProjectRecovery);
  assert.equal(targetPurchasePrice(atTarget, result), target);
});
test('value created caps the target when high LTV and credits make recovery nonbinding', () => {
  const scenario = {...input, refinanceLtv:100};
  const result = calculateDeal(scenario);
  const target = targetPurchasePrice(scenario, result);
  assert.notEqual(target, null);
  const atTarget = calculateDeal({...scenario, purchasePrice:target!});
  assert.ok(atTarget.totalProjectCost <= scenario.arv);
  assert.ok(atTarget.recoveryPercent! >= 85);
  assert.ok(calculateDeal({...scenario, purchasePrice:target! + 1}).totalProjectCost > scenario.arv);
});
test('no price-only target when cash flow is negative or fixed costs exceed feasibility', () => {
  const negative = {...input, monthlyRent:100};
  assert.equal(targetPurchasePrice(negative, calculateDeal(negative, closing)), null);
  const expensive = {...input, rehabBudget:1_000_000};
  assert.equal(targetPurchasePrice(expensive, calculateDeal(expensive, closing)), null);
  const noRecovery = {...input, refinanceLtv:0};
  assert.equal(targetPurchasePrice(noRecovery, calculateDeal(noRecovery)), null);
});
