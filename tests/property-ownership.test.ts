import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePurchase,hasPortfolioRecords } from '../src/lib/persistence/property-ownership.ts';
const purchase={dealId:'11111111-1111-4111-8111-111111111111',revision:1,purchasePrice:80000,purchaseDate:'2026-01-01'};
test('purchase requires a saved deal revision, confirmed price and real nonfuture date',()=>{
  assert.deepEqual(validatePurchase(purchase,'2026-11-09'),purchase);
  for(const patch of [{dealId:'bad'},{revision:0},{purchasePrice:'80000'},{purchasePrice:NaN},{purchasePrice:-1},{purchaseDate:'2026-02-30'},{purchaseDate:'2026-11-10'},{purchaseDate:''}])assert.throws(()=>validatePurchase({...purchase,...patch},'2026-11-09'));
});
test('ownership without recorded financials must not fabricate actual portfolio performance',()=>{
  assert.equal(hasPortfolioRecords({lifecycle:'owned'}),false);
  const row={beds:3,baths:1,square_feet:1171,year_built:1928,garage:'Detached',lot_square_feet:6268,property_type:'Single Family',status:'Rehab',property_financials:[{}],property_operations:[{}],property_valuations:[{is_current:true}]};
  assert.equal(hasPortfolioRecords(row),true);
  assert.equal(hasPortfolioRecords({...row,property_valuations:[]}),false);
  assert.equal(hasPortfolioRecords({...row,property_financials:[]}),false);
});
