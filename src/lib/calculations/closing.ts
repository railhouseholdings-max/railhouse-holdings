import type { ClosingAdjustments, ClosingLineItem, ClosingLoanInputs } from "../../domain/closing.ts";

// One observed closing, not a lender quote or a universal fee schedule.
// ALTA p7 and Closing Disclosure pp8–11 of the supplied signed package.
export const CLOSING_PROFILE = {
  name: "Railhouse closing baseline · June 2026",
  originationPercent: 1.75,
  appraisal: 500,
  appraisalAmc: 175,
  creditReport: 137,
  underwriting: 1995,
  lendersTitlePolicy: 195, // Document reference only; depends on insurer/coverage.
  titleReferenceLoanAmount: 113250,
  environmentalEndorsement: 50,
  restrictionsEndorsement: 50,
  notary: 175,
  settlement: 550,
  courier: 25,
  closingProtectionLetter: 50,
  titleEnforcement: 5,
  recording: 55,
  homeownersEscrowMonths: 8,
  taxEscrowMonths: 4,
  floodEscrowMonths: 3,
} as const;

export const DEFAULT_CLOSING_ADJUSTMENTS: ClosingAdjustments = {
  annualFloodInsurance: 0,
  aggregateEscrowAdjustment: 0,
  brokerCredit: 0,
  lenderCredit: 0,
  existingLoanPayoff: 0,
  additionalClosingCosts: 0,
  quotedTitlePremium: null,
  appraisalPaidBeforeClosing: true,
  floodPremiumPaidBeforeClosing: true,
};

export const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function prepaidInterestDays(fundingDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fundingDate)) throw new RangeError("Enter a funding date in YYYY-MM-DD format.");
  const date = new Date(`${fundingDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fundingDate) throw new RangeError("Enter a valid funding date.");
  const lastDay = new Date(date);
  lastDay.setUTCMonth(date.getUTCMonth() + 1, 0);
  return lastDay.getUTCDate() - date.getUTCDate() + 1;
}

export function estimateClosingCosts(loan: ClosingLoanInputs, adjustments: ClosingAdjustments = DEFAULT_CLOSING_ADJUSTMENTS) {
  for (const [key, value] of Object.entries(loan)) {
    if (key !== "fundingDate" && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new RangeError(`${key} must be a finite, non-negative number.`);
  }
  if (loan.loanAmount <= 0) throw new RangeError("Refinance loan amount must be greater than zero to estimate closing costs.");
  if (loan.annualRate > 100) throw new RangeError("Interest rate must be between 0 and 100%.");
  for (const [key, value] of Object.entries(adjustments)) {
    if (key === "quotedTitlePremium" && value === null) continue;
    if (key.endsWith("PaidBeforeClosing")) {
      if (typeof value !== "boolean") throw new RangeError("Choose when prepaid costs are paid.");
    } else if (typeof value !== "number" || !Number.isFinite(value) || (key !== "aggregateEscrowAdjustment" && value < 0)) {
      throw new RangeError(`${key} must be a valid amount.`);
    }
  }
  const p = CLOSING_PROFILE;
  const interestDays = prepaidInterestDays(loan.fundingDate);
  const titlePremium = adjustments.quotedTitlePremium ?? p.lendersTitlePolicy;
  const titleQuoteNeeded = adjustments.quotedTitlePremium === null;
  const dailyInterest = cents(loan.loanAmount * loan.annualRate / 100 / 365);
  const monthlyHomeowners = cents(loan.annualInsurance / 12);
  const monthlyTaxes = cents(loan.annualTaxes / 12);
  const monthlyFlood = cents(adjustments.annualFloodInsurance / 12);
  const items: ClosingLineItem[] = [];
  const add = (id: string, label: string, category: ClosingLineItem["category"], amount: number, basis: string, timing: ClosingLineItem["timing"] = "atClosing") => {
    const rounded = cents(amount);
    const calculation = id === "origination" ? `${loan.loanAmount.toLocaleString("en-US")} × ${p.originationPercent}% = $${rounded.toFixed(2)}. The 1.75% planning rate is inferred from the source closing’s $1,981.88 fee on a $113,250 loan and agrees with your spreadsheet.`
      : id === "title-policy" ? (titleQuoteNeeded
        ? `$${p.lendersTitlePolicy.toFixed(2)} is only the premium observed for $${p.titleReferenceLoanAmount.toLocaleString("en-US")} coverage in your document. Title insurance is quote-dependent, not a universal fixed fee. Actual pricing depends on the insurer's filed schedule, coverage amount, policy, and applicable discounts. No reliable percentage can be inferred from a single closing. The estimate keeps this reference until a confirmed title premium is entered under lender-specific adjustments.`
        : `Your entered title-policy quote is $${titlePremium.toFixed(2)}. It replaces the document reference dollar-for-dollar; it is not an additional charge. Confirm that the quote covers this deal's current loan amount. The app does not invent a title-insurance rate schedule.`)
      : id === "interest" ? `$${dailyInterest.toFixed(2)} per day × ${interestDays} days = $${rounded.toFixed(2)}. Daily interest = $${loan.loanAmount.toFixed(2)} × ${loan.annualRate}% ÷ 365, rounded to cents. The day count includes the funding date through month-end.`
      : id === "homeowners-escrow" ? `$${monthlyHomeowners.toFixed(2)} per month × ${p.homeownersEscrowMonths} months = $${rounded.toFixed(2)}. The monthly amount is annual homeowners insurance ÷ 12, rounded to cents. Eight months is the source closing’s baseline, not a lender guarantee.`
      : id === "tax-escrow" ? `$${monthlyTaxes.toFixed(2)} per month × ${p.taxEscrowMonths} months = $${rounded.toFixed(2)}. The monthly amount is annual property taxes ÷ 12, rounded to cents. Four months is the source closing’s baseline.`
      : id === "flood-escrow" ? `$${monthlyFlood.toFixed(2)} per month × ${p.floodEscrowMonths} months = $${rounded.toFixed(2)}. The monthly amount is annual flood insurance ÷ 12, rounded to cents. Three months is the source closing’s baseline; a $0 premium produces a $0 reserve.`
      : id === "homeowners-premium" ? `One full year of the entered homeowners premium: $${rounded.toFixed(2)}. This is the upfront annual premium, separate from the initial escrow deposit and recurring monthly expense.`
      : id === "flood-premium" ? `One full year of the entered flood premium: $${rounded.toFixed(2)}. A $0 input means no modeled flood premium. Payment timing is controlled under lender-specific adjustments.`
      : id === "aggregate" ? `Lender-confirmed signed adjustment of $${rounded.toFixed(2)}. A negative value reduces the initial escrow deposit. The actual closing used −$604.99; new estimates assume $0 until confirmed.`
      : id === "additional" ? `Entered additional quoted charges: $${rounded.toFixed(2)}. This is not automatically estimated; include only charges not already listed.`
      : `Fixed planning baseline of $${rounded.toFixed(2)} from the signed June 2026 closing. This amount is not scaled with loan size. It can differ for another lender, property, provider, or state; the current profile keeps it read-only.`;
    items.push({ id, label, category, amount: rounded, basis, timing, explanation: calculation + (timing === "beforeClosing" ? " Paid before closing: included in total costs, but not deducted from the closing wire a second time." : " Included in charges paid at closing.") });
  };
  add("origination", "Origination", "loan", loan.loanAmount * p.originationPercent / 100, `${p.originationPercent}% × refinance loan`);
  add("underwriting", "Underwriting", "loan", p.underwriting, "Fixed baseline from closing document");
  const appraisalTiming = adjustments.appraisalPaidBeforeClosing ? "beforeClosing" : "atClosing";
  add("appraisal", "Appraisal", "loan", p.appraisal, "Fixed baseline", appraisalTiming);
  add("amc", "Appraisal AMC fee", "loan", p.appraisalAmc, "Fixed baseline", appraisalTiming);
  add("credit-report", "Credit report", "loan", p.creditReport, "Fixed baseline");
  add("title-policy", "Lender’s title policy · quote-dependent", "loan", titlePremium, titleQuoteNeeded ? "Unconfirmed reference: $195 at $113,250 coverage" : "Entered quote · confirm current loan coverage");
  add("environmental", "ALTA 8.1 environmental endorsement", "loan", p.environmentalEndorsement, "Fixed baseline");
  add("restrictions", "ALTA 9 restrictions endorsement", "loan", p.restrictionsEndorsement, "Fixed baseline");
  add("settlement", "Settlement / closing agent", "loan", p.settlement, "Fixed baseline");
  add("courier", "Courier / delivery", "loan", p.courier, "Fixed baseline");
  add("notary", "Notary", "loan", p.notary, "Fixed baseline");
  add("cpl", "Closing protection letter", "loan", p.closingProtectionLetter, "Fixed baseline");
  add("title-fund", "Title insurance enforcement fund", "loan", p.titleEnforcement, "Fixed baseline");
  add("additional", "Additional quoted closing costs", "loan", adjustments.additionalClosingCosts, "Only costs not already itemized");
  add("recording", "Mortgage recording", "government", p.recording, "Observed Indiana recording charge; not a nationwide fee");
  add("homeowners-premium", "Homeowners premium · 12 months", "prepaid", loan.annualInsurance, "Annual homeowners premium");
  add("interest", `Prepaid interest · ${interestDays} days`, "prepaid", dailyInterest * interestDays, "Rounded daily interest × inclusive days from funding through month-end");
  add("flood-premium", "Flood premium · 12 months", "prepaid", adjustments.annualFloodInsurance, "Annual flood premium; zero when not required", adjustments.floodPremiumPaidBeforeClosing ? "beforeClosing" : "atClosing");
  add("homeowners-escrow", `Homeowners escrow · ${p.homeownersEscrowMonths} months`, "escrow", monthlyHomeowners * p.homeownersEscrowMonths, `Rounded monthly homeowners premium × ${p.homeownersEscrowMonths}`);
  add("tax-escrow", `Property tax escrow · ${p.taxEscrowMonths} months`, "escrow", monthlyTaxes * p.taxEscrowMonths, `Rounded monthly property taxes × ${p.taxEscrowMonths}`);
  add("flood-escrow", `Flood escrow · ${p.floodEscrowMonths} months`, "escrow", monthlyFlood * p.floodEscrowMonths, `Rounded monthly flood premium × ${p.floodEscrowMonths}`);
  add("aggregate", "Aggregate escrow adjustment", "escrow", adjustments.aggregateEscrowAdjustment, "Lender-confirmed signed amount; no credit assumed by default");
  const sum = (selected: ClosingLineItem[]) => cents(selected.reduce((total, item) => total + item.amount, 0));
  const loanCosts = sum(items.filter(item => item.category === "loan"));
  const escrowDeposit = sum(items.filter(item => item.category === "escrow"));
  if (escrowDeposit < 0) throw new RangeError("The aggregate adjustment cannot make the initial escrow deposit negative.");
  const otherCosts = sum(items.filter(item => item.category !== "loan"));
  const grossClosingCosts = sum(items);
  const paidBeforeClosing = sum(items.filter(item => item.timing === "beforeClosing"));
  const atClosingCosts = cents(grossClosingCosts - paidBeforeClosing);
  const credits = cents(adjustments.brokerCredit + adjustments.lenderCredit);
  const cashToBorrower = cents(loan.loanAmount - atClosingCosts + credits - adjustments.existingLoanPayoff);
  // A gross-project-cost recovery measure includes POC fees and is independent of
  // acquisition debt payoff, which changes the wire but not whole-project equity.
  const netProjectRecovery = cents(loan.loanAmount - grossClosingCosts + credits);
  const results = { titlePremium, titleQuoteNeeded, items, loanCosts, otherCosts, grossClosingCosts, paidBeforeClosing,
    atClosingCosts, credits, cashToBorrower, netProjectRecovery, escrowDeposit,
    originationFee: items[0].amount, prepaidInterest: cents(dailyInterest * interestDays),
    dailyInterest, interestDays, monthlyHomeowners, monthlyTaxes, monthlyFlood,
    monthlyEscrow: cents(monthlyHomeowners + monthlyTaxes + monthlyFlood),
    existingLoanPayoff: adjustments.existingLoanPayoff, brokerCredit: adjustments.brokerCredit,
    lenderCredit: adjustments.lenderCredit, netBorrowerCost: cents(grossClosingCosts - credits),
  };
  for (const value of Object.values(results)) if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("Closing values exceed the supported range.");
  return results;
}

export function closingLoanFromDeal(input: { arv: number; refinanceLtv: number; interestRate: number; annualPropertyTaxes: number; annualInsurance: number; closingDate: string }): ClosingLoanInputs {
  if (!Number.isFinite(input.refinanceLtv) || input.refinanceLtv < 0 || input.refinanceLtv > 100) throw new RangeError("Refinance LTV must be between 0 and 100%.");
  return { loanAmount: cents(input.arv * input.refinanceLtv / 100), annualRate: input.interestRate, annualTaxes: input.annualPropertyTaxes, annualInsurance: input.annualInsurance, fundingDate: input.closingDate };
}
