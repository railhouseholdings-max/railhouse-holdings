import type { Property } from '../../domain/models.ts';
const known=(values:(number|null)[])=>values.every(v=>v!==null&&Number.isFinite(v));
export function propertyMetrics(property:Property) {
  const {operations:o,financials:f}=property;
  const rent=o.lease?.monthlyRent??o.targetMonthlyRent??null;
  const debt=property.loan?property.loan.balance:property.evidence?.debtUnknown?null:0;
  const payment=property.loan?property.loan.monthlyPrincipalAndInterest:property.evidence?.debtUnknown?null:0;
  const costs=[rent,o.managementPercent,o.vacancyPercent,o.maintenancePercent,o.annualTaxes,o.annualInsurance,o.monthlyOtherExpenses,payment];
  const monthlyCashFlow=known(costs)?rent!-rent!*(o.managementPercent!+o.vacancyPercent!+o.maintenancePercent!)/100-o.annualTaxes!/12-o.annualInsurance!/12-o.monthlyOtherExpenses!-payment!:null;
  const equity=property.valuation.currentEstimatedValue!=null&&debt!=null?property.valuation.currentEstimatedValue-debt:null;
  return {rent,debt,equity,monthlyCashFlow,rentIsTarget:!o.lease&&o.targetMonthlyRent!=null,
    cashOnCashPercent:f.cashLeftInDeal!=null&&f.cashLeftInDeal>0&&monthlyCashFlow!=null?monthlyCashFlow*12/f.cashLeftInDeal*100:null,
    totalReturnPercent:f.totalCashInvested!=null&&f.totalCashInvested>0&&equity!=null&&f.realizedCashFlow!=null&&f.realizedSaleProceeds!=null&&f.cashLeftInDeal!=null?(equity+f.realizedCashFlow+f.realizedSaleProceeds-f.cashLeftInDeal)/f.totalCashInvested*100:null};
}
export function portfolioMetrics(properties:Property[]) {
  const sum=(v:(number|null)[])=>!v.length?0:v.every(x=>x!=null)?v.reduce<number>((s,x)=>s+x!,0):null;
  const metrics=properties.map(propertyMetrics);
  const totals={count:properties.length,value:sum(properties.map(p=>p.valuation.currentEstimatedValue)),debt:sum(metrics.map(m=>m.debt)),equity:sum(metrics.map(m=>m.equity)),rent:sum(metrics.map(m=>m.rent)),cashFlow:sum(metrics.map(m=>m.monthlyCashFlow)),cashInvested:sum(properties.map(p=>p.financials.totalCashInvested)),cashLeft:sum(properties.map(p=>p.financials.cashLeftInDeal))};
  return {...totals,usesTargetRent:metrics.some(m=>m.rentIsTarget),cashOnCashPercent:totals.cashLeft!=null&&totals.cashLeft>0&&totals.cashFlow!=null?totals.cashFlow*12/totals.cashLeft*100:null};
}
