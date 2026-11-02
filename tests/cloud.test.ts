import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudConfig, dataMode } from '../src/lib/config/cloud.ts';
import { cloudHeaders, isSameOriginWrite, passwordSignIn, verifyOwner, restRequest, SignInError } from '../src/lib/cloud/http.ts';
import { validateSaveDeal, toDealRows, fromDealRow } from '../src/lib/persistence/deal-records.ts';
import { spreadsheetExample } from '../src/lib/data/spreadsheet-example.ts';
import { DEFAULT_CLOSING_ADJUSTMENTS } from '../src/lib/calculations/closing.ts';
import { DEFAULT_PURCHASE_ADJUSTMENTS } from '../src/lib/calculations/purchase.ts';
import { calculateDeal } from '../src/lib/calculations/deal.ts';
import type { RentalTaxMatch } from '../src/domain/property-tax.ts';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const env={RAILHOUSE_DATA_MODE:'supabase',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_only',SUPABASE_OWNER_ID:owner,APP_ORIGIN:'http://localhost:3000'};
const config=cloudConfig(env);
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
test('demo remains default; invalid or partial private configuration fails closed',()=>{
  assert.equal(dataMode({}),'demo');
  assert.throws(()=>dataMode({RAILHOUSE_DATA_MODE:'typo'}));
  assert.throws(()=>cloudConfig({RAILHOUSE_DATA_MODE:'supabase'}),/incomplete/);
  assert.throws(()=>cloudConfig({...env,SUPABASE_URL:'http://example.supabase.co'}));
  assert.throws(()=>cloudConfig({...env,APP_ORIGIN:'http://untrusted.example'}));
  assert.throws(()=>cloudConfig({...env,SUPABASE_OWNER_ID:'not-a-uuid'}));
  assert.throws(()=>cloudConfig({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_not_allowed'}));
  const privileged=`x.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.x`;
  assert.throws(()=>cloudConfig({...env,SUPABASE_PUBLISHABLE_KEY:privileged}));
});
test('same-origin writes reject absent and foreign origins',()=>{
  assert.equal(isSameOriginWrite(new Request('http://localhost:3000/api/deals',{headers:{origin:config.origin}}),config.origin),true);
  assert.equal(isSameOriginWrite(new Request('http://localhost:3000/api/deals'),config.origin),false);
  assert.equal(isSameOriginWrite(new Request('http://localhost:3000/api/deals',{headers:{origin:'https://attacker.example'}}),config.origin),false);
});
test('only a remotely verified configured owner is authorized',async()=>{
  assert.equal(await verifyOwner(config,undefined),null);
  assert.equal(await verifyOwner(config,'forged',async()=>response({},401)),null);
  assert.equal(await verifyOwner(config,'valid-other-user',async()=>response({id:other})),null);
  let called=false;
  const session=await verifyOwner(config,'user-access-token',async(url,options)=>{
    called=true;assert.equal(url,'https://example.supabase.co/auth/v1/user');
    assert.equal(new Headers(options?.headers).get('authorization'),'Bearer user-access-token');
    assert.equal(options?.cache,'no-store');return response({id:owner});
  });
  assert.equal(called,true);assert.deepEqual(session,{accessToken:'user-access-token',userId:owner});
});
test('password sign-in bounds session duration and never returns a refresh token',async()=>{
  const session=await passwordSignIn(config,'owner@example.test','test-password',async()=>response({user:{id:owner},access_token:'access',refresh_token:'not-retained',expires_in:7200}));
  assert.deepEqual(session,{accessToken:'access',expiresIn:3600});
  await assert.rejects(()=>passwordSignIn(config,'other@example.test','x',async()=>response({user:{id:other},access_token:'other',expires_in:3600})),e=>e instanceof SignInError&&e.code==='owner');
  assert.equal(await passwordSignIn(config,'owner@example.test','x',async()=>response({},400)),null);
});
test('database calls carry the owner JWT, respect RLS, disable caching and hide upstream errors',async()=>{
  const session={accessToken:'user-token',userId:owner};
  const rows=await restRequest<unknown[]>(config,session,'deals?select=id',{},async(url,options)=>{
    assert.equal(url,'https://example.supabase.co/rest/v1/deals?select=id');
    assert.equal(new Headers(options?.headers).get('apikey'),config.publishableKey);
    assert.equal(new Headers(options?.headers).get('authorization'),'Bearer user-token');
    assert.equal(options?.cache,'no-store');return response([]);
  });assert.deepEqual(rows,[]);
  await assert.rejects(()=>restRequest(config,{...session,userId:other},'deals?select=id'),/denied/);
  await assert.rejects(()=>restRequest(config,session,'https://attacker.example'),/Unsupported/);
  await assert.rejects(()=>restRequest(config,session,'deals?select=id',{},async()=>response({secret:'must-not-leak'},500)),e=>e instanceof Error&&!e.message.includes('must-not-leak'));
  await assert.rejects(()=>restRequest(config,session,'rpc/save_deal',{method:'POST'},async()=>response({},409)),/another session/);
  assert.equal(cloudHeaders(config).has('Authorization'),false);
});
const evidence:RentalTaxMatch={status:'missing',message:'Manual scenario'};
const request={id:null,expectedRevision:null,address:'2221 Eby Avenue, Fort Wayne, IN',status:'Reviewing',inputs:{...spreadsheetExample,annualPropertyTaxes:0},closingAdjustments:{...DEFAULT_CLOSING_ADJUSTMENTS,quotedTitlePremium:0,annualFloodInsurance:905},purchaseAdjustments:{...DEFAULT_PURCHASE_ADJUSTMENTS,additionalCosts:12.34},taxAssumptions:{parcelId:'02-12-10-306-013.000-074',payableYear:2028,annualOverride:0}};
test('saved deal round trip preserves all financial inputs, fee changes, zero overrides and nulls',()=>{
  const validated=validateSaveDeal(request), rows=toDealRows(validated,evidence);
  const restored=fromDealRow({...rows.deal,id:owner,revision:3,updated_at:'2026-11-02T12:00:00Z',deal_adjustments:rows.adjustments,deal_tax_assumptions:rows.taxes});
  assert.deepEqual(restored.inputs,validated.inputs);
  assert.deepEqual(restored.closingAdjustments,validated.closingAdjustments);
  assert.deepEqual(restored.purchaseAdjustments,validated.purchaseAdjustments);
  assert.deepEqual(restored.taxAssumptions,validated.taxAssumptions);
  assert.equal(restored.taxAssumptions?.annualOverride,0);assert.equal(restored.closingAdjustments?.quotedTitlePremium,0);
  assert.deepEqual(calculateDeal(restored.inputs,restored.closingAdjustments,restored.purchaseAdjustments),calculateDeal(validated.inputs,validated.closingAdjustments,validated.purchaseAdjustments));
  const nullQuote=validateSaveDeal({...request,closingAdjustments:{...request.closingAdjustments,quotedTitlePremium:null}});
  assert.equal(toDealRows(nullQuote,evidence).adjustments.quoted_title_premium,null);
});
test('malformed saves and incomplete stored rows fail rather than inventing financial values',()=>{
  assert.throws(()=>validateSaveDeal({...request,inputs:{...request.inputs,monthlyRent:null}}));
  assert.throws(()=>validateSaveDeal({...request,taxAssumptions:{...request.taxAssumptions,annualOverride:-1}}));
  assert.throws(()=>validateSaveDeal({...request,address:''}));
  assert.throws(()=>validateSaveDeal({...request,inputs:{...request.inputs,closingDate:'2026-02-30'}}));
  const rows=toDealRows(validateSaveDeal(request),evidence);
  assert.throws(()=>fromDealRow({...rows.deal,deal_adjustments:null,deal_tax_assumptions:rows.taxes}));
});

test('sign-in errors distinguish safe actionable categories without exposing upstream data',async()=>{
  const cases=[['email_not_confirmed',400,'confirmation'],['email_provider_disabled',400,'provider'],['invalid_api_key',401,'key'],['over_request_rate_limit',429,'rate-limit'],['unexpected_failure',500,'unavailable']] as const;
  for(const [code,status,expected] of cases) {
    await assert.rejects(()=>passwordSignIn(config,'owner@example.test','never-expose-password',async()=>response({error_code:code,msg:'never-expose-upstream-body'},status)), e=>e instanceof SignInError&&e.code===expected&&!e.message.includes('never-expose'));
  }
  assert.equal(await passwordSignIn(config,'owner@example.test','x',async()=>response({error_code:'invalid_credentials'},400)),null);
  await assert.rejects(()=>passwordSignIn(config,'owner@example.test','x',async()=>response({user:{id:owner},access_token:'x',expires_in:0})),e=>e instanceof SignInError&&e.code==='unavailable');
});
