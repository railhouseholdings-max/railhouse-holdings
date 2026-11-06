import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDealShare, isMobileShareAvailable } from '../src/lib/deals/share.ts';
import { spreadsheetExample } from '../src/lib/data/spreadsheet-example.ts';
import { emptyPropertyDetails, emptyPropertyUnit } from '../src/lib/deals/property-details.ts';
import type { RentCastLookup } from '../src/domain/property-lookup.ts';

test('native sharing is restricted to mobile devices with a secure supported browser', () => {
  const iphone = {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',maxTouchPoints:5};
  const android = {userAgent:'Mozilla/5.0 (Linux; Android 15)',maxTouchPoints:5};
  const ipadDesktopMode = {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',maxTouchPoints:5};
  const desktop = {userAgent:'Mozilla/5.0 (Windows NT 10.0)',maxTouchPoints:10};
  for (const mobile of [iphone,android,ipadDesktopMode]) {
    assert.equal(isMobileShareAvailable(mobile,true,true),true);
    assert.equal(isMobileShareAvailable(mobile,false,true),false);
    assert.equal(isMobileShareAvailable(mobile,true,false),false);
  }
  assert.equal(isMobileShareAvailable(desktop,true,true),false);
  assert.equal(isMobileShareAvailable({...ipadDesktopMode,maxTouchPoints:0},true,true),false);
});
const property:RentCastLookup={source:'RentCast',address:'123 Main St',fetchedAt:'2026-11-06T12:00:00Z',facts:[{label:'Property type',value:'Single Family'},{label:'Bedrooms',value:'3'},{label:'Bathrooms',value:'1.5'},{label:'Living area',value:'1,250 sq ft'},{label:'Last sale price (historical)',value:'$50,000'}],rent:null,warnings:[]};
test('share is a concise purchase and property summary with no mortgage or performance information',()=>{
  const input={...spreadsheetExample,purchasePrice:123456};
  const text=formatDealShare('123 Main Street',input,property);
  for(const value of ['123 Main Street','Property type: Single Family','Purchase price: $123,456.00','Rehab estimate: $50,000.00','Estimated monthly rent (whole property): $1,800.00','Estimated ARV: $260,000.00','3 bedrooms · 1.5 bathrooms · 1,250 sq ft']) assert.ok(text.includes(value),value);
  for(const value of ['REFINANCE','Interest rate','Funding date','Debt coverage','Rating:','Capital recovered','cash flow','Target purchase price','Last sale price','Annual property taxes','Loan term']) assert.ok(!text.includes(value),value);
  assert.ok(text.length<1000);
});
test('shared layout uses latest edits and identifies planned additions',()=>{
  const draft={...emptyPropertyDetails(),overrides:{Bedrooms:'4'},additions:{bedrooms:'1',bathrooms:'0.5',squareFeet:'350'}};
  const text=formatDealShare('123 Main St',spreadsheetExample,property,draft);
  for(const value of ['4 bedrooms · 1.5 bathrooms · 1,250 sq ft','PROPOSED BUILDING ADDITIONS','+1 bedroom','+0.5 bathrooms','+350 sq ft','5 bedrooms · 2 bathrooms · 1,600 sq ft','do not automatically update rent, ARV, or rehab']) assert.ok(text.includes(value),value);
  assert.ok(!text.includes('3 bedrooms'));
});
test('multifamily summary includes individually entered units, rent and proposed new units',()=>{
  const unit={...emptyPropertyUnit('a','Unit A'),bedrooms:'2',bathrooms:'1',squareFeet:'800',monthlyRent:'1000',additions:{bedrooms:'1',bathrooms:'0',squareFeet:'100'}};
  const proposed={...emptyPropertyUnit('b','Garage apartment','proposed'),bedrooms:'0',bathrooms:'1',squareFeet:'400',monthlyRent:'800'};
  const draft={...emptyPropertyDetails(),overrides:{'Property type':'Multi-Family',Units:'1'},units:[unit,proposed]};
  const text=formatDealShare('123 Main St',spreadsheetExample,property,draft);
  for(const value of ['Property type: Multi-Family','UNIT BREAKDOWN','Unit A','2 bedrooms · 1 bathroom · 800 sq ft','Estimated monthly rent: $1,000.00','Proposed layout: 3 bedrooms · 1 bathroom · 900 sq ft','Garage apartment — PROPOSED NEW UNIT','0 bedrooms · 1 bathroom · 400 sq ft','Estimated monthly rent: $800.00','Combined entered unit rent estimates: $1,800.00','Heads up: proposed additions or new units']) assert.ok(text.includes(value),value);
});
test('missing facts and missing unit rents are identified without inventing values',()=>{
  const text=formatDealShare('',spreadsheetExample);
  assert.ok(text.includes('Property address not provided'));
  assert.ok(text.includes('Property type: Not provided'));
  assert.ok(!text.includes('PROPOSED'));
  const draft={...emptyPropertyDetails(),overrides:{'Property type':'Duplex',Units:'2'}};
  const multi=formatDealShare('123 Main St',spreadsheetExample,undefined,draft);
  assert.ok(multi.includes('Unit 1'));
  assert.ok(multi.includes('Estimated monthly rent: Not provided'));
  assert.ok(!multi.includes('Combined entered unit rent estimates'));
  assert.ok(!multi.includes('NaN'));
});
