import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTaxRecord, supportsTaxLookup } from '../src/lib/taxes/property-taxes.ts';
const address = '2221 Eby Avenue, Fort Wayne, IN 46802';
const row = { PropertyAddress1:'2221 Eby Ave', PropertyCity:'Fort Wayne', PropertyState:'IN', PayYear:2026, SpringTax:1205.04, FallTax:1205.04, DuplicateNumber:1908310, StateKey:'02-12-10-306-013.000-074', Status:'A', TaxType:'R', CurrentAccountBalance:1205.04, SpringBalanceDue:0 };
const data = { Results:[row], systemParameters:[{PayYear:2026}] };
test('uses both annual billed installments, not the remaining balance', () => {
  const record = matchTaxRecord(data, address)!;
  assert.equal(record.annualTaxes, 2410.08);
  assert.equal(record.payYear, 2026);
  assert.equal(record.sourceUrl, 'https://lowtaxinfo.com/allencounty/1908310-2026');
});
test('requires exact unambiguous active real-estate address and current tax year', () => {
  assert.equal(matchTaxRecord(data, '2223 Eby Ave, Fort Wayne, IN'), null);
  for (const change of [{PayYear:2025}, {Status:'I'}, {TaxType:'P'}, {PropertyCity:'Other'}, {SpringTax:NaN}, {FallTax:-1}]) {
    assert.equal(matchTaxRecord({...data, Results:[{...row,...change}]}, address), null);
  }
  assert.equal(matchTaxRecord({...data,Results:[row,row]}, address), null);
  assert.equal(matchTaxRecord({}, address), null);
});
test('unsupported areas do not receive a guessed county record', () => {
  assert.equal(supportsTaxLookup('123 Main St, Austin, TX'), false);
  assert.equal(matchTaxRecord(data, '2221 Eby Ave, Austin, TX'), null);
});
