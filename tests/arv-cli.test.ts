import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const script=resolve('scripts/estimate-arv.ts');
test('CLI emits standalone machine-readable evidence JSON in offline mode',()=>{
  const stdout=execFileSync(process.execPath,['--experimental-strip-types',script,'--offline-demo','--json'],{encoding:'utf8'});
  const value=JSON.parse(stdout);assert.equal(value.scenarioName,'SYNTHETIC offline demonstration — not real sales');assert.equal(value.comparables.length,4);assert.ok(value.likelyArv>0);assert.ok(value.sources.every((s:{provider:string})=>s.provider.includes('SYNTHETIC')));
});
test('CLI audits the original Eby grid without claiming independently derived adjustments',()=>{
  const stdout=execFileSync(process.execPath,['--experimental-strip-types',script,'--eby-regression'],{encoding:'utf8'});const value=JSON.parse(stdout);assert.equal(value.originalGridAvailable,true);assert.equal(value.comparisons.length,4);assert.ok(value.comparisons.every((c:{difference:number})=>c.difference===0));assert.equal(value.excludedActiveListings.length,2);
  const invalid=spawnSync(process.execPath,['--experimental-strip-types',script,'--input'],{encoding:'utf8'});assert.equal(invalid.status,1);assert.ok(invalid.stderr.includes('Supply a value'));
});
