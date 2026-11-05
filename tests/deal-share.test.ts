import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDealShare, isMobileShareAvailable } from '../src/lib/deals/share.ts';
import { calculateDeal } from '../src/lib/calculations/deal.ts';
import { DEFAULT_CLOSING_ADJUSTMENTS } from '../src/lib/calculations/closing.ts';
import { spreadsheetExample } from '../src/lib/data/spreadsheet-example.ts';
import { money } from '../src/lib/format.ts';

test('native sharing is restricted to mobile devices with a secure supported browser', () => {
  const iphone = {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',maxTouchPoints:5};
  const android = {userAgent:'Mozilla/5.0 (Linux; Android 15)',maxTouchPoints:5};
  const ipadDesktopMode = {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',maxTouchPoints:5};
  const desktop = {userAgent:'Mozilla/5.0 (Windows NT 10.0)',maxTouchPoints:10};
  for (const mobile of [iphone,android,ipadDesktopMode]) {
    assert.equal(isMobileShareAvailable(mobile,true,true),true);
    assert.equal(isMobileShareAvailable(mobile,false,true),false);
    assert.equal(isMobileShareAvailable(mobile,true,false),false);
  }
  assert.equal(isMobileShareAvailable(desktop,true,true),false);
  assert.equal(isMobileShareAvailable({...ipadDesktopMode,maxTouchPoints:0},true,true),false);
});
test('share text reflects the current price, manual zero taxes, fees, credits and calculated estimates', () => {
  const input = {...spreadsheetExample,purchasePrice:123456,annualPropertyTaxes:0};
  const result = calculateDeal(input,{...DEFAULT_CLOSING_ADJUSTMENTS,brokerCredit:400,existingLoanPayoff:50000},{additionalCosts:123,buyerCredits:50});
  const text = formatDealShare('123 Main Street',input,result,'Manual annual-tax override: $0.00.');
  for (const expected of ['123 Main Street','Purchase price: $123,456.00','Annual property taxes: $0.00','Manual annual-tax override: $0.00.', 'Broker credit: $400.00','Existing loan payoff: $50,000.00','Additional purchase costs: $123.00','Purchase credits: $50.00',`Monthly cash flow: ${money(result.monthlyCashFlow,true)}`,`Cash to borrower at closing: ${money(result.cashOutProceeds,true)}`,'DEAL METRICS','PRIMARY INPUTS','Interest rate: 6.25%','PROJECT COST ESTIMATES','REFINANCE ESTIMATES','OPERATING ASSUMPTIONS','MONTHLY INCOME & EXPENSES']) assert.ok(text.includes(expected),expected);
  assert.ok(!text.includes('NaN'));
  assert.ok(!text.includes('undefined'));
});
test('sharing without an address or rateable project preserves unavailable metrics', () => {
  const input = {...spreadsheetExample,purchasePrice:0,rehabBudget:0,holdingCosts:0,unexpectedConstructionCosts:0};
  const result = calculateDeal(input);
  const text = formatDealShare('',input,result,'County estimate');
  assert.ok(text.includes('Property address not provided'));
  assert.ok(text.includes('Rating: Not rated'));
  assert.ok(text.includes('Capital recovered: N/A'));
  assert.ok(text.includes('Cash-on-cash return: N/A'));
});
