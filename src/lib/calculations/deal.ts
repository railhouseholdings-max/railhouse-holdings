import type { DealInputs } from "../../domain/models";
import type { ClosingAdjustments } from "../../domain/closing";
import type { PurchaseAdjustments } from "../../domain/purchase";
import { estimatePurchaseCosts } from "./purchase.ts";
import { cents, closingLoanFromDeal, estimateClosingCosts, prepaidInterestDays } from "./closing.ts";
export { prepaidInterestDays } from "./closing.ts";

export const DEFAULT_LOAN_TERM_YEARS = 30;

export function monthlyPayment(principal: number, annualRate: number, termYears: number): number {
  if (
    ![principal, annualRate, termYears].every(Number.isFinite) ||
    principal < 0 || annualRate < 0 || annualRate > 100 ||
    termYears <= 0 || !Number.isInteger(termYears * 12)
  ) {
    throw new RangeError("Enter a valid principal, rate, and term in whole months.");
  }
  if (principal === 0) return 0;
  const months = termYears * 12;
  if (annualRate === 0) return principal / months;
  const rate = annualRate / 1200;
  return principal * rate / -Math.expm1(-months * Math.log1p(rate));
}

/**
 * Based on Estimate Calculator, gid 614623037. See docs/deal-model.md.
 * Deliberate corrections: one rent, editable management rate, appraisal deducted.
 * Workbook mode retains full precision; document mode rounds settlement line items
 * to cents to reproduce the actual closing. Rates use percentage points (0–100).
 */
export function calculateDeal(input: DealInputs, closingAdjustments?: ClosingAdjustments, purchaseAdjustments?: PurchaseAdjustments) {
  for (const [key, value] of Object.entries(input)) {
    if (key === "closingDate") continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`${key} must be a finite, non-negative number.`);
    }
  }
  for (const key of ["interestRate", "refinanceLtv", "originationPercent", "managementPercent", "vacancyPercent", "maintenancePercent"] as const) {
    if (input[key] > 100) throw new RangeError(`${key} must be between 0 and 100.`);
  }
  if (input.managementPercent + input.vacancyPercent + input.maintenancePercent > 100) {
    throw new RangeError("Combined operating reserve percentages cannot exceed 100%.");
  }

  const closing = closingAdjustments ? estimateClosingCosts(closingLoanFromDeal(input), closingAdjustments) : null;
  const interestDays = closing?.interestDays ?? prepaidInterestDays(input.closingDate);
  const purchase = purchaseAdjustments ? estimatePurchaseCosts(input.purchasePrice, purchaseAdjustments) : null;
  const purchaseClosingCosts = purchase?.netClosingCosts ?? 0;
  const totalProjectCost = input.purchasePrice + input.rehabBudget
    + input.holdingCosts + input.unexpectedConstructionCosts + purchaseClosingCosts;
  const refinanceLoanAmount = closing ? cents(input.arv * input.refinanceLtv / 100) : input.arv * input.refinanceLtv / 100;
  const originationFee = closing?.originationFee ?? refinanceLoanAmount * input.originationPercent / 100;
  const prepaidInterest = closing?.prepaidInterest ?? refinanceLoanAmount * input.interestRate / 100 / 365 * interestDays;
  const closingEscrow = closing ? cents(closing.escrowDeposit + prepaidInterest) : input.taxEscrow + input.insuranceEscrow + prepaidInterest;
  const refinanceCosts = closing?.grossClosingCosts ?? input.closingCosts + input.appraisalFee + originationFee + closingEscrow;
  const cashOutProceeds = closing?.cashToBorrower ?? refinanceLoanAmount - refinanceCosts;
  const netProjectRecovery = closing?.netProjectRecovery ?? cashOutProceeds;
  const cashRemainingInDeal = totalProjectCost - netProjectRecovery;

  const payment = monthlyPayment(refinanceLoanAmount, input.interestRate, input.loanTermYears);
  const monthlyPrincipalAndInterest = closing ? cents(payment) : payment;
  const monthlyTaxes = closing?.monthlyTaxes ?? input.annualPropertyTaxes / 12;
  const monthlyInsurance = closing?.monthlyHomeowners ?? input.annualInsurance / 12;
  const monthlyFloodInsurance = closing?.monthlyFlood ?? 0;
  const monthlyMortgagePayment = monthlyPrincipalAndInterest + monthlyTaxes + monthlyInsurance + monthlyFloodInsurance;
  const managementExpense = input.monthlyRent * input.managementPercent / 100;
  const vacancyReserve = input.monthlyRent * input.vacancyPercent / 100;
  const maintenanceReserve = input.monthlyRent * input.maintenancePercent / 100;
  const additionalMonthlyCosts = managementExpense + input.monthlyCapexReserve + vacancyReserve + maintenanceReserve;
  const totalMonthlyCost = monthlyMortgagePayment + additionalMonthlyCosts;
  const monthlyCashFlow = input.monthlyRent - totalMonthlyCost;
  const recoveryPercent = totalProjectCost > 0 ? netProjectRecovery / totalProjectCost * 100 : null;
  // A36 describes this ratio but contains no formula; use the stated definition.
  const rentEfficiencyPercent = input.arv > 0 ? input.monthlyRent * 12 / input.arv * 100 : null;

  const result = {
    purchase, purchaseClosingCosts, closing, netProjectRecovery, monthlyFloodInsurance, totalProjectCost, refinanceLoanAmount, originationFee, interestDays,
    prepaidInterest, closingEscrow, refinanceCosts, cashOutProceeds, cashRemainingInDeal,
    monthlyPrincipalAndInterest, monthlyTaxes, monthlyInsurance, monthlyMortgagePayment,
    managementExpense, vacancyReserve, maintenanceReserve,
    monthlyCapexReserve: input.monthlyCapexReserve, additionalMonthlyCosts,
    totalMonthlyCost, monthlyCashFlow, recoveryPercent, rentEfficiencyPercent,
    checks: {
      recovery: recoveryPercent === null ? null : recoveryPercent >= 85,
      cashFlow: monthlyCashFlow >= 0,
      rentEfficiency: rentEfficiencyPercent === null ? null : rentEfficiencyPercent > 10,
    },
  };
  for (const value of Object.values(result)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("These values exceed the supported calculation range.");
  }
  return result;
}
