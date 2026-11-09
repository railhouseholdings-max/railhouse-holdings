import type { Property } from '../../domain/models.ts';
import { dbNumber, type DbRow } from './deal-records.ts';
function current(value: unknown, label: string): DbRow | null {
  if (!Array.isArray(value)) throw new Error(`Stored ${label} relation is invalid.`);
  const rows = value.filter(row=>row.is_current === true);
  if (rows.length > 1) throw new Error(`Stored ${label} has multiple current records.`);
  return rows[0] ?? null;
}
const text = (v: unknown) => {if (typeof v !== 'string') throw new Error('A stored property value is missing.');return v;};
const nullableText = (v: unknown) => v == null ? null : text(v);
const number=(v:unknown)=>v==null?null:dbNumber(v);
function optionalRelation(value:unknown,label:string):DbRow {if(value&&typeof value==='object'&&!Array.isArray(value))return value as DbRow;if(!Array.isArray(value)||value.length>1)throw new Error(`Stored ${label} relation is invalid.`);return value[0]??{};}
export function fromPropertyRow(row: DbRow): Property {
  const n=(key:string)=>number(row[key]);
  const finance=optionalRelation(row.property_financials,'property financials'), operations=optionalRelation(row.property_operations,'property operations');
  const f=(key:string)=>number(finance[key]),o=(key:string)=>number(operations[key]);
  const loan=current(row.property_loans,'property loans'),lease=current(row.property_leases,'property leases'),value=current(row.property_valuations,'property valuations');

  if (row.status!=null&&!['Rented','Rehab','Vacant','Owned'].includes(String(row.status))) throw new Error('Stored property status is invalid.');
  return {id:text(row.id),address:text(row.address),city:text(row.city),state:text(row.state),zip:text(row.zip),beds:n('beds'),baths:n('baths'),squareFeet:n('square_feet'),yearBuilt:n('year_built'),garage:nullableText(row.garage),lotSquareFeet:n('lot_square_feet'),propertyType:nullableText(row.property_type),status:(row.status??'Owned') as Property['status'],revision:Number(row.details_revision??0),evidence:{...((row.actuals_evidence??{}) as Record<string,unknown>),...(!loan&&finance.initial_financing==null?{debtUnknown:true}:{})},
    acquisition:{purchasePrice:f('purchase_price'),closingCosts:f('acquisition_closing_costs'),initialFinancing:f('initial_financing'),cashInvested:f('acquisition_cash_invested'),acquisitionDate:nullableText(finance.acquisition_date)},
    rehab:{originalBudget:f('original_rehab_budget'),actualCost:f('actual_rehab_cost'),startDate:nullableText(finance.rehab_start_date),completionDate:nullableText(finance.rehab_completion_date)},
    financials:{totalCashInvested:f('total_cash_invested'),cashLeftInDeal:f('cash_left_in_deal'),realizedCashFlow:f('realized_cash_flow'),realizedSaleProceeds:f('realized_sale_proceeds')},
    operations:{targetMonthlyRent:o('target_monthly_rent'),lease:lease?{monthlyRent:dbNumber(lease.monthly_rent),startDate:nullableText(lease.start_date),endDate:nullableText(lease.end_date)}:null,managementPercent:o('management_percent'),vacancyPercent:o('vacancy_percent'),maintenancePercent:o('maintenance_percent'),annualTaxes:o('annual_taxes'),annualInsurance:o('annual_insurance'),monthlyOtherExpenses:o('monthly_other_expenses')},
    loan:loan?{lender:text(loan.lender),originalAmount:number(loan.original_amount),balance:number(loan.balance),balanceAsOf:nullableText(loan.balance_as_of),interestRate:number(loan.interest_rate),termYears:number(loan.term_years),monthlyPrincipalAndInterest:number(loan.monthly_principal_and_interest),annualTaxes:number(loan.annual_taxes),annualInsurance:number(loan.annual_insurance),prepaymentPenalty:nullableText(loan.prepayment_penalty),refinance:loan.refinance_date==null?null:{date:text(loan.refinance_date),amount:dbNumber(loan.refinance_amount),costs:dbNumber(loan.refinance_costs)}}:null,
    valuation:{originalArv:number(value?.original_arv),appraisedValue:number(value?.appraised_value),currentEstimatedValue:number(value?.current_estimated_value),asOfDate:nullableText(value?.as_of_date)},
  };
}
