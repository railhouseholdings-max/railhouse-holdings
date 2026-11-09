import test from "node:test";
import assert from "node:assert/strict";
import { calculateDeal, monthlyPayment, prepaidInterestDays } from "../src/lib/calculations/deal.ts";
import { portfolioMetrics, propertyMetrics } from "../src/lib/calculations/portfolio.ts";
import { spreadsheetExample } from "../src/lib/data/spreadsheet-example.ts";
import type { Property } from "../src/domain/models.ts";

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} differs from ${expected}`);
}

test("amortization matches an independent benchmark and handles zero interest", () => {
  near(monthlyPayment(150000, 6, 30), 899.3257877);
  assert.equal(monthlyPayment(120000, 0, 10), 1000);
  assert.equal(monthlyPayment(0, 6, 30), 0);
  near(monthlyPayment(120000, 1e-12, 10), 1000);
});

test("matches source project cost B18, mortgage F19, escrow B27, and monthly costs F28", () => {
  // Independent effective values read from Google Sheets on 2026-10-30.
  const result = calculateDeal(spreadsheetExample);
  assert.equal(result.totalProjectCost, 218500);
  assert.equal(result.refinanceLoanAmount, 195000);
  near(result.monthlyMortgagePayment, 1484.8152074981356);
  near(result.closingEscrow, 767.9794520547946);
  assert.equal(result.additionalMonthlyCosts, 334);
  near(result.totalMonthlyCost, 1818.8152074981356);
});

test("appraisal correction reconciles exactly to source net proceeds B30", () => {
  const result = calculateDeal(spreadsheetExample);
  near(result.cashOutProceeds, 186819.5205479452 - 675);
  near(result.cashRemainingInDeal, 32355.4794520548);
  near(result.recoveryPercent!, 85.19200025077583);
});

test("unified rent explicitly reconciles to source cash flow F31", () => {
  const result = calculateDeal(spreadsheetExample);
  // Source uses 1400 income but 1800 for management. App uses 1800 for both.
  near(result.monthlyCashFlow, -418.8152074981356 + 400);
  assert.equal(result.managementExpense, 234);
  near(result.rentEfficiencyPercent!, 8.307692307692308);
  assert.deepEqual(result.checks, { recovery: true, cashFlow: false, rentEfficiency: false });
});

test("management uses the edited rate rather than the source hard-coded 13%", () => {
  const result = calculateDeal({ ...spreadsheetExample, managementPercent: 8 });
  assert.equal(result.managementExpense, 144);
  near(result.monthlyCashFlow, 71.1847925018644);
});

test("project contingency and refinance fees affect separate stages without double counting", () => {
  const base = calculateDeal(spreadsheetExample);
  const project = calculateDeal({ ...spreadsheetExample, unexpectedConstructionCosts: 3000 });
  assert.equal(project.totalProjectCost - base.totalProjectCost, 1000);
  assert.equal(project.cashOutProceeds, base.cashOutProceeds);
  const fees = calculateDeal({ ...spreadsheetExample, closingCosts: 5000, appraisalFee: 775 });
  assert.equal(fees.totalProjectCost, base.totalProjectCost);
  near(fees.cashOutProceeds, base.cashOutProceeds - 1100);
});

test("prepaid interest includes closing day, handles leap years, and crosses year boundaries", () => {
  assert.equal(prepaidInterestDays("2026-06-08"), 23);
  assert.equal(prepaidInterestDays("2026-06-30"), 1);
  assert.equal(prepaidInterestDays("2026-12-01"), 31);
  assert.equal(prepaidInterestDays("2024-02-01"), 29);
  assert.equal(prepaidInterestDays("2026-02-01"), 28);
  assert.equal(prepaidInterestDays("2024-02-29"), 1);
});

test("upfront escrow deposits add to deductions, without inflating monthly costs", () => {
  const base = calculateDeal(spreadsheetExample);
  const result = calculateDeal({ ...spreadsheetExample, taxEscrow: 600, insuranceEscrow: 300 });
  near(result.closingEscrow, base.closingEscrow + 900);
  near(result.cashOutProceeds, base.cashOutProceeds - 900);
  assert.equal(result.monthlyCashFlow, base.monthlyCashFlow);
});

test("optional reserves add to CapEx without changing the refinance", () => {
  const base = calculateDeal(spreadsheetExample);
  const result = calculateDeal({ ...spreadsheetExample, vacancyPercent: 5, maintenancePercent: 5 });
  assert.equal(result.vacancyReserve, 90);
  assert.equal(result.maintenanceReserve, 90);
  near(result.monthlyCashFlow, base.monthlyCashFlow - 180);
  assert.equal(result.cashOutProceeds, base.cashOutProceeds);
});

test("zero denominators return N/A, and zero LTV has no loan or prepaid interest", () => {
  const result = calculateDeal({ ...spreadsheetExample, purchasePrice: 0, rehabBudget: 0, unexpectedConstructionCosts: 0, holdingCosts: 0, arv: 0, refinanceLtv: 0 });
  assert.equal(result.recoveryPercent, null);
  assert.equal(result.rentEfficiencyPercent, null);
  assert.equal(result.monthlyPrincipalAndInterest, 0);
  assert.equal(result.prepaidInterest, 0);
  assert.equal(result.checks.recovery, null);
});

test("source check boundaries are inclusive for recovery/cash flow, strict for rent efficiency", () => {
  const result = calculateDeal({ ...spreadsheetExample, purchasePrice: 100000, rehabBudget: 0, unexpectedConstructionCosts: 0, holdingCosts: 0, arv: 100000, refinanceLtv: 85, interestRate: 0, closingCosts: 0, appraisalFee: 0, originationPercent: 0, monthlyRent: 0, annualPropertyTaxes: 0, annualInsurance: 0, managementPercent: 0, monthlyCapexReserve: 0 });
  assert.equal(result.checks.recovery, true);
  const noDebt = calculateDeal({ ...spreadsheetExample, refinanceLtv: 0, monthlyRent: 0, annualPropertyTaxes: 0, annualInsurance: 0, monthlyCapexReserve: 0 });
  assert.equal(noDebt.monthlyCashFlow, 0);
  assert.equal(noDebt.checks.cashFlow, true);
  assert.equal(calculateDeal({ ...spreadsheetExample, arv: 120000, monthlyRent: 1000 }).checks.rentEfficiency, false);
});

test("cash released beyond project cost is preserved as negative cash left", () => {
  assert.ok(calculateDeal({ ...spreadsheetExample, purchasePrice: 1000 }).cashRemainingInDeal < 0);
});

test("invalid financial inputs and invalid calendar dates are rejected", () => {
  for (const patch of [{ purchasePrice: -1 }, { arv: NaN }, { monthlyRent: Infinity }, { refinanceLtv: 101 }, { loanTermYears: 0 }, { loanTermYears: 0.001 }, { managementPercent: 90, vacancyPercent: 20 }, { originationPercent: 101 }, { closingDate: "2026-02-30" }, { closingDate: "2026-02-29" }, { closingDate: "" }]) {
    assert.throws(() => calculateDeal({ ...spreadsheetExample, ...patch }), RangeError);
  }
});

test("empty portfolio has zero totals and undefined return", () => {
  assert.deepEqual(portfolioMetrics([]), { count: 0, value: 0, debt: 0, equity: 0, rent: 0, cashFlow: 0, cashInvested: 0, cashLeft: 0, cashOnCashPercent: null,usesTargetRent:false });
});
test("property economics and portfolio aggregation handle an unlevered asset", () => {
  const p = { loan: null, operations: { lease: { monthlyRent: 1000 }, managementPercent: 10, vacancyPercent: 5, maintenancePercent: 5, annualTaxes: 1200, annualInsurance: 600, monthlyOtherExpenses: 50 }, valuation: { currentEstimatedValue: 100000 }, financials: { cashLeftInDeal: 0, totalCashInvested: 80000, realizedCashFlow: 5000, realizedSaleProceeds: 0 } } as Property;
  const m = propertyMetrics(p);
  assert.equal(m.monthlyCashFlow, 600);
  assert.equal(m.equity, 100000);
  assert.equal(m.cashOnCashPercent, null);
  assert.equal(m.totalReturnPercent, 131.25);
  const totals = portfolioMetrics([p, p]);
  assert.equal(totals.count, 2);
  assert.equal(totals.cashFlow, 1200);
  assert.equal(totals.value, 200000);
});
