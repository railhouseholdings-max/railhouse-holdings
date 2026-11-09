import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditEbyGrid, type EbyGrid } from '../src/lib/arv/eby-regression.ts';
import { EBY_CALIBRATION, EBY_SUBJECT } from '../src/lib/arv/calibration.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/arv/eby-appraisal-grid.json',import.meta.url),'utf8'));
test('original Eby line adjustments reproduce every closed grid net and adjusted value',()=>{
  const grid=fixture();const result=auditEbyGrid(grid);
  assert.equal(EBY_CALIBRATION.originalGridAvailable,true);
  assert.equal(EBY_SUBJECT.basementFinishedSqFt,255);
  result.comparisons.forEach((c,i)=>{
    const row=grid.closedSales[i];assert.equal(c.adjustedPrice,row.adjusted);assert.equal(c.netAdjustment,row.net);
    assert.equal(c.difference,0);assert.equal(c.netDifference,0);
    assert.equal(Number(c.grossAdjustmentPercent.toFixed(1)),row.grossPercent);
    assert.equal(Number(Math.abs(c.netAdjustmentPercent).toFixed(1)),row.netPercent);
    assert.ok(c.adjustments.every(a=>a.evidence.reference.includes(`page=${row.page}`)&&a.evidence.reference.includes(grid.sha256)));
  });
  assert.ok(result.comparisons[3].netAdjustmentPercent<0);
  assert.equal(result.comparisons[2].adjustments.find(a=>a.feature==='glaSqFt')?.amount,0);
  assert.equal(result.comparisons[3].adjustments.find(a=>a.feature==='glaSqFt')?.amount,-5900);
  assert.equal(result.comparisons[0].adjustments.find(a=>a.feature==='basementFinishedSqFt')?.amount,-1800);
  assert.equal(result.comparisons[1].adjustments.find(a=>a.feature==='basementFinishedSqFt')?.amount,2600);
});
test('Eby reconciliation calculates from evidence, without forcing the appraisal conclusion',()=>{
  const grid=fixture();const result=auditEbyGrid(grid);
  assert.equal(result.recordedWeightReconciliation.unroundedWeightedMean,151247.8614);
  assert.equal(result.recordedWeightReconciliation.likelyArv,151200);
  assert.equal(result.recordedWeightReconciliation.difference,200);
  assert.equal(result.independentEqualWeightSensitivity.likelyArv,151300);
  const changed=structuredClone(grid);changed.closedSales[0].amounts.garageSpaces+=1000;
  assert.equal(auditEbyGrid(changed).comparisons[0].adjustedPrice,result.comparisons[0].adjustedPrice+1000);
  assert.notEqual(auditEbyGrid(changed).recordedWeightReconciliation.likelyArv,result.recordedWeightReconciliation.likelyArv);
  assert.deepEqual(result,auditEbyGrid(grid));
});
test('Eby missing exact dates and active-listing conflict remain explicit, outside closed-sale weighting',()=>{
  const grid=fixture();const result=auditEbyGrid(grid);
  assert.ok(grid.closedSales.every((c:EbyGrid['closedSales'][number])=>c.saleMonth.length===7));
  assert.equal(result.excludedActiveListings.length,2);
  assert.equal(grid.activeContext[0].bathrooms,1.5);
  assert.notEqual(grid.activeContext[1].adjustedAskingPrice,grid.activeContext[1].reconciliationAddendumAdjustedAskingPrice);
  assert.ok(result.limitations.some(l=>l.includes('month-only')));
  assert.ok(result.limitations.some(l=>l.includes('conflicts')));
  assert.ok(result.limitations.some(l=>l.includes('does not independently derive')));
  grid.closedSales[0].status='active';assert.throws(()=>auditEbyGrid(grid));
});
