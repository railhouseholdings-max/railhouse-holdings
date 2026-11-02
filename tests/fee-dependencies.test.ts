import test from "node:test";
import assert from "node:assert/strict";
import { calculateDeal } from "../src/lib/calculations/deal.ts";
import { DEFAULT_CLOSING_ADJUSTMENTS, estimateClosingCosts } from "../src/lib/calculations/closing.ts";
import { DEFAULT_PURCHASE_ADJUSTMENTS } from "../src/lib/calculations/purchase.ts";
import { spreadsheetExample } from "../src/lib/data/spreadsheet-example.ts";

const loan = { loanAmount: 113250, annualRate: 6.25, annualTaxes: 2410.08, annualInsurance: 970, fundingDate: "2026-06-08" };
const source = { ...DEFAULT_CLOSING_ADJUSTMENTS, annualFloodInsurance: 905, aggregateEscrowAdjustment: -604.99, brokerCredit: 339.75, quotedTitlePremium: 195 };
const deal = { ...spreadsheetExample, purchasePrice: 80000, rehabBudget: 50000, arv: 151000, annualPropertyTaxes: 2410.08, annualInsurance: 970 };
const calculate = (input = deal) => calculateDeal(input, source, DEFAULT_PURCHASE_ADJUSTMENTS);
const fixedIds = ["underwriting", "appraisal", "amc", "credit-report", "environmental", "restrictions", "settlement", "courier", "notary", "cpl", "title-fund", "recording"];
const fee = (quote: ReturnType<typeof estimateClosingCosts>, id: string) => quote.items.find(item => item.id === id)!.amount;

test("purchase price updates project capital without changing an ARV-based refinance or inventing taxes", () => {
  const base = calculate();
  const higherPrice = calculate({ ...deal, purchasePrice: 95000 });
  assert.equal(higherPrice.totalProjectCost - base.totalProjectCost, 15000);
  assert.ok(Math.abs(higherPrice.cashRemainingInDeal - base.cashRemainingInDeal - 15000) < 0.000001);
  assert.equal(higherPrice.purchaseClosingCosts, 314);
  assert.equal(higherPrice.refinanceLoanAmount, base.refinanceLoanAmount);
  assert.equal(higherPrice.refinanceCosts, base.refinanceCosts);
  assert.equal(higherPrice.monthlyTaxes, base.monthlyTaxes);
  assert.equal(higherPrice.monthlyInsurance, base.monthlyInsurance);
});

test("ARV and LTV change loan amount, origination, payment, and interest while flat fees stay fixed", () => {
  const base = calculate();
  for (const input of [{ ...deal, arv: 302000 }, { ...deal, refinanceLtv: 90 }]) {
    const changed = calculate(input);
    assert.ok(changed.refinanceLoanAmount > base.refinanceLoanAmount);
    assert.ok(changed.originationFee > base.originationFee);
    assert.ok(changed.monthlyPrincipalAndInterest > base.monthlyPrincipalAndInterest);
    assert.ok(changed.prepaidInterest > base.prepaidInterest);
    for (const id of fixedIds) assert.equal(fee(changed.closing!, id), fee(base.closing!, id), `${id} should stay fixed`);
    assert.equal(changed.purchaseClosingCosts, base.purchaseClosingCosts);
    assert.equal(changed.closing?.escrowDeposit, base.closing?.escrowDeposit);
  }
  assert.equal(calculate({ ...deal, arv: 302000 }).originationFee, 3963.75);
});

test("interest rate affects debt service and prepaid interest, not origination or flat fees", () => {
  const base = calculate();
  const higherRate = calculate({ ...deal, interestRate: 8 });
  assert.ok(higherRate.monthlyPrincipalAndInterest > base.monthlyPrincipalAndInterest);
  assert.ok(higherRate.prepaidInterest > base.prepaidInterest);
  assert.equal(higherRate.originationFee, base.originationFee);
  for (const id of fixedIds) assert.equal(fee(higherRate.closing!, id), fee(base.closing!, id));
});

test("funding date changes actual interest days and closing cash, not recurring mortgage costs", () => {
  const base = calculate();
  const monthEnd = calculate({ ...deal, closingDate: "2026-06-30" });
  assert.equal(monthEnd.interestDays, 1);
  assert.equal(monthEnd.prepaidInterest, 19.39);
  assert.equal(monthEnd.monthlyMortgagePayment, base.monthlyMortgagePayment);
  assert.equal(monthEnd.closing?.escrowDeposit, base.closing?.escrowDeposit);
  assert.ok(monthEnd.cashOutProceeds > base.cashOutProceeds);
});

test("amortization term changes monthly P&I without changing closing fees", () => {
  const base = calculate();
  const shorter = calculate({ ...deal, loanTermYears: 15 });
  assert.ok(shorter.monthlyPrincipalAndInterest > base.monthlyPrincipalAndInterest);
  assert.equal(shorter.refinanceCosts, base.refinanceCosts);
  assert.equal(shorter.cashOutProceeds, base.cashOutProceeds);
});

test("annual taxes dynamically change monthly tax expense and tax escrow alone", () => {
  const base = estimateClosingCosts(loan, source);
  const increased = estimateClosingCosts({ ...loan, annualTaxes: 3600 }, source);
  assert.equal(increased.monthlyTaxes, 300);
  assert.equal(fee(increased, "tax-escrow"), 1200);
  assert.equal(fee(increased, "homeowners-escrow"), fee(base, "homeowners-escrow"));
  assert.equal(increased.originationFee, base.originationFee);
});

test("rent changes rent-based expenses, not the loan, flat CapEx, or transaction fees", () => {
  const base = calculate({ ...deal, vacancyPercent: 5, maintenancePercent: 5 });
  const increased = calculate({ ...deal, monthlyRent: 2400, vacancyPercent: 5, maintenancePercent: 5 });
  assert.equal(increased.managementExpense, 312);
  assert.equal(increased.vacancyReserve, 120);
  assert.equal(increased.maintenanceReserve, 120);
  assert.equal(increased.monthlyCapexReserve, base.monthlyCapexReserve);
  assert.equal(increased.refinanceCosts, base.refinanceCosts);
  assert.equal(increased.purchaseClosingCosts, base.purchaseClosingCosts);
  assert.equal(increased.refinanceLoanAmount, base.refinanceLoanAmount);
});

test("title is quote-dependent, never presented as a guaranteed flat fee for another loan", () => {
  const unquoted = estimateClosingCosts({ ...loan, loanAmount: 250000 });
  assert.equal(unquoted.titleQuoteNeeded, true);
  assert.match(unquoted.items.find(item => item.id === "title-policy")!.basis, /Unconfirmed reference/);
  const confirmed = estimateClosingCosts(loan, { ...source, quotedTitlePremium: 290 });
  const reference = estimateClosingCosts(loan, source);
  assert.equal(confirmed.titleQuoteNeeded, false);
  assert.equal(confirmed.titlePremium, 290);
  assert.ok(Math.abs(confirmed.grossClosingCosts - reference.grossClosingCosts - 95) < 0.000001);
  assert.equal(confirmed.originationFee, reference.originationFee);
  assert.equal(confirmed.monthlyEscrow, reference.monthlyEscrow);
});

test("a confirmed zero title premium replaces the reference; invalid quotes are rejected", () => {
  assert.equal(estimateClosingCosts(loan, { ...source, quotedTitlePremium: 0 }).titlePremium, 0);
  assert.throws(() => estimateClosingCosts(loan, { ...source, quotedTitlePremium: -1 }), RangeError);
  assert.throws(() => estimateClosingCosts(loan, { ...source, quotedTitlePremium: NaN }), RangeError);
});
