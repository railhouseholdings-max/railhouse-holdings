import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnedValues} from '../src/lib/persistence/owned-fields.ts';
import {fromPropertyRow} from '../src/lib/persistence/property-records.ts';
import {propertyMetrics,portfolioMetrics} from '../src/lib/calculations/portfolio.ts';
const values={'property.address':'100 SYNTHETIC St','property.city':'Fort Wayne','property.state':'IN','property.zip':'46802','property.status':'Owned'};
test('owned actuals preserve unknown values; malformed numbers, dates and mixed refinance details fail',()=>{
  assert.equal(validateOwnedValues(values).finance.acquisition_date,null);
  for(const bad of [{'finance.purchase_price':-1},{'loan.interest_rate':101},{'operations.target_monthly_rent':NaN},{'finance.acquisition_date':'2026-02-30'},{'loan.refinance_date':'2026-01-01'},{'lease.start_date':'2026-01-01'},{'operations.management_percent':60,'operations.vacancy_percent':60}])assert.throws(()=>validateOwnedValues({...values,...bad}));
});
test('a purchased property counts even without complete actuals; unknown totals do not become zero',()=>{
  const p=fromPropertyRow({id:'SYNTHETIC',address:'100 SYNTHETIC St',city:'Fort Wayne',state:'IN',zip:'46802',property_financials:[],property_operations:[],property_loans:[],property_valuations:[],property_leases:[]});
  const totals=portfolioMetrics([p]);assert.equal(totals.count,1);assert.equal(totals.value,null);assert.equal(totals.debt,null);assert.equal(totals.cashFlow,null);assert.equal(p.acquisition.acquisitionDate,null);
});
test('target rent is distinguished from a lease; annual insurance and taxes are deducted once',()=>{
  const p=fromPropertyRow({id:'SYNTHETIC',address:'100 SYNTHETIC St',city:'Fort Wayne',state:'IN',zip:'46802',property_financials:[],property_operations:[{target_monthly_rent:1200,management_percent:10,vacancy_percent:0,maintenance_percent:0,annual_taxes:1200,annual_insurance:600,monthly_other_expenses:50}],property_loans:[{is_current:true,lender:'SYNTHETIC',balance:100000,monthly_principal_and_interest:600}],property_valuations:[{is_current:true,current_estimated_value:150000}],property_leases:[]});
  const m=propertyMetrics(p);assert.equal(m.rent,1200);assert.equal(m.monthlyCashFlow,280);assert.equal(m.equity,50000);assert.equal(m.rentIsTarget,true);assert.equal(p.operations.lease,null);
});
