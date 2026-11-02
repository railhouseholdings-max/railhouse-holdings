import test from "node:test";
import assert from "node:assert/strict";
import { CLOSING_PROFILE, DEFAULT_CLOSING_ADJUSTMENTS, estimateClosingCosts } from "../src/lib/calculations/closing.ts";
import { calculateDeal } from "../src/lib/calculations/deal.ts";
import { spreadsheetExample } from "../src/lib/data/spreadsheet-example.ts";

// Verified ALTA p7 / Closing Disclosure pp8–11. No identity documents retained.
const loan = { loanAmount: 113250, annualRate: 6.25, annualTaxes: 2410.08, annualInsurance: 970, fundingDate: "2026-06-08" };
const adjustments = { ...DEFAULT_CLOSING_ADJUSTMENTS, annualFloodInsurance: 905, aggregateEscrowAdjustment: -604.99, brokerCredit: 339.75, quotedTitlePremium: 195 };
const deal = { ...spreadsheetExample, arv: 151000, annualPropertyTaxes: 2410.08, annualInsurance: 970 };

test("reconciles every Closing Disclosure subtotal and the actual cash disbursement to the cent", () => {
  const r = estimateClosingCosts(loan, adjustments);
  assert.equal(r.loanCosts, 5888.88);
  assert.equal(r.otherCosts, 3447.24);
  assert.equal(r.grossClosingCosts, 9336.12);
  assert.equal(r.paidBeforeClosing, 1580);
  assert.equal(r.atClosingCosts, 7756.12);
  assert.equal(r.credits, 339.75);
  assert.equal(r.cashToBorrower, 105833.63);
  assert.equal(r.netProjectRecovery, 104253.63);
  assert.equal(r.netBorrowerCost, 8996.37);
});

test("rounds the per diem and monthly deposits using the settlement's convention", () => {
  const r = estimateClosingCosts(loan, adjustments);
  assert.equal(r.dailyInterest, 19.39);
  assert.equal(r.interestDays, 23);
  assert.equal(r.prepaidInterest, 445.97);
  assert.equal(r.escrowDeposit, 1071.27);
  assert.equal(r.monthlyHomeowners, 80.83);
  assert.equal(r.monthlyTaxes, 200.84);
  assert.equal(r.monthlyFlood, 75.42);
  assert.equal(r.monthlyEscrow, 357.09);
  assert.equal(r.items.find(i => i.id === "homeowners-escrow")?.amount, 646.64);
  assert.equal(r.items.find(i => i.id === "tax-escrow")?.amount, 803.36);
  assert.equal(r.items.find(i => i.id === "flood-escrow")?.amount, 226.26);
});

test("document-mode monthly payment includes flood without double-counting escrow", () => {
  const r = calculateDeal(deal, adjustments);
  assert.equal(r.monthlyPrincipalAndInterest, 697.30);
  assert.equal(r.monthlyMortgagePayment, 1054.39);
  assert.equal(r.monthlyFloodInsurance, 75.42);
  assert.equal(r.cashOutProceeds, 105833.63);
  assert.equal(r.cashRemainingInDeal, 218500 - 104253.63);
});

test("paying a fee early changes the closing wire but never the economic investment", () => {
  const before = calculateDeal(deal, adjustments);
  const atClosing = calculateDeal(deal, { ...adjustments, appraisalPaidBeforeClosing: false, floodPremiumPaidBeforeClosing: false });
  assert.equal(atClosing.closing?.paidBeforeClosing, 0);
  assert.equal(before.closing?.paidBeforeClosing, 1580);
  assert.ok(Math.abs(before.cashOutProceeds - atClosing.cashOutProceeds - 1580) < 0.000001);
  assert.equal(atClosing.cashRemainingInDeal, before.cashRemainingInDeal);
  assert.equal(atClosing.recoveryPercent, before.recoveryPercent);
});

test("an acquisition debt payoff reduces wire proceeds without counting original debt twice", () => {
  const before = calculateDeal(deal, adjustments);
  const payoff = calculateDeal(deal, { ...adjustments, existingLoanPayoff: 50000 });
  assert.ok(Math.abs(before.cashOutProceeds - payoff.cashOutProceeds - 50000) < 0.000001);
  assert.equal(before.cashRemainingInDeal, payoff.cashRemainingInDeal);
});

test("origination scales and flat appraisal fees remain fixed; unquoted title stays explicitly unconfirmed", () => {
  const base = estimateClosingCosts(loan, adjustments);
  const larger = estimateClosingCosts({ ...loan, loanAmount: 226500 }, { ...adjustments, quotedTitlePremium: null });
  assert.equal(larger.originationFee, 3963.75);
  assert.equal(larger.items.find(i => i.id === "appraisal")?.amount, 500);
  assert.equal(larger.items.find(i => i.id === "amc")?.amount, 175);
  assert.equal(larger.titleQuoteNeeded, true);
  assert.equal(larger.items.find(i => i.id === "title-policy")?.amount, 195); // Reference only, not a fixed-price assertion.
  assert.equal(base.originationFee, 1981.88);
  assert.equal(CLOSING_PROFILE.originationPercent, 1.75);
});

test("future estimates do not assume past credits or flood coverage", () => {
  const r = estimateClosingCosts(loan);
  assert.equal(r.credits, 0);
  assert.equal(r.items.find(i => i.id === "aggregate")?.amount, 0);
  assert.equal(r.items.find(i => i.id === "flood-premium")?.amount, 0);
  assert.equal(r.items.find(i => i.id === "flood-escrow")?.amount, 0);
  assert.equal(r.monthlyFlood, 0);
});

test("annual premium changes update prepaid cash, escrow, and recurring expense separately", () => {
  const r = estimateClosingCosts({ ...loan, annualInsurance: 1200 }, { ...DEFAULT_CLOSING_ADJUSTMENTS, annualFloodInsurance: 600 });
  assert.equal(r.items.find(i => i.id === "homeowners-premium")?.amount, 1200);
  assert.equal(r.items.find(i => i.id === "homeowners-escrow")?.amount, 800);
  assert.equal(r.monthlyHomeowners, 100);
  assert.equal(r.items.find(i => i.id === "flood-premium")?.amount, 600);
  assert.equal(r.items.find(i => i.id === "flood-escrow")?.amount, 150);
  assert.equal(r.monthlyFlood, 50);
});

test("lender credit is distinct from broker credit and non-borrower compensation", () => {
  const r = estimateClosingCosts(loan, { ...adjustments, lenderCredit: 100 });
  assert.equal(r.credits, 439.75);
  assert.equal(r.cashToBorrower, 105933.63);
  assert.equal(r.grossClosingCosts, 9336.12);
  assert.equal(r.items.some(i => i.label.includes("compensation")), false);
});

test("invalid dates, negative fees, nonpositive loans, and excessive escrow credits fail clearly", () => {
  assert.throws(() => estimateClosingCosts({ ...loan, fundingDate: "2026-02-30" }), RangeError);
  assert.throws(() => estimateClosingCosts({ ...loan, loanAmount: 0 }), RangeError);
  assert.throws(() => estimateClosingCosts(loan, { ...adjustments, annualFloodInsurance: -1 }), RangeError);
  assert.throws(() => estimateClosingCosts(loan, { ...adjustments, aggregateEscrowAdjustment: -99999 }), RangeError);
});
