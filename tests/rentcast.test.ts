import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupRentCast } from '../src/lib/rentcast/lookup.ts';
import { canAutofillRent, isCompletePropertyAddress } from '../src/domain/property-lookup.ts';
const address='2221 Eby Avenue, Fort Wayne, IN 46802';
const record={formattedAddress:'2221 Eby Ave, Fort Wayne, IN 46802',addressLine1:'2221 Eby Ave',city:'Fort Wayne',state:'IN',zipCode:'46802',propertyType:'Single Family',bedrooms:0,bathrooms:1,squareFootage:1250,lotSize:6000,yearBuilt:1940,lastSalePrice:80000,lastSaleDate:'2025-12-19T00:00:00.000Z',features:{garage:false,heatingType:'Forced Air',floorCount:2},propertyTaxes:{2024:{total:2200},2025:{total:2300}},taxAssessments:{2025:{value:100000}},owner:{names:['DO NOT RETURN']}};
const avm={rent:1400,rentRangeLow:1200,rentRangeHigh:1600,subjectProperty:record,comparables:[{},{}]};
function provider(records:unknown=[record],rent:unknown=avm,failedPath='') {
  const calls:{url:URL;init?:RequestInit}[]=[];
  const fetcher=(async(url:URL|RequestInfo,init?:RequestInit)=>{
    const parsed=new URL(String(url));calls.push({url:parsed,init});
    if(parsed.pathname===failedPath) return Response.json({message:'secret upstream error'},{status:429});
    return Response.json(parsed.pathname.endsWith('/properties')?records:rent);
  }) as typeof fetch;
  return {fetcher,calls};
}
test('queries exact addresses with server key headers and returns available facts and rental range',async()=>{
  const {fetcher,calls}=provider();
  const data=await lookupRentCast(address,{apiKey:'private-key',fetcher});
  assert.equal(calls.length,2);
  for(const {url,init} of calls) {
    assert.equal(url.origin,'https://api.rentcast.io');
    assert.equal(url.searchParams.get('address'),address);
    assert.equal(url.searchParams.size,url.pathname.endsWith('/properties')?1:3);
    assert.equal((init!.headers as Record<string,string>)['X-Api-Key'],'private-key');
    assert.equal(init!.cache,'no-store');
  }
  assert.deepEqual(data.rent,{monthly:1400,low:1200,high:1600,perUnit:false,comparableCount:2});
  assert.deepEqual(data.warnings,[]);
  assert.ok(data.facts.some(f=>f.label==='Bedrooms'&&f.value==='0'));
  assert.ok(data.facts.some(f=>f.label==='Living area'&&f.value==='1,250 sq ft'));
  assert.ok(data.facts.some(f=>f.label==='Garage'&&f.value==='No'));
  assert.ok(data.facts.some(f=>f.label==='Property tax (historical) · 2025'));
  assert.ok(!JSON.stringify(data).includes('DO NOT RETURN'));
  assert.ok(!JSON.stringify(data).includes('private-key'));
});
test('keeps partial results when records or rental AVM is unavailable',async()=>{
  const recordsOnly=await lookupRentCast(address,{apiKey:'key',...provider([record],avm,'/v1/avm/rent/long-term')});
  assert.equal(recordsOnly.rent,null);assert.ok(recordsOnly.facts.length>0);
  const rentOnly=await lookupRentCast(address,{apiKey:'key',...provider([record],avm,'/v1/properties')});
  assert.equal(rentOnly.rent!.monthly,1400);assert.ok(rentOnly.facts.length>0);
  assert.ok(!JSON.stringify(recordsOnly).includes('secret upstream error'));
});
test('rejects mismatched property addresses and ambiguous records',async()=>{
  const wrong={...record,addressLine1:'2223 Eby Ave',formattedAddress:'2223 Eby Ave, Fort Wayne, IN 46802'};
  await assert.rejects(lookupRentCast(address,{apiKey:'key',...provider([wrong],{...avm,subjectProperty:wrong})}),/unavailable/);
  const partial=await lookupRentCast(address,{apiKey:'key',...provider([record],{...avm,subjectProperty:wrong})});
  assert.equal(partial.rent,null);
});
test('ambiguous records without a matched subject never populate details',async()=>{
  await assert.rejects(lookupRentCast(address,{apiKey:'key',...provider([record,record],{...avm,subjectProperty:{}})}),/unavailable/);
});
test('supports full addresses without commas and preserves unit identity',async()=>{
  assert.ok((await lookupRentCast('2221 Eby Ave Fort Wayne IN 46802',{apiKey:'key',...provider()})).rent);
  const unit={...record,addressLine2:'Apt 2',formattedAddress:'2221 Eby Ave, Apt 2, Fort Wayne, IN 46802'};
  assert.ok((await lookupRentCast('2221 Eby Ave, Apt 2, Fort Wayne, IN 46802',{apiKey:'key',...provider([unit],{...avm,subjectProperty:unit})})).rent);
  await assert.rejects(lookupRentCast('2221 Eby Ave, Apt 3, Fort Wayne, IN 46802',{apiKey:'key',...provider([unit],{...avm,subjectProperty:unit})}),/unavailable/);
});
test('multifamily rents are explicitly per-unit and unknown numbers are not invented',async()=>{
  const multi={...record,propertyType:'Multi-Family',bedrooms:null,squareFootage:'1250'};
  const data=await lookupRentCast(address,{apiKey:'key',...provider([multi],{...avm,subjectProperty:multi,rentRangeLow:null})});
  assert.equal(data.rent!.perUnit,true);assert.equal(data.rent!.low,null);
  assert.ok(data.warnings.some(w=>w.includes('one unit')));
  assert.ok(!data.facts.some(f=>f.label==='Bedrooms'||f.label==='Living area'));
});
test('input validation, cancellation and missing configuration do not fabricate results',async()=>{
  const {fetcher,calls}=provider();
  for(const value of ['Eby Avenue','2221 Eby Ave','x'.repeat(241)]) {
    assert.equal(isCompletePropertyAddress(value),false);
    await assert.rejects(lookupRentCast(value,{apiKey:'key',fetcher}));
  }
  await assert.rejects(lookupRentCast(address,{apiKey:'',fetcher}),/configured/);
  assert.equal(calls.length,0);
  const controller=new AbortController();controller.abort();
  await assert.rejects(lookupRentCast(address,{apiKey:'key',fetcher,signal:controller.signal}),/interrupted/);
});
test('automatic rent fills only empty or previously automatic values',()=>{
  assert.equal(canAutofillRent('',null),true);
  assert.equal(canAutofillRent('1400','1400'),true);
  assert.equal(canAutofillRent('1500','1400'),false);
  assert.equal(canAutofillRent('0',null),false);
  assert.equal(canAutofillRent('1400',null),false);
});
