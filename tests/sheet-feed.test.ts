import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync,verify } from 'node:crypto';
import { normalizeSheet,SHEET_HEADERS,sheetInputEstimates,sheetDate } from '../src/lib/sheets/import.ts';
import { readScoutSheet,DEFAULT_SCOUT_SHEET_ID,type SheetGrid } from '../src/lib/sheets/client.ts';
import { syncSheetToFeed } from '../src/lib/sheets/workflow.ts';
import { OfflineScoutStore } from '../src/lib/scout/offline.ts';
const now='2026-11-09T14:00:00.000Z';
const sample=(overrides:Record<string,string>={})=>({
  'Date Added':'2026-10-16',Status:'Sold',Recommendation:'Watch','List Price':'$49,900.00',Address:'413 Eckart St',City:'Fort Wayne',ZIP:'46806','Property Type':'Single Family',Units:'1',Beds:'2',Baths:'1','Sq Ft':'1232','Year Built':'1930','Listing Date':'2026-10-14','Days on Market':'2',Source:'IRMLS / Zillow / RealAI','Listing URL':'https://www.zillow.com/homedetails/413-Eckart-St-Fort-Wayne-IN-46806/73112312_zpid/','Rehab Low':'$40,000.00','Rehab Base':'$50,000.00','Rehab High':'$65,000.00','ARV Low':'$115,000.00','ARV Base':'$125,000.00','ARV High':'$135,000.00','Rent Low / mo':'$1,050.00','Rent Base / mo':'$1,150.00','Rent High / mo':'$1,250.00','Taxes / yr':'$1,040.00','Insurance / yr':'$1,000.00','Holding Costs':'$1,500.00','Unforeseen Construction':'$2,000.00','Refi LTV':'75.00%','Interest Rate':'6.25%','Term (yrs)':'30','Property Mgmt Rate':'13.00%','CapEx Reserve / mo':'100','Fixed Refi Costs':'$4,000.00','Origination Rate':'1.75%','Refi Recovery':'84.47%','Monthly Cash Flow':'$153.27','Rent Efficiency':'11.04%','Year-1 ROE':'5.89%',DSCR:'1.2655','Deal Score':'63',Confidence:'Medium-Low','Last Checked':'2026-10-26','Mashvisor Rent':'2026-10-23','ARV Comp Count':'3',...overrides,
});
const grid=(records:Record<string,string>[]):SheetGrid=>({spreadsheetId:DEFAULT_SCOUT_SHEET_ID,sheetId:0,title:'Synthetic fixture tab (not a verified live tab name)',values:[[...SHEET_HEADERS],...records.map(r=>SHEET_HEADERS.map(h=>r[h]??''))],hyperlinks:{},fetchedAt:now});
// These selected values are transcribed from the user's three supplied sheet rows, not live data.
const userExamples=()=>grid([sample(),sample({'Date Added':'2026-10-20','Listing Date':'2026-10-19','Listing URL':'https://www.zillow.com/homedetails/1815-Wheeler-St-Fort-Wayne-IN-46808/73127075_zpid/','Sq Ft':'782','Year Built':'1920',Source:'Realtor.com / Zillow / RealAI / MLS','Taxes / yr':'$1,162.81','Unforeseen Construction':'$5,000.00','ARV Comp Count':'4',Address:'1815 Wheeler St',ZIP:'46808',Status:'Watchlist','List Price':'$29,900.00','Rehab Base':'$60,000.00','Rehab Low':'$50,000.00','Rehab High':'$75,000.00','ARV Low':'$130,000.00','ARV Base':'$140,000.00','ARV High':'$150,000.00','Rent Base / mo':'$1,100.00','Refi Recovery':'102.17%','Monthly Cash Flow':'$30.26','Rent Efficiency':'9.43%','Year-1 ROE':'1.04%',DSCR:'1.0468','Deal Score':'62'}),sample({'Date Added':'2026-11-01','Listing Date':'2026-10-31','Listing URL':'https://www.zillow.com/homedetails/1925-Sinclair-St-Fort-Wayne-IN-46808/73126273_zpid/','Sq Ft':'924','Year Built':'1920',Source:'IRMLS / Realtor.com / Zillow / Mashvisor','Taxes / yr':'$327.00','Unforeseen Construction':'$3,000.00',Confidence:'Medium','ARV Comp Count':'5','Rent Low / mo':'$1,200.00','Rent High / mo':'$1,350.00','Mashvisor Rent':'Mashvisor exact-address search did not resolve the new listing; nearby Hamilton/Nebraska context shows traditional rents around $1,086-$1,500 depending on size/configuration.',Address:'1925 Sinclair St',ZIP:'46808',Status:'Watchlist',Recommendation:'Potential Fit','List Price':'$79,900.00','Rehab Low':'$35,000.00','Rehab Base':'$40,000.00','Rehab High':'$55,000.00','ARV Low':'$140,000.00','ARV Base':'$150,000.00','ARV High':'$158,000.00','Rent Base / mo':'$1,300.00','Refi Recovery':'85.09%','Monthly Cash Flow':'$227.73','Rent Efficiency':'10.40%','Year-1 ROE':'14.74%',DSCR:'1.3288','Deal Score':'68','Last Checked':'2026-11-01'})]);
test('supplied header/schema and three example values map without fabricating availability or re-underwriting',()=>{
  const result=normalizeSheet(userExamples());assert.deepEqual(result.errors,[]);assert.equal(result.rows.length,3);
  const [a,b,c]=result.rows;assert.equal(a.listing.status,'Sold');assert.equal(a.listing.price,49900);assert.equal(a.evaluation.imported?.estimates.arvBase,125000);assert.equal(a.evaluation.metrics?.monthlyCashFlow,153.27);assert.equal(a.evaluation.metrics?.rentEfficiency,.1104);
  assert.equal(b.listing.status,'Unknown');assert.equal(b.evaluation.imported?.raw.Status,'Watchlist');assert.equal(b.evaluation.recommendation,'Watch');assert.equal(c.evaluation.recommendation,'Potential Fit');assert.equal(c.evaluation.metrics?.recoveryPercent,85.09);
  assert.equal(a.evaluation.arv,null);assert.equal(a.evaluation.qualifies,false);assert.equal(a.evaluation.imported?.raw['Mashvisor Rent'],'2026-10-23');
});
test('multiline comps, risk narratives, unknown columns and real hyperlinks are retained as source text',()=>{
  const g=grid([sample({'ARV Comps':'Comp A — closed value supplied by agent\nComp B — partial source date','Key Risks':'Hidden systems need inspection.'})]);
  g.values[0].push('Agent extra');g.values[1].push('Keep this column');g.values[1][16]='View listing';g.hyperlinks={1:{16:'https://www.zillow.com/homedetails/example/123_zpid/'}};
  const row=normalizeSheet(g).rows[0];assert.ok(row.evaluation.imported?.raw['ARV Comps'].includes('\n'));assert.equal(row.evaluation.imported?.raw['Agent extra'],'Keep this column');assert.ok(row.listing.url?.endsWith('123_zpid/'));
  g.hyperlinks[1][16]='javascript:alert(1)';assert.equal(normalizeSheet(g).rows[0].listing.url,null);
});
test('row identity is stable after reordering; duplicate conflicts and malformed rows cannot silently overwrite',()=>{
  const a=normalizeSheet(grid([sample()])).rows[0];const b=normalizeSheet(grid([sample({Address:'999 SYNTHETIC Test Ln'}),sample()])).rows[1];assert.equal(a.listing.sourceId,b.listing.sourceId);
  assert.equal(normalizeSheet(grid([sample(),sample()])).rows.length,1);
  const conflict=normalizeSheet(grid([sample(),sample({'List Price':'$1.00'})]));assert.equal(conflict.rows.length,0);assert.ok(conflict.errors[0].includes('Conflicting duplicate'));
  const invalid=normalizeSheet(grid([sample({Address:''}),sample()]));assert.equal(invalid.rows.length,1);assert.equal(invalid.errors.length,1);
  assert.throws(()=>normalizeSheet({...grid([]),values:[['Wrong header']]}),/Address/);
});
test('only supplied inputs prefill the existing calculator; source percentages and unknown dates remain explicit',()=>{
  const imported=normalizeSheet(grid([sample()])).rows[0].evaluation.imported;const inputs=sheetInputEstimates(imported);
  assert.equal(inputs.purchasePrice,49900);assert.equal(inputs.arv,125000);assert.equal(inputs.interestRate,6.25);assert.equal(inputs.annualPropertyTaxes,1040);assert.equal(inputs.unexpectedConstructionCosts,2000);assert.equal(inputs.closingDate,undefined);
  assert.equal(sheetDate('10/26/2026'),'2026-10-26T00:00:00.000Z');assert.equal(sheetDate('2026-02-30'),null);assert.equal(sheetDate('yesterday'),null);
});
test('full sync imports sold/watchlist rows, preserves notes, is idempotent, and never infers deletion from absence',async()=>{
  const store=new OfflineScoutStore();store.settings.enabled=true;const args={store,read:async()=>userExamples(),now:()=>now,signal:new AbortController().signal};
  const run=await syncSheetToFeed({...args,key:'sheet-1'});assert.equal(run?.status,'succeeded');assert.equal(store.properties.size,3);
  const p=[...store.properties.values()][0];p.notes='Manual note stays';assert.equal(await syncSheetToFeed({...args,key:'sheet-1'}),null);
  await syncSheetToFeed({...args,key:'sheet-2'});assert.equal(store.properties.size,3);assert.equal(store.history.length,3);assert.equal([...store.properties.values()][0].notes,'Manual note stays');
  await syncSheetToFeed({...args,key:'sheet-empty',read:async()=>grid([])});assert.equal(store.properties.size,3);
});
test('download failure retains all prior property data and records a failed run; malformed rows make partial runs',async()=>{
  const store=new OfflineScoutStore();store.settings.enabled=true;const args={store,key:'failed',now:()=>now,signal:new AbortController().signal};
  const failed=await syncSheetToFeed({...args,read:async()=>{throw new Error('Google Sheets access denied.');}});assert.equal(failed?.status,'failed');assert.equal(store.lastCheckpoint,null);
  const partial=await syncSheetToFeed({...args,key:'partial',read:async()=>grid([sample(),sample({Address:''})])});assert.equal(partial?.status,'partial');assert.equal(store.properties.size,1);assert.equal(store.lastCheckpoint,null);
});
test('Google client signs readonly assertions, resolves gid from metadata, reads cells and hyperlinks on fixed origins',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const credentialJson=JSON.stringify({client_email:'synthetic@synthetic.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})});let requests=0;
  const response=await readScoutSheet({credentialJson,now:()=>new Date(now),fetcher:async(input,options)=>{
    const u=new URL(String(input));requests++;
    if(u.hostname==='oauth2.googleapis.com'){
      assert.equal(options?.method,'POST');const body=new URLSearchParams(String(options?.body));const assertion=body.get('assertion')!;const [h,p,sig]=assertion.split('.');assert.equal(verify('RSA-SHA256',Buffer.from(`${h}.${p}`),publicKey,Buffer.from(sig,'base64url')),true);const claims=JSON.parse(Buffer.from(p,'base64url').toString());assert.equal(claims.scope,'https://www.googleapis.com/auth/spreadsheets.readonly');assert.equal(claims.aud,'https://oauth2.googleapis.com/token');return Response.json({access_token:'SYNTHETIC-TOKEN',expires_in:3600});
    }
    assert.equal(u.origin,'https://sheets.googleapis.com');assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer SYNTHETIC-TOKEN');assert.equal(options?.cache,'no-store');
    if(!u.searchParams.has('ranges'))return Response.json({sheets:[{properties:{sheetId:0,title:"Agent's feed",gridProperties:{rowCount:1000,columnCount:58}}}]});
    assert.ok(u.searchParams.get('ranges')?.startsWith("'Agent''s feed'!A1:"));return Response.json({sheets:[{properties:{sheetId:0},data:[{rowData:[{values:[{formattedValue:'Address'},{formattedValue:'Listing URL'}]},{values:[{formattedValue:'100 SYNTHETIC Test Ln'},{formattedValue:'View',hyperlink:'https://example.test/listing'}]}]}]}]});
  }});
  assert.equal(requests,3);assert.equal(response.values[1][0],'100 SYNTHETIC Test Ln');assert.equal(response.hyperlinks[1][1],'https://example.test/listing');assert.equal(response.sheetId,0);
});
test('imported Pass and terminal records remain visible with their original recommendation',async()=>{
  const store=new OfflineScoutStore();store.settings.enabled=true;
  await syncSheetToFeed({store,key:'sheet-pass',now:()=>now,signal:new AbortController().signal,read:async()=>grid([sample({Recommendation:'Pass',Status:'Sold'})])});
  const property=[...store.properties.values()][0];assert.equal(property.visible,true);assert.equal(property.listing?.status,'Sold');assert.equal(property.evaluation?.recommendation,'Pass');
});
test('daily import runs at 9am Eastern across DST and rejects the former 8am schedule',async()=>{
  const {isScoutScheduleHour}=await import('../src/lib/scout/config.ts');
  assert.equal(isScoutScheduleHour(new Date('2026-07-01T13:00:00Z')),true);assert.equal(isScoutScheduleHour(new Date('2026-07-01T12:00:00Z')),false);
  assert.equal(isScoutScheduleHour(new Date('2026-12-01T14:00:00Z')),true);assert.equal(isScoutScheduleHour(new Date('2026-12-01T13:00:00Z')),false);
  assert.equal(sheetDate('2026-10-26T23:00:00-05:00'),'2026-10-27T04:00:00.000Z');
});
