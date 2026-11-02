import type { Property } from "../../domain/models";
export function propertyMetrics(property: Property) {
  const { operations: o, financials: f } = property;
  const rent = o.lease?.monthlyRent ?? 0;
  const debt = property.loan?.balance ?? 0;
  const monthlyCashFlow = rent - rent * (o.managementPercent + o.vacancyPercent + o.maintenancePercent) / 100 - o.annualTaxes / 12 - o.annualInsurance / 12 - o.monthlyOtherExpenses - (property.loan?.monthlyPrincipalAndInterest ?? 0);
  const equity = property.valuation.currentEstimatedValue - debt;
  return { rent, debt, equity, monthlyCashFlow, cashOnCashPercent: f.cashLeftInDeal > 0 ? monthlyCashFlow * 12 / f.cashLeftInDeal * 100 : null, totalReturnPercent: f.totalCashInvested > 0 ? (equity + f.realizedCashFlow + f.realizedSaleProceeds - f.cashLeftInDeal) / f.totalCashInvested * 100 : null };
}
export function portfolioMetrics(properties: Property[]) {
  const totals = properties.reduce((sum, p) => {
    const m = propertyMetrics(p);
    return { count: sum.count + 1, value: sum.value + p.valuation.currentEstimatedValue, debt: sum.debt + m.debt, equity: sum.equity + m.equity, rent: sum.rent + m.rent, cashFlow: sum.cashFlow + m.monthlyCashFlow, cashInvested: sum.cashInvested + p.financials.totalCashInvested, cashLeft: sum.cashLeft + p.financials.cashLeftInDeal };
  }, { count: 0, value: 0, debt: 0, equity: 0, rent: 0, cashFlow: 0, cashInvested: 0, cashLeft: 0 });
  return { ...totals, cashOnCashPercent: totals.cashLeft > 0 ? totals.cashFlow * 12 / totals.cashLeft * 100 : null };
}
