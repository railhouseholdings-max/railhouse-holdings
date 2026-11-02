import test from 'node:test';
import assert from 'node:assert/strict';
import { mockProperties } from '../src/lib/data/mock.ts';
import { fromPropertyRow } from '../src/lib/persistence/property-records.ts';
import { propertyMetrics } from '../src/lib/calculations/portfolio.ts';
import type { Property } from '../src/domain/models.ts';
function databaseRow(p:Property) {
  return {id:p.id,address:p.address,city:p.city,state:p.state,zip:p.zip,beds:p.beds,baths:p.baths,square_feet:p.squareFeet,year_built:p.yearBuilt,garage:p.garage,lot_square_feet:p.lotSquareFeet,property_type:p.propertyType,status:p.status,
    property_financials:{purchase_price:p.acquisition.purchasePrice,acquisition_closing_costs:p.acquisition.closingCosts,initial_financing:p.acquisition.initialFinancing,acquisition_cash_invested:p.acquisition.cashInvested,acquisition_date:p.acquisition.acquisitionDate,original_rehab_budget:p.rehab.originalBudget,actual_rehab_cost:p.rehab.actualCost,rehab_start_date:p.rehab.startDate,rehab_completion_date:p.rehab.completionDate,total_cash_invested:p.financials.totalCashInvested,cash_left_in_deal:p.financials.cashLeftInDeal,realized_cash_flow:p.financials.realizedCashFlow,realized_sale_proceeds:p.financials.realizedSaleProceeds},
    property_operations:{management_percent:p.operations.managementPercent,vacancy_percent:p.operations.vacancyPercent,maintenance_percent:p.operations.maintenancePercent,annual_taxes:p.operations.annualTaxes,annual_insurance:p.operations.annualInsurance,monthly_other_expenses:p.operations.monthlyOtherExpenses},
    property_loans:p.loan?[{is_current:true,lender:p.loan.lender,original_amount:p.loan.originalAmount,balance:p.loan.balance,interest_rate:p.loan.interestRate,term_years:p.loan.termYears,monthly_principal_and_interest:p.loan.monthlyPrincipalAndInterest,annual_taxes:p.loan.annualTaxes,annual_insurance:p.loan.annualInsurance,prepayment_penalty:p.loan.prepaymentPenalty,refinance_date:p.loan.refinance?.date??null,refinance_amount:p.loan.refinance?.amount??null,refinance_costs:p.loan.refinance?.costs??null}]:[],
    property_leases:p.operations.lease?[{is_current:true,monthly_rent:p.operations.lease.monthlyRent,start_date:p.operations.lease.startDate,end_date:p.operations.lease.endDate}]:[],
    property_valuations:[{is_current:true,original_arv:p.valuation.originalArv,appraised_value:p.valuation.appraisedValue,current_estimated_value:p.valuation.currentEstimatedValue,as_of_date:p.valuation.asOfDate}],
  };
}
test('normalized property records preserve every original domain value and portfolio calculation',()=>{
  for(const p of mockProperties) {
    const restored=fromPropertyRow(databaseRow(p));
    assert.deepEqual(restored,p);
    assert.deepEqual(propertyMetrics(restored),propertyMetrics(p));
  }
});
test('missing/ambiguous current records fail without silently zeroing portfolio values',()=>{
  const row=databaseRow(mockProperties[0]);
  assert.throws(()=>fromPropertyRow({...row,property_valuations:[]}));
  assert.throws(()=>fromPropertyRow({...row,property_loans:[...row.property_loans,...row.property_loans]}));
  assert.throws(()=>fromPropertyRow({...row,property_financials:null}));
  assert.throws(()=>fromPropertyRow({...row,baths:null}));
});
