import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ArvInput } from '../src/domain/arv.ts';
import { normalizeRentCastSales, createRentCastArvProvider, fixtureProvider } from '../src/lib/arv/providers.ts';
import { discoverAndEstimateARV } from '../src/lib/arv/discovery.ts';
import { runArvEstimate } from '../src/lib/arv/service.ts';
import { rentCastRequest, RentCastError } from '../src/lib/rentcast/client.ts';
const input=():ArvInput=>JSON.parse(readFileSync(new URL('./fixtures/arv/synthetic-input.json',import.meta.url),'utf8'));
const row={id:'SYNTHETIC-sale',formattedAddress:'SYNTHETIC recorded property, Fort Wayne, IN',propertyType:'Single Family',bedrooms:3,bathrooms:1,squareFootage:1200,lotSize:6200,yearBuilt:1928,lastSalePrice:150000,lastSaleDate:'2026-03-01T00:00:00.000Z',latitude:41.07,longitude:-85.15,features:{garageSpaces:1},owner:{names:['DO NOT EXPOSE']}};
test('provider normalizes actual record sales, never listed/AVM prices or unsupported condition/basement',()=>{
  const comps=normalizeRentCastSales([row,{...row,id:'asking-only',lastSalePrice:null,price:180000,status:'Active'},{...row,id:'invaliddate',lastSaleDate:'2026-02-30'}],input().subject,'2026-04-24');
  assert.equal(comps.length,1);assert.equal(comps[0].sale.price,150000);assert.equal(comps[0].condition,null);assert.equal(comps[0].basementFinishedSqFt,null);assert.equal(comps[0].evidence.units,'inferred');assert.equal(comps[0].sale.armsLength,null);assert.ok(!JSON.stringify(comps).includes('DO NOT EXPOSE'));
});
test('documented discovery parameters and source traceability are maintained',async()=>{
  let called:URL|undefined;
  const fetcher=(async(url:URL|RequestInfo,init?:RequestInit)=>{called=new URL(String(url));assert.equal((init!.headers as Record<string,string>)['X-Api-Key'],'private');return Response.json([row]);}) as typeof fetch;
  const p=createRentCastArvProvider({apiKey:'private',fetcher});const subject={...input().subject,latitude:41.07,longitude:-85.15};
  const records=await p.discover(subject,{radiusMiles:0.5,months:6,valuationDate:'2026-04-24'});
  assert.equal(called!.origin,'https://api.rentcast.io');assert.equal(called!.pathname,'/v1/properties');assert.equal(called!.searchParams.get('saleDateRange'),'183');assert.equal(called!.searchParams.get('radius'),'0.5');assert.equal(called!.searchParams.get('limit'),'50');assert.ok(records[0].sale.source.reference.includes('properties'));
});
test('offline fixture discovery works without external calls and provider errors remain failures, not empty markets',async()=>{
  const i=input();const result=await discoverAndEstimateARV({...i,comparables:[]},fixtureProvider(i.subject,i.comparables));assert.notEqual(result.likelyArv,null);
  const fail={name:'failure',subject:async()=>i.subject,discover:async()=>{throw new Error('secret upstream payload');}};
  const r=await discoverAndEstimateARV({...i,comparables:[]},fail);assert.equal(r.likelyArv,null);assert.ok(r.warnings.some(w=>w.includes('not evidence')));assert.ok(!JSON.stringify(r).includes('secret upstream'));
});
test('rate-limit handling respects long Retry-After and transient retries are bounded',async()=>{
  let calls=0;
  await assert.rejects(rentCastRequest('properties',new URLSearchParams(),{apiKey:'private',fetcher:(async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'120'}});}) as typeof fetch}),error=>error instanceof RentCastError&&error.retryAfterSeconds===120);
  assert.equal(calls,1);
  calls=0;const result=await rentCastRequest('properties',new URLSearchParams(),{apiKey:'private',fetcher:(async()=>{calls++;return calls===1?new Response('{}',{status:503}):Response.json([row]);}) as typeof fetch});assert.equal(calls,2);assert.ok(Array.isArray(result));
});
test('service remains offline unless explicitly enabled and refuses unconfigured or historical live queries',async()=>{
  const i=input();assert.notEqual((await runArvEstimate(i)).likelyArv,null);
  await assert.rejects(runArvEstimate(i,{live:true}),/RENTCAST_API_KEY/);
  await assert.rejects(runArvEstimate(i,{live:true,apiKey:'private'}),/Historical valuations/);
});
