import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPropertyDetails, propertyDetailValue, proposedPropertyTotals } from '../src/lib/deals/property-details.ts';
import type { RentCastLookup } from '../src/domain/property-lookup.ts';
const data:RentCastLookup={source:'RentCast',address:'123 Main St',fetchedAt:'2026-11-06T12:00:00.000Z',facts:[{label:'Bedrooms',value:'3'},{label:'Bathrooms',value:'1.5'},{label:'Living area',value:'1,250 sq ft'},{label:'Lot size',value:'6,000 sq ft'},{label:'Property type',value:'Single Family'},{label:'Garage',value:'No'}],rent:null,warnings:[]};
test('seeds editable numeric fields from formatted provider facts without changing the snapshot',()=>{
  const draft=emptyPropertyDetails();
  assert.equal(propertyDetailValue(data,draft,'Living area'),'1250');
  assert.equal(propertyDetailValue(data,draft,'Lot size'),'6000');
  assert.equal(propertyDetailValue(data,draft,'Garage'),'No');
  assert.deepEqual(proposedPropertyTotals(data,draft),{bedrooms:3,bathrooms:1.5,squareFeet:1250});
  assert.equal(data.facts[2].value,'1,250 sq ft');
});
test('planned additions add to current corrections and preserve fractional bathrooms',()=>{
  const draft={...emptyPropertyDetails(),overrides:{Bedrooms:'4','Living area':'1500'},additions:{bedrooms:'1',bathrooms:'0.5',squareFeet:'350'}};
  assert.deepEqual(proposedPropertyTotals(data,draft),{bedrooms:5,bathrooms:2,squareFeet:1850});
  assert.equal(propertyDetailValue(data,draft,'Bedrooms'),'4');
  assert.equal(data.facts[0].value,'3');
});
test('manual corrections survive a provider refresh, including clearing a current value',()=>{
  const draft={...emptyPropertyDetails(),overrides:{Bedrooms:'2',Bathrooms:''}};
  const refreshed={...data,facts:[{label:'Bedrooms',value:'5'},{label:'Bathrooms',value:'3'}]};
  assert.equal(propertyDetailValue(refreshed,draft,'Bedrooms'),'2');
  assert.equal(propertyDetailValue(refreshed,draft,'Bathrooms'),'');
  assert.equal(proposedPropertyTotals(refreshed,draft).bathrooms,null);
  assert.equal(propertyDetailValue(refreshed,emptyPropertyDetails(),'Bedrooms'),'5');
});
test('missing current facts do not turn into invented totals, while blank additions mean zero',()=>{
  const draft=emptyPropertyDetails();draft.additions={bedrooms:'1',bathrooms:'',squareFeet:'300'};
  assert.deepEqual(proposedPropertyTotals(undefined,draft),{bedrooms:null,bathrooms:null,squareFeet:null});
  assert.equal(proposedPropertyTotals(data,draft).bathrooms,1.5);
  draft.overrides.Bedrooms='0';
  assert.equal(proposedPropertyTotals(data,draft).bedrooms,1);
  draft.additions.bedrooms='-1';assert.equal(proposedPropertyTotals(data,draft).bedrooms,null);
  draft.additions.bedrooms='Infinity';assert.equal(proposedPropertyTotals(data,draft).bedrooms,null);
});

test('multifamily unit rows start blank and never distribute aggregate provider facts',async()=>{
  const {propertyUnits,isMultifamilyProperty}=await import('../src/lib/deals/property-details.ts');
  const multi={...data,facts:[...data.facts.filter(f=>f.label!=='Property type'),{label:'Property type',value:'Multi-Family'},{label:'Units',value:'2'}]};
  assert.equal(isMultifamilyProperty(multi,emptyPropertyDetails()),true);
  const units=propertyUnits(multi,emptyPropertyDetails());
  assert.equal(units.length,2);
  assert.equal(units[0].bedrooms,'');assert.equal(units[1].monthlyRent,'');
  assert.deepEqual(propertyUnits(multi,{...emptyPropertyDetails(),units:[]}),[]);
  assert.equal(isMultifamilyProperty(data,emptyPropertyDetails()),false);
});
test('unit additions and total rent handle new units, fractional baths and incomplete inputs',async()=>{
  const {emptyPropertyUnit,unitProposedTotals,totalUnitRent}=await import('../src/lib/deals/property-details.ts');
  const unit={...emptyPropertyUnit('one','Unit 1'),bedrooms:'2',bathrooms:'1.5',squareFeet:'900',monthlyRent:'1200',additions:{bedrooms:'1',bathrooms:'0.5',squareFeet:'100'}};
  const planned={...emptyPropertyUnit('two','New unit','proposed'),monthlyRent:'800'};
  assert.deepEqual(unitProposedTotals(unit),{bedrooms:3,bathrooms:2,squareFeet:1000});
  assert.equal(totalUnitRent([unit,planned]),2000);
  assert.equal(totalUnitRent([unit,{...planned,monthlyRent:''}]),null);
  assert.equal(totalUnitRent([unit,{...planned,monthlyRent:'0'}]),1200);
  assert.equal(totalUnitRent([]),null);
  assert.equal(totalUnitRent([unit,{...planned,monthlyRent:'-1'}]),null);
  assert.equal(unitProposedTotals(planned).bedrooms,null);
});
