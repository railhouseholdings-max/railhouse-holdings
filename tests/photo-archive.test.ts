import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPhotoArchiver,archivalPhotoUrl } from '../src/lib/photos/archive.ts';
import { downloadPropertyPhoto } from '../src/lib/photos/download.ts';
import { PHOTO_BUCKET,PHOTO_MAX_BYTES,validPhotoPath } from '../src/lib/photos/storage.ts';
import { SHEET_HEADERS,normalizeSheet } from '../src/lib/sheets/import.ts';
import { syncSheetToFeed } from '../src/lib/sheets/workflow.ts';
import { OfflineScoutStore } from '../src/lib/scout/offline.ts';
import { propertyIdentity } from '../src/lib/scout/identity.ts';
import type { SheetGrid } from '../src/lib/sheets/client.ts';
import type { CloudConfig } from '../src/lib/config/cloud.ts';
import type { PropertyPhoto } from '../src/domain/scout.ts';
const owner='11111111-1111-4111-8111-111111111111';
const config:CloudConfig={mode:'supabase',url:'https://synthetic.supabase.co',publishableKey:'sb_publishable_SYNTHETIC',ownerId:owner,origin:'https://app.example.com'};
const now='2026-11-09T14:00:00.000Z',image='https://photos.zillowstatic.com/fp/SYNTHETIC-image.png';
// Actual synthetic PNG bytes; never presented as a photograph of a real property.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6e0AAAAASUVORK5CYII=','base64');
const sheet=(url=image):SheetGrid=>{const row:Record<string,string>={Address:'100 SYNTHETIC Test Lane',City:'Fort Wayne',ZIP:'46802',Status:'Active','List Price':'$50,000',Recommendation:'Watch'};return {spreadsheetId:'SYNTHETIC_sheet_photo_archive',sheetId:0,title:'SYNTHETIC',fetchedAt:now,values:[[...SHEET_HEADERS,'Image URL'],[...SHEET_HEADERS.map(h=>row[h]??''),url]],hyperlinks:{}};};
const listing=()=>normalizeSheet(sheet()).rows[0].listing;
async function savedListing(){return(await createPhotoArchiver({config,secret:'sb_secret_SYNTHETIC',now:()=>now,fetcher:async input=>String(input).startsWith('https://photos.zillowstatic.com/')?new Response(png,{headers:{'Content-Type':'image/png'}}):Response.json({Key:'saved'})})(listing(),null,new AbortController().signal)).listing;}
test('column BG Image URL maps to a source photo; actual bytes are copied privately with stable content identity',async()=>{
  const grid=sheet();assert.equal(grid.values[0].length,59);assert.equal(grid.values[0][58],'Image URL');
  let upload:RequestInit|undefined;let requests=0;
  const archive=createPhotoArchiver({config,secret:'sb_secret_SYNTHETIC',now:()=>now,fetcher:async(input,options)=>{
    requests++;const u=new URL(String(input));
    if(u.hostname==='photos.zillowstatic.com'){assert.equal(new Headers(options?.headers).has('apikey'),false);assert.equal(new Headers(options?.headers).has('Authorization'),false);assert.equal(options?.redirect,'error');return new Response(png,{headers:{'Content-Type':'image/png'}});}
    assert.equal(u.origin,config.url);assert.ok(u.pathname.startsWith(`/storage/v1/object/${PHOTO_BUCKET}/${owner}/`));upload=options;return Response.json({Key:'saved'});
  }});
  const result=await archive(normalizeSheet(grid).rows[0].listing,null,new AbortController().signal);assert.deepEqual(result.warnings,[]);assert.equal(requests,2);
  const photo=result.listing.photos[0];assert.ok(photo.storagePath&&validPhotoPath(photo.storagePath,owner));assert.equal(photo.sha256,createHash('sha256').update(png).digest('hex'));assert.equal(photo.bytes,png.length);assert.equal(photo.savedAt,now);assert.equal(photo.contentType,'image/png');
  assert.deepEqual(Buffer.from(upload!.body as Uint8Array),png);assert.equal(new Headers(upload?.headers).get('x-upsert'),'false');assert.equal(new Headers(upload?.headers).get('apikey'),'sb_secret_SYNTHETIC');assert.equal(new Headers(upload?.headers).has('Authorization'),false);
});
test('repeat imports reuse the saved copy without relying on the listing source; a blank/removed source URL preserves it',async()=>{
  const previous=await savedListing();const archive=createPhotoArchiver({config,secret:'sb_secret_SYNTHETIC',fetcher:async()=>{throw new Error('Source is gone; this must not be called.');}});
  const repeated=await archive(listing(),previous,new AbortController().signal);assert.deepEqual(repeated.warnings,[]);assert.equal(repeated.listing.photos[0].storagePath,previous.photos[0].storagePath);
  const blank=await archive({...listing(),photos:[]},previous,new AbortController().signal);assert.deepEqual(blank.listing.photos,previous.photos);assert.deepEqual(blank.warnings,[]);
});
test('broken replacement image retains the original stored image and still allows property updates',async()=>{
  const previous=await savedListing();const store=new OfflineScoutStore();store.settings.enabled=true;
  store.properties.set(propertyIdentity(previous.address),{id:'SYNTHETIC-existing',address:previous.address,listing:previous,evidence:{},manual:false,notes:'Keep my note',visible:true});
  const grid=sheet('https://photos.zillowstatic.com/fp/SYNTHETIC-gone.png');grid.values[1][3]='$45,000';
  const archive=createPhotoArchiver({config,secret:'sb_secret_SYNTHETIC',fetcher:async()=>new Response(null,{status:404})});
  const run=await syncSheetToFeed({store,archivePhoto:archive,read:async()=>grid,key:'replacement-failed',now:()=>now,signal:new AbortController().signal});
  assert.equal(run?.status,'partial');assert.ok(run?.errors.some(e=>e.includes('Previously saved image retained')));
  const p=[...store.properties.values()][0];assert.equal(p.notes,'Keep my note');assert.equal(p.listing?.price,45000);assert.equal(p.listing?.photos[0].storagePath,previous.photos[0].storagePath);
});
test('content deduplication does not overwrite existing objects, including retries after a database-write failure',async()=>{
  const archive=createPhotoArchiver({config,secret:'sb_secret_SYNTHETIC',fetcher:async input=>String(input).startsWith('https://photos.zillowstatic.com/')?new Response(png):Response.json({error:'Duplicate',message:'The resource already exists'},{status:400})});
  const result=await archive(listing(),null,new AbortController().signal);assert.deepEqual(result.warnings,[]);assert.ok(result.listing.photos[0].storagePath);
});
test('archive rejects untrusted origins, redirect responses, oversized payloads and HTML masquerading as an image',async()=>{
  for(const source of ['https://attacker.example/image.jpg','https://photos.zillowstatic.com.attacker.example/photo.jpg','https://127.0.0.1/photo.jpg','http://photos.zillowstatic.com/photo.jpg'])assert.throws(()=>archivalPhotoUrl(source));
  for(const response of [new Response('<html>not an image</html>',{headers:{'Content-Type':'image/jpeg'}}),new Response(png,{headers:{'Content-Length':String(PHOTO_MAX_BYTES+1)}}),new Response(null,{status:302,headers:{Location:'http://127.0.0.1/admin'}})]){
    let requests=0;const archive=createPhotoArchiver({config,secret:'sb_secret_SYNTHETIC',fetcher:async()=>{requests++;return response;}});
    const result=await archive(listing(),null,new AbortController().signal);assert.equal(requests,1);assert.equal(result.warnings.length,1);assert.equal(result.listing.photos[0].storagePath,undefined);
  }
});
test('owner-only photo download uses retained image bytes even when the source image is unavailable',async()=>{
  const saved=await savedListing(),photo=saved.photos[0];let calls=0;
  const result=await downloadPropertyPhoto(config,{accessToken:'SYNTHETIC-owner-token',userId:owner},'22222222-2222-4222-8222-222222222222',photo.sha256!,async(input,options)=>{
    calls++;const u=new URL(String(input));assert.equal(u.origin,config.url);assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer SYNTHETIC-owner-token');assert.equal(new Headers(options?.headers).get('apikey'),config.publishableKey);
    if(u.pathname.startsWith('/rest/v1/'))return Response.json([{listing:saved}]);
    assert.ok(u.pathname.startsWith(`/storage/v1/object/authenticated/${PHOTO_BUCKET}/`));return new Response(png,{headers:{'Content-Type':'image/png'}});
  });
  assert.equal(calls,2);assert.equal(result.status,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),png);assert.equal(result.headers.get('Cache-Control'),'private, max-age=86400');assert.equal(result.headers.get('Vary'),'Cookie');
});
test('another owner or an injected foreign object path cannot access archived photo bytes',async()=>{
  const saved=await savedListing(),photo=saved.photos[0];
  await assert.rejects(()=>downloadPropertyPhoto(config,{accessToken:'other',userId:'33333333-3333-4333-8333-333333333333'},owner,null),/denied/);
  let calls=0;const injected:PropertyPhoto={...photo,storagePath:photo.storagePath!.replace(owner,'33333333-3333-4333-8333-333333333333')};
  const result=await downloadPropertyPhoto(config,{accessToken:'owner',userId:owner},owner,null,async()=>{calls++;return Response.json([{listing:{...saved,photos:[injected]}}]);});
  assert.equal(result.status,404);assert.equal(calls,1);assert.equal(validPhotoPath(owner+'/../../other.jpg',owner),false);
});
