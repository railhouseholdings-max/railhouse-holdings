import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScoutConfig,ScoutListing,ScoutProvider,ScoutEvidence } from '../src/domain/scout.ts';
import { DEFAULT_SCOUT_CONFIG,isScoutScheduleHour,validateScoutConfig } from '../src/lib/scout/config.ts';
import { propertyIdentity } from '../src/lib/scout/identity.ts';
import { evaluateScoutProperty,financialMetrics,recommendationForScore } from '../src/lib/scout/evaluate.ts';
import { currentListing,discoveryDays,runScout } from '../src/lib/scout/workflow.ts';
import { normalizeScoutListing,createScoutProvider } from '../src/lib/scout/provider.ts';
import { OfflineScoutStore } from '../src/lib/scout/offline.ts';
import { validatePropertyReview } from '../src/lib/scout/review.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/scout/synthetic-input.json',import.meta.url),'utf8')) as {now:string;config:Partial<ScoutConfig>;listings:ScoutListing[];evidence:ScoutEvidence};
function setup(){const f=fixture(),store=new OfflineScoutStore();store.settings={...structuredClone(DEFAULT_SCOUT_CONFIG),...f.config,enabled:true};const provider:ScoutProvider={discover:async city=>f.listings.filter(l=>l.city===city),verify:async address=>f.listings.filter(l=>l.address===address),enrich:async()=>f.evidence};return {f,store,provider};}
test('identity aliases and ZIP formatting deduplicate while retaining distinct units and towns',()=>{
  assert.equal(propertyIdentity('2221 Eby Avenue, Fort Wayne, IN 46802'),propertyIdentity('2221 Eby Ave, Fort Wayne, IN'));
  assert.notEqual(propertyIdentity('2221 Eby Ave, Unit 1, Fort Wayne, IN'),propertyIdentity('2221 Eby Ave, Unit 2, Fort Wayne, IN'));
  assert.notEqual(propertyIdentity('2221 Eby Ave, Auburn, IN'),propertyIdentity('2221 Eby Ave, Fort Wayne, IN'));
});
test('schedule follows Eastern daylight saving time and history-based discovery retains overlap',()=>{
  assert.equal(isScoutScheduleHour(new Date('2026-07-01T13:00:00Z')),true);assert.equal(isScoutScheduleHour(new Date('2026-12-01T14:00:00Z')),true);
  assert.equal(isScoutScheduleHour(new Date('2026-12-01T12:00:00Z')),false);assert.equal(discoveryDays(null,'2026-04-24T12:00:00Z',30,3),30);
  assert.equal(discoveryDays('2026-04-20T12:00:00Z','2026-04-24T12:00:00Z',30,3),7);
  assert.throws(()=>validateScoutConfig({...DEFAULT_SCOUT_CONFIG,monthlyRequestLimit:-1}));assert.throws(()=>validateScoutConfig({...DEFAULT_SCOUT_CONFIG,cities:['Unsupported Town']}));
});
test('listing normalization preserves missing media/units/URLs and never interprets Inactive as Sold',()=>{
  const now=fixture().now;const raw={id:'SYNTHETIC',formattedAddress:'100 SYNTHETIC Lane, Fort Wayne, IN 46802',city:'Fort Wayne',state:'IN',zipCode:'46802',price:100000,status:'Inactive'};
  const l=normalizeScoutListing(raw,now)!;assert.equal(l.status,'Inactive');assert.equal(l.units,null);assert.equal(l.url,null);assert.deepEqual(l.photos,[]);
  assert.equal(normalizeScoutListing({...raw,status:'Active',lastSeenDate:'2025-01-01'},now)?.status,'Unknown');
  assert.equal(normalizeScoutListing({...raw,status:'Active',lastSeenDate:now},now)?.status,'Active');
});
test('conflicting status or price records require review without deleting observations',()=>{
  const a=fixture().listings[0],b={...a,status:'Pending' as const};const result=currentListing([a,b])!;
  assert.equal(result.status,'Unknown');assert.ok(result.conflicts.length);assert.equal(a.status,'Active');assert.equal(currentListing([]),null);
});
test('gates reuse the production calculator, keep incomplete evidence unqualified and handle zero equity',()=>{
  const {f,store}=setup();const e=evaluateScoutProperty(f.listings[0],f.evidence,store.settings,f.now);
  assert.ok(e.arv?.comparables.length===4);assert.ok(e.inputs);assert.equal(e.gates.length,4);assert.ok(e.warnings.some(w=>w.includes('No licensed listing photos')));
  const metrics=financialMetrics(e.inputs!);assert.deepEqual(e.metrics,metrics);
  assert.equal(evaluateScoutProperty(f.listings[0],{},store.settings,f.now).recommendation,'Needs Review');
  assert.equal(evaluateScoutProperty(f.listings[0],{},store.settings,f.now).qualifies,false);
  assert.equal(financialMetrics({...e.inputs!,refinanceLtv:100}).yearOneRoe,null);
  const perUnit=structuredClone(f.evidence);perUnit.lookup!.rent!.perUnit=true;assert.equal(evaluateScoutProperty(f.listings[0],perUnit,store.settings,f.now).inputs,null);
});
test('scoring categories are exact and missing essential evidence cannot produce Strong Buy',()=>{
  assert.deepEqual([54,55,64,65,79,80,100].map(recommendationForScore),['Pass','Watch','Watch','Potential Fit','Potential Fit','Strong Buy','Strong Buy']);
  const {f,store}=setup();const result=evaluateScoutProperty({...f.listings[0],units:null},f.evidence,store.settings,f.now);
  assert.notEqual(result.recommendation,'Strong Buy');
  const invalid=structuredClone(f.evidence);invalid.rehab!.low=900000;assert.equal(evaluateScoutProperty(f.listings[0],invalid,store.settings,f.now).inputs,null);
});
test('strict rent gate does not accept exactly ten percent, and near misses need sourced thesis',()=>{
  const {f,store}=setup();const first=evaluateScoutProperty(f.listings[0],f.evidence,store.settings,f.now);const evidence=structuredClone(f.evidence);evidence.lookup!.rent!.monthly=first.arv!.likelyArv!*.10/12;
  const exact=evaluateScoutProperty(f.listings[0],evidence,store.settings,f.now);assert.equal(exact.gates[2].passed,false);
  delete evidence.thesisSource;assert.equal(evaluateScoutProperty(f.listings[0],evidence,store.settings,f.now).qualifies,false);
});
test('complete offline workflow saves, reports, deduplicates, retains notes and refuses duplicate/overlapping runs',async()=>{
  const {f,store,provider}=setup();const args={store,provider,now:()=>f.now,signal:new AbortController().signal};
  const run=await runScout({...args,key:'SYNTHETIC-1'});assert.equal(run?.status,'succeeded');assert.equal(store.properties.size,1);assert.equal(store.history.length,1);assert.equal(store.lastCheckpoint,f.now);
  const p=[...store.properties.values()][0];p.notes='User decision: retain this note';
  assert.equal(await runScout({...args,key:'SYNTHETIC-1'}),null);
  const second=await runScout({...args,key:'SYNTHETIC-2'});assert.equal(second?.added,0);assert.equal(store.properties.size,1);assert.equal(store.history.length,1);assert.equal([...store.properties.values()][0].notes,p.notes);
  await store.begin('SYNTHETIC-active',f.now);assert.equal(await runScout({...args,key:'SYNTHETIC-overlap'}),null);
});
test('sold/pending/contingent/off-market transitions and reactivation append history while preserving analysis',async()=>{
  const {f,store,provider}=setup();const args={store,provider,now:()=>f.now,signal:new AbortController().signal};await runScout({...args,key:'initial'});
  for(const status of ['Pending','Contingent','Active','Off Market'] as const){f.listings[0].status=status;await runScout({...args,key:status});assert.equal([...store.properties.values()][0].listing?.status,status);}
  assert.equal(store.properties.size,1);assert.equal(store.history.length,5);
  // Sold is verified when a source explicitly supplies it, never inferred from Inactive.
  assert.equal(currentListing([{...f.listings[0],status:'Sold'}])?.status,'Sold');
});
test('one source failure is partial, preserves checkpoint, retains previous listing on missing response',async()=>{
  const {f,store,provider}=setup();store.settings.cities=['Fort Wayne','Auburn'];const base=provider.discover;
  provider.discover=async(city,...rest)=>{if(city==='Auburn')throw new Error('Provider outage');return base(city,...rest);};
  const run=await runScout({store,provider,key:'partial',now:()=>f.now,signal:new AbortController().signal});assert.equal(run?.status,'partial');assert.equal(store.properties.size,1);assert.equal(store.lastCheckpoint,null);
  provider.verify=async()=>[];provider.discover=async()=>[];
  const second=await runScout({store,provider,key:'empty',now:()=>f.now,signal:new AbortController().signal});assert.ok(second?.warnings.some(w=>w.includes('previous status retained')));assert.equal([...store.properties.values()][0].listing?.status,'Active');
});
test('stale returns are not new, empty days make no filler candidates, and manual review validates sources',async()=>{
  const {f,store,provider}=setup();f.listings[0].listedAt='2020-01-01T00:00:00Z';
  const run=await runScout({store,provider,key:'stale',now:()=>f.now,signal:new AbortController().signal});assert.equal(store.properties.size,0);assert.ok(run?.report.some(l=>l.includes('No new properties')));
  assert.throws(()=>validatePropertyReview({notes:'',workflow:'Watch',decision:null,evidence:{rehab:{low:1,base:0,high:2}}},f.now));
  const review=validatePropertyReview({notes:'Preserve this note',workflow:'Watch',decision:'Watch',evidence:{rehab:f.evidence.rehab}},f.now);assert.equal(review.notes,'Preserve this note');
});
test('RentCast adapter uses documented filters, matches exact address, and retains unavailable status',async()=>{
  const {f}=setup();const calls:URL[]=[];const raw={id:'SYNTHETIC',formattedAddress:f.listings[0].address,city:'Fort Wayne',state:'IN',zipCode:'46802',status:'Active',price:65000,lastSeenDate:f.now};
  const provider=createScoutProvider({apiKey:'SYNTHETIC-KEY',now:()=>f.now,fetcher:async(url)=>{calls.push(new URL(String(url)));return Response.json([raw]);}});
  const rows=await provider.discover('Fort Wayne',7,500,new AbortController().signal);assert.equal(rows.length,1);assert.equal(calls[0].pathname,'/v1/listings/sale');assert.equal(calls[0].searchParams.get('daysOld'),'*:7');assert.equal(calls[0].searchParams.get('offset'),'500');
  assert.equal((await provider.verify('101 Different Lane, Fort Wayne, IN',new AbortController().signal)).length,0);
});
test('regional discovery is paginated once and reused across towns and tracked verifications',async()=>{
  const {f}=setup();let calls=0;
  const raw={id:'SYNTHETIC',formattedAddress:f.listings[0].address,city:'Fort Wayne',state:'IN',zipCode:'46802',status:'Active',price:65000,lastSeenDate:f.now};
  const provider=createScoutProvider({region:DEFAULT_SCOUT_CONFIG.region,apiKey:'SYNTHETIC',now:()=>f.now,fetcher:async url=>{calls++;const u=new URL(String(url));assert.equal(u.searchParams.get('radius'),'40');assert.equal(u.searchParams.get('propertyType'),'Single Family|Multi-Family');return Response.json([raw]);}});
  const signal=new AbortController().signal;
  assert.equal((await provider.verify(f.listings[0].address,signal)).length,1);
  assert.equal((await provider.discover('Fort Wayne',30,0,signal)).length,1);
  assert.equal((await provider.discover('Auburn',30,0,signal)).length,0);assert.equal(calls,1);
});
test('rent and ARV from a different property are withheld',()=>{
  const {f,store}=setup();f.evidence.arvInput!.subject.address='101 Different Lane, Auburn, IN';f.evidence.lookup!.address='101 Different Lane, Auburn, IN';
  const result=evaluateScoutProperty(f.listings[0],f.evidence,store.settings,f.now);assert.equal(result.arv,null);assert.equal(result.rent,null);assert.equal(result.inputs,null);assert.equal(result.qualifies,false);
});
test('Supabase Scout adapter sends modern secret keys only as apikey and rejects anon JWTs',async()=>{
  const {createScoutStore}=await import('../src/lib/scout/store.ts');
  const config={mode:'supabase' as const,url:'https://example.supabase.co',publishableKey:'sb_publishable_SYNTHETIC',ownerId:'11111111-1111-4111-8111-111111111111',origin:'https://app.example'};
  const store=createScoutStore(config,'sb_secret_SYNTHETIC',async(url,options)=>{const headers=new Headers(options?.headers);assert.equal(headers.get('apikey'),'sb_secret_SYNTHETIC');assert.equal(headers.has('Authorization'),false);assert.ok(String(url).startsWith(config.url+'/rest/v1/'));return Response.json([]);});
  assert.equal((await store.config()).enabled,false);
  const anon=`header.${Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')}.sig`;
  assert.throws(()=>createScoutStore(config,anon),/not an anon/);
});
test('raw discoveries stay queued and scarce enrichment advances through the backlog',async()=>{
  const {f,store,provider}=setup();f.listings.push({...f.listings[0],sourceId:'SYNTHETIC-2',address:'101 SYNTHETIC Test Lane, Fort Wayne, IN 46802'});
  store.settings.maxEnrichments=0;const args={store,provider,now:()=>f.now,signal:new AbortController().signal};
  const raw=await runScout({...args,key:'raw'});assert.equal(raw?.added,0);assert.ok([...store.properties.values()].every(p=>p.visible===false));
  const enriched:string[]=[];provider.enrich=async listing=>{enriched.push(listing.address);const e=structuredClone(f.evidence);e.arvInput!.subject.address=listing.address;e.lookup!.address=listing.address;return e;};
  store.settings.maxEnrichments=1;
  const one=await runScout({...args,key:'one'});assert.equal(one?.added,1);
  const two=await runScout({...args,key:'two'});assert.equal(two?.added,1);assert.equal(new Set(enriched).size,2);
  assert.ok([...store.properties.values()].every(p=>p.visible===true));
});
