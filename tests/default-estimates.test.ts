import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDealFields, PRIMARY_DEAL_FIELDS, updateEstimatedFields, defaultFundingDate } from '../src/lib/deals/defaults.ts';
import { calculateDeal } from '../src/lib/calculations/deal.ts';
import { DEFAULT_CLOSING_ADJUSTMENTS } from '../src/lib/calculations/closing.ts';
import { DEFAULT_PURCHASE_ADJUSTMENTS } from '../src/lib/calculations/purchase.ts';
import type { DealInputs } from '../src/domain/models.ts';
test('new and cleared analyses leave core inputs and address-dependent taxes blank', () => {
  const first = initialDealFields('2026-10-30');
  assert.deepEqual(Object.keys(first).filter(key => first[key as keyof DealInputs] === '').sort(), [...PRIMARY_DEAL_FIELDS, "annualPropertyTaxes"].sort());
  assert.deepEqual(initialDealFields('2026-10-30'), first);
  assert.equal(first.closingDate, '2027-01-28');
  assert.equal(defaultFundingDate('2024-01-01'), '2024-03-31');
});
test('four supplied values plus a post-lookup tax estimate produce a complete calculation', () => {
  let fields = initialDealFields('2026-10-30');
  for (const [key, value] of [['purchasePrice','80000'],['rehabBudget','50000'],['arv','151000'],['monthlyRent','1400']] as const) {
    fields = updateEstimatedFields(fields, key, value, { contingency: true });
  }
  const inputs = Object.fromEntries(Object.entries(fields).map(([key,value]) => [key, key === 'closingDate' ? value : Number(value)])) as unknown as DealInputs;
  const result = calculateDeal({...inputs,annualPropertyTaxes:2330.24}, DEFAULT_CLOSING_ADJUSTMENTS, DEFAULT_PURCHASE_ADJUSTMENTS);
  assert.ok(Number.isFinite(result.monthlyCashFlow));
  assert.equal(fields.annualPropertyTaxes, "");
  assert.equal(inputs.unexpectedConstructionCosts, 2000);
});
test('contingency follows rehab until edited, while ARV never fabricates historical taxes', () => {
  let fields = initialDealFields('2026-10-30');
  fields = updateEstimatedFields(fields, 'rehabBudget', '75000', { contingency: true });
  assert.equal(fields.unexpectedConstructionCosts, '3000');
  fields = updateEstimatedFields(fields, 'arv', '302000', { contingency: true });
  assert.equal(fields.annualPropertyTaxes, '');
  fields = updateEstimatedFields(fields, 'arv', '151000', { contingency: false });
  fields = updateEstimatedFields(fields, 'rehabBudget', '1000', { contingency: false });
  assert.equal(fields.annualPropertyTaxes, '');
  assert.equal(fields.unexpectedConstructionCosts, '3000');
  assert.equal(initialDealFields('2026-10-30').annualPropertyTaxes, '');
});

test('ARV entry does not populate taxes before an address lookup result', () => {
  const blank = initialDealFields('2026-10-30');
  const pending = updateEstimatedFields(blank, 'arv', '302000', { contingency: true });
  assert.equal(pending.annualPropertyTaxes, '');
  const failedLookupEstimate = updateEstimatedFields(pending, 'arv', '302000', { contingency: true });
  assert.equal(failedLookupEstimate.annualPropertyTaxes, '');
  assert.equal(initialDealFields('2026-10-30').annualPropertyTaxes, '');
});
