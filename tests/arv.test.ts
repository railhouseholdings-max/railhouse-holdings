import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AdjustmentFeature, ArvInput, AdjustmentRate } from '../src/domain/arv.ts';
import { estimateARV } from '../src/lib/arv/engine.ts';
import { adjustComparable } from '../src/lib/arv/adjustments.ts';
import { reconcileIndications } from '../src/lib/arv/reconciliation.ts';
import { normalizeWeights } from '../src/lib/arv/weighting.ts';
import { reconcilePropertyEvidence, distanceMiles } from '../src/lib/arv/normalization.ts';
import { validateArvInput } from '../src/lib/arv/validation.ts';
import { EBY_CALIBRATION, historicalEbyRates } from '../src/lib/arv/calibration.ts';
import { importComparableCsv } from '../src/lib/arv/import.ts';
const fixture=():ArvInput=>JSON.parse(readFileSync(new URL('./fixtures/arv/synthetic-input.json',import.meta.url),'utf8'));
function rate(value:number):AdjustmentRate {return {value,basis:'current-market',evidence:fixture().subject.sources[0],rationale:'SYNTHETIC supported rate for unit tests; not a real market study.',confidence:0.9};}
const adjusted=(feature:AdjustmentFeature,value:number,change:Record<string,unknown>)=>{const input=fixture();input.settings={rates:{[feature]:rate(value)}};Object.assign(input.comparables[0],change);return adjustComparable(input,input.subject,input.comparables[0]);};
test('deterministic valuation preserves inputs, ordering, normalized bounded weights and complete sources',()=>{
  const input=fixture(),before=JSON.stringify(input);const a=estimateARV(input),b=estimateARV(input);
  assert.deepEqual(a,b);assert.equal(JSON.stringify(input),before);assert.equal(a.status,'final');
  assert.ok(a.conservativeArv!<=a.likelyArv!&&a.likelyArv!<=a.highArv!);
  assert.ok(a.sources.length>0);assert.equal(a.comparables.length,4);
  assert.ok(Math.abs(a.comparables.reduce((sum,c)=>sum+c.weight,0)-1)<1e-10);
  assert.ok(a.comparables.every(c=>c.weight<=0.45));
  assert.deepEqual(estimateARV({...input,comparables:[...input.comparables].reverse()}),a);
});
test('active/pending, future and old transactions cannot become closed-sale evidence',()=>{
  for(const status of ['active','pending','unknown'] as const){const i=fixture();i.comparables.forEach(c=>c.sale.status=status);assert.equal(estimateARV(i).likelyArv,null);}
  for(const date of ['2026-04-25','2024-01-01']){const i=fixture();i.comparables.forEach(c=>c.sale.date=date);assert.equal(estimateARV(i).status,'insufficient-evidence');}
  const i=fixture();i.comparables.forEach(c=>c.sale.source.status='inferred');assert.equal(estimateARV(i).likelyArv,null);
});
test('same type, unit count, distance, arms length and submarket substitution are enforced',()=>{
  for(const change of [{propertyType:'Condo'},{units:2},{distanceMiles:1.6},{glaSqFt:100},{submarket:'Different market'}]){
    const i=fixture();i.comparables.forEach(c=>Object.assign(c,change));assert.equal(estimateARV(i).likelyArv,null);
  }
  const i=fixture();i.comparables.forEach(c=>{c.distanceMiles=1.3;c.submarket=null;});assert.equal(estimateARV(i).likelyArv,null);
  i.comparables.forEach(c=>c.competingMarketEvidence='SYNTHETIC buyer-substitution verification');assert.notEqual(estimateARV(i).likelyArv,null);
  i.comparables.forEach(c=>c.sale.armsLength=false);assert.equal(estimateARV(i).likelyArv,null);
});
test('GLA/bath/garage/lot adjustments have positive and negative directions',()=>{
  for(const [feature,value,lower,higher,expected] of [['glaSqFt',35,971,1371,7000],['bathrooms',2500,0.5,1.5,2500],['garageSpaces',4000,0,2,4000],['lotSqFt',0.7,5268,7268,700]] as const){
    for(const [compValue,amount] of [[lower,expected],[higher,-expected]]){const a=adjusted(feature,value,{[feature]:compValue}).adjustments.find(a=>a.feature===feature)!;assert.equal(a.amount,amount);assert.equal(a.direction,amount>0?'up':'down');assert.ok(a.evidence.reference);}
  }
});
test('small GLA changes are disclosed immaterial and do not trigger an unsupported adjustment',()=>{
  const result=adjusted('glaSqFt',35,{glaSqFt:1100});assert.equal(result.adjustments.find(a=>a.feature==='glaSqFt')!.amount,0);
});
test('basement is separate from above-grade GLA and finished versus unfinished areas do not double-count',()=>{
  const i=fixture();i.settings={rates:{basementFinishedSqFt:rate(15),basementUnfinishedSqFt:rate(3)}};i.comparables[0].basementFinishedSqFt=154.5;
  const a=adjustComparable(i,i.subject,i.comparables[0]);assert.equal(a.adjustments.find(a=>a.feature==='basementFinishedSqFt')!.amount,1500);assert.equal(a.adjustments.find(a=>a.feature==='basementUnfinishedSqFt')!.amount,-300);assert.ok(!a.adjustments.some(a=>a.feature==='glaSqFt'));assert.equal(a.netAdjustment,1200);
});
test('flood and quality/condition superior/inferior signs are explicit and unsupported differences lower confidence',()=>{
  assert.equal(adjusted('floodZone',3500,{floodZone:'X'}).adjustments.find(a=>a.feature==='floodZone')!.amount,-3500);
  assert.equal(adjusted('condition',5000,{condition:'C2'}).adjustments.find(a=>a.feature==='condition')!.amount,-5000);
  assert.equal(adjusted('condition',5000,{condition:'C4'}).adjustments.find(a=>a.feature==='condition')!.amount,5000);
  assert.equal(adjusted('quality',7000,{quality:'Q3'}).adjustments.find(a=>a.feature==='quality')!.amount,-7000);
  const i=fixture();i.comparables.forEach(c=>c.condition=null);const r=estimateARV(i);assert.equal(r.confidence.level,'Low');assert.ok(r.confidence.score<=39);assert.equal(r.status,'provisional');
});
test('net versus gross adjustment percentages retain opposing adjustment magnitude',()=>{
  const i=fixture();i.settings={rates:{glaSqFt:rate(35),garageSpaces:rate(4000)}};i.comparables[0].glaSqFt=971;i.comparables[0].garageSpaces=2;
  const r=adjustComparable(i,i.subject,i.comparables[0]);assert.equal(r.netAdjustment,3000);assert.equal(r.grossAdjustmentPercent,11000/148000*100);assert.equal(r.netAdjustmentPercent,3000/148000*100);
});
test('large manual supported adjustments exclude high-adjustment comps and duplicate features are rejected',()=>{
  const i=fixture();i.comparables[0].manualAdjustments=[{feature:'external',amount:100000,direction:'up',subjectValue:'none',comparableValue:'synthetic external influence',confidence:0.9,evidence:i.subject.sources[0],rationale:'Synthetic adjustment stress test'}];const r=estimateARV(i);assert.equal(r.comparables.length,3);assert.ok(r.excluded.some(c=>c.reason.includes('40%')));
  i.comparables[0].manualAdjustments.push(i.comparables[0].manualAdjustments[0]);assert.throws(()=>estimateARV(i),/Duplicate/);
});
test('proposed layout is used and no unspecified bedroom/GLA additions are invented',()=>{
  const i=fixture();i.proposed={...i.proposed,bedrooms:4,glaSqFt:1371};i.settings={rates:{glaSqFt:rate(35)}};const r=estimateARV(i);assert.equal(r.proposed.glaSqFt,1371);assert.ok(r.comparables.every(c=>c.adjustments.some(a=>a.feature==='glaSqFt'&&a.amount===7000)));assert.ok(r.comparables.every(c=>!c.adjustments.some(a=>a.feature==='bedrooms')));
  delete i.proposed;const p=estimateARV(i);assert.equal(p.proposed.glaSqFt,1171);assert.equal(p.proposed.bedrooms,3);assert.equal(p.status,'provisional');assert.ok(p.assumptions.some(a=>a.includes('provisionally')));
});
test('Eby fallbacks are opt-in, scoped, historical, and do not extrapolate half-bath rates',()=>{
  const i=fixture();i.comparables[0].glaSqFt=971;assert.ok(adjustComparable(i,i.subject,i.comparables[0]).unresolved.some(x=>x.includes('glaSqFt')));
  i.settings={historicalEbyScope:'SYNTHETIC case in a reviewed competing Fort Wayne vintage single-family area.'};assert.equal(adjustComparable(i,i.subject,i.comparables[0]).adjustments.find(a=>a.feature==='glaSqFt')!.amount,7000);
  i.subject.address='SYNTHETIC subject, Austin, TX';assert.ok(!adjustComparable(i,i.subject,i.comparables[0]).adjustments.some(a=>a.feature==='glaSqFt'));
  i.subject.address=fixture().subject.address;i.comparables[0].bathrooms=2;assert.ok(adjustComparable(i,i.subject,i.comparables[0]).unresolved.some(x=>x.includes('bathrooms')));
  assert.equal(historicalEbyRates().marketTime!.value,2.4);
});
test('time adjustments require sourced evidence and respect appreciation/depreciation',()=>{
  const i=fixture();i.comparables[0].sale.date='2025-10-24';i.settings={rates:{marketTime:rate(2.4)}};const a=adjustComparable(i,i.subject,i.comparables[0]).adjustments.find(a=>a.feature==='marketTime')!;assert.ok(a.amount>0);
  i.settings.rates!.marketTime=rate(-2.4);assert.ok(adjustComparable(i,i.subject,i.comparables[0]).adjustments.find(a=>a.feature==='marketTime')!.amount<0);
});
test('source conflicts and duplicates are preserved rather than boosting comparable count',()=>{
  const i=fixture();i.comparables.push({...structuredClone(i.comparables[0]),id:'other-provider-copy',sale:{...i.comparables[0].sale,price:160000}});const r=estimateARV(i);assert.equal(r.comparables.length,4);assert.ok(r.comparables.some(c=>c.comparable.conflicts.length));assert.ok(r.confidence.score<=49);
  const other=structuredClone(i.subject);other.glaSqFt=1200;const merged=reconcilePropertyEvidence(i.subject,other);assert.equal(merged.glaSqFt,1171);assert.equal(merged.conflicts[0].field,'glaSqFt');
});
test('insufficient/missing critical characteristics return explicit null ARVs',()=>{
  for(const field of ['glaSqFt','units','propertyType'] as const){const i=fixture();i.subject[field]=null;delete i.proposed;const r=estimateARV(i);assert.equal(r.likelyArv,null);assert.equal(r.confidence.level,'Insufficient Evidence');}
  const i=fixture();i.comparables=i.comparables.slice(0,2);assert.equal(estimateARV(i).conservativeArv,null);
});
test('weight cap prevents a dominant indication and weak evidence expands bounds to observed extrema',()=>{
  const comps=estimateARV(fixture()).comparables;comps[0].rawWeight=1000;const w=normalizeWeights(comps);assert.equal(w[0].weight,0.45);assert.ok(Math.abs(w.reduce((s,c)=>s+c.weight,0)-1)<1e-10);
  const vals=[{value:100000,weight:0.05},{value:150000,weight:0.9},{value:200000,weight:0.05}];const strong=reconcileIndications(vals,false),weak=reconcileIndications(vals,true);assert.ok(weak.conservativeArv<strong.conservativeArv);assert.ok(weak.highArv>strong.highArv);
});
test('partial Eby calibration tests only known adjusted indications, not fabricated original sales',()=>{
  const partial=JSON.parse(readFileSync(new URL('./fixtures/arv/eby-partial-calibration.json',import.meta.url),'utf8'));assert.equal(partial.rawComparableSales,null);assert.equal(partial.individualAdjustmentGrid,null);
  const r=reconcileIndications(EBY_CALIBRATION.adjustedIndications.map(value=>({value,weight:0.25})),true);assert.ok(Math.abs(r.likelyArv-151000)<=1000);assert.notEqual(r.likelyArv,151000);assert.notEqual(r.likelyArv,160000);
});
test('validation rejects impossible dates, non-finite prices and basement/GLA mistakes',()=>{
  const i=fixture();i.valuationDate='2026-02-30';assert.throws(()=>validateArvInput(i));
  i.valuationDate='2026-04-24';i.comparables[0].sale.price=NaN;assert.throws(()=>validateArvInput(i));i.comparables[0].sale.price=148000;i.proposed!.basementFinishedSqFt=900;assert.throws(()=>validateArvInput(i),/Finished basement/);
  assert.equal(distanceMiles({...fixture().subject,latitude:0,longitude:0},{...fixture().subject,latitude:0,longitude:0}),0);
});
test('CSV imports retain quoted addresses and explicit source/transaction status',()=>{
  const comps=importComparableCsv('id,address,provider,reference,retrievedAt,propertyType,units,glaSqFt,salePrice,saleDate,transactionStatus\nimport-1,"SYNTHETIC house, Fort Wayne, IN",Permitted export,local.csv#row2,2026-04-24,Single Family,1,1171,150000,2026-03-01,closed');assert.equal(comps[0].sale.price,150000);assert.equal(comps[0].address,'SYNTHETIC house, Fort Wayne, IN');assert.equal(comps[0].sale.source.status,'user-supplied');
  assert.throws(()=>importComparableCsv('id,address\n1,foo'),/needs/);assert.throws(()=>importComparableCsv('id,address\n1,"unclosed'),/Unclosed/);
});

test('missing or unavailable field evidence cannot produce final high-confidence ARV',()=>{
  const i=fixture();i.subject.evidence={};i.comparables.forEach(c=>c.evidence={});const r=estimateARV(i);assert.notEqual(r.status,'final');assert.equal(r.confidence.level,'Low');
  const j=fixture();j.comparables.forEach(c=>c.bedrooms=null);assert.equal(estimateARV(j).status,'provisional');assert.equal(estimateARV(j).confidence.level,'Low');
  const k=fixture();k.comparables.forEach(c=>c.evidence.condition='unavailable');assert.equal(estimateARV(k).confidence.level,'Low');
});
test('weak adjustment support does not create a premium and future adjustment evidence is not used',()=>{
  const i=fixture();i.proposed!.glaSqFt=1371;i.settings={rates:{glaSqFt:{...rate(35),confidence:0.01}}};const r=estimateARV(i);assert.ok(r.comparables.every(c=>!c.adjustments.some(a=>a.feature==='glaSqFt')));assert.equal(r.confidence.level,'Low');
  const j=fixture();j.settings={historicalEbyScope:'Reviewed vintage Fort Wayne neighborhood'};j.valuationDate='2025-04-24';j.comparables.forEach(c=>{c.sale.date='2025-03-01';c.glaSqFt=971;});const q=estimateARV(j);assert.ok(q.comparables.every(c=>!c.adjustments.some(a=>a.feature==='glaSqFt')));
  const k=fixture();k.comparables.forEach(c=>c.manualAdjustments=[{feature:'external',amount:20000,direction:'up',subjectValue:'A',comparableValue:'B',evidence:{...k.subject.sources[0],status:'inferred',reliability:0.1},confidence:0.01,rationale:'Unsupported test adjustment'}]);const result=estimateARV(k);assert.ok(result.comparables.every(c=>c.adjustedPrice===c.comparable.sale.price));assert.equal(result.confidence.level,'Low');
});

test('preliminary photos are never silently promoted to a final verified appraisal-grade result',()=>{
  const i=fixture();i.comparables.forEach(c=>c.conditionAssessment='preliminary-photo');const r=estimateARV(i);assert.equal(r.status,'provisional');assert.ok(r.confidence.score<=69);assert.ok(r.confidence.reasons.some(reason=>reason.includes('preliminary')));
});
test('an unusually expensive otherwise similar sale cannot drive the central ARV',()=>{
  const i=fixture();i.comparables[0].sale.price=1000000;const r=estimateARV(i);assert.ok(r.likelyArv!<160000);assert.ok(r.excluded.some(c=>c.reason.includes('outlier')));
});

test('manual adjustments enforce as-of evidence just like rates, with explicit historical effective dates',()=>{
  const i=fixture();i.comparables.forEach(c=>c.manualAdjustments=[{feature:'external',amount:20000,direction:'up',subjectValue:'A',comparableValue:'B',evidence:{...i.subject.sources[0],retrievedAt:'2026-05-01'},confidence:0.9,rationale:'SYNTHETIC study created after this valuation'}]);
  const blocked=estimateARV(i);assert.ok(blocked.comparables.every(c=>c.adjustedPrice===c.comparable.sale.price));assert.equal(blocked.status,'provisional');
  i.comparables.forEach(c=>c.manualAdjustments![0].effectiveDate='2026-04-01');
  assert.ok(estimateARV(i).comparables.every(c=>c.adjustedPrice===c.comparable.sale.price!+20000));
});
