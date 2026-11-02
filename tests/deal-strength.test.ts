import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDealStrength, gaugePosition } from '../src/lib/calculations/deal-strength.ts';
const base = { arv:120000, totalProjectCost:100000, monthlyRent:1500, monthlyCashFlow:250, recoveryPercent:100, monthlyPrincipalAndInterest:600, monthlyCapexReserve:100, cashRemainingInDeal:0 };
test('value created is net of rehab and all modeled project costs, not gross price growth', () => {
  const result = assessDealStrength(base);
  assert.equal(result.valueCreated,20000);
  assert.equal(result.valueCreatedPercent,20);
  assert.equal(result.rating,'Excellent');
});
test('each weak primary factor gates the overall score', () => {
  for (const change of [{monthlyCashFlow:-0.01},{recoveryPercent:84.99},{arv:99999}]) assert.equal(assessDealStrength({...base,...change}).rating,'Bad');
  assert.equal(assessDealStrength({...base,monthlyCashFlow:0,recoveryPercent:85,arv:100000}).rating,'Good');
});
test('excellent requires every stronger target simultaneously', () => {
  for (const change of [{monthlyCashFlow:249.99},{recoveryPercent:99.99},{arv:119999}]) assert.equal(assessDealStrength({...base,...change}).rating,'Good');
  assert.equal(assessDealStrength({...base,recoveryPercent:130}).rating,'Excellent');
});
test('cash flow labels distinguish negative, neutral, and positive at the boundaries', () => {
  for (const [monthlyCashFlow,expected] of [[-0.01,'Negative'],[0,'Neutral'],[50,'Neutral'],[50.01,'Positive']] as const) assert.equal(assessDealStrength({...base,monthlyCashFlow}).cashFlowStatus,expected);
});
test('zero bases remain unrated and do not display infinite returns', () => {
  assert.equal(assessDealStrength({...base,totalProjectCost:0,recoveryPercent:null}).rating,null);
  assert.equal(assessDealStrength({...base,totalProjectCost:0}).valueCreatedPercent,null);
  assert.equal(assessDealStrength({...base,arv:0}).rating,null);
  assert.equal(assessDealStrength({...base,monthlyRent:0}).rating,null);
  assert.equal(assessDealStrength(base).cashOnCashPercent,null);
  assert.equal(assessDealStrength({...base,cashRemainingInDeal:-1000}).cashOnCashPercent,null);
  assert.equal(assessDealStrength({...base,monthlyPrincipalAndInterest:0}).debtCoverage,null);
});
test('supporting metrics distinguish CapEx from NOI and annualize cash flow', () => {
  const result=assessDealStrength({...base,cashRemainingInDeal:20000});
  assert.equal(result.debtCoverage,950/600);
  assert.equal(result.cashOnCashPercent,15);
});
test('needles clamp to the dial range without changing actual metric values', () => {
  assert.equal(gaugePosition(-1000,-500,500),0);
  assert.equal(gaugePosition(1000,-500,500),1);
  assert.equal(gaugePosition(0,-500,500),0.5);
  assert.equal(gaugePosition(null,0,120),null);
  assert.equal(gaugePosition(NaN,0,120),null);
});
