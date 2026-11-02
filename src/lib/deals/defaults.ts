import type { DealInputs } from "../../domain/models.ts";
import { cents } from "../calculations/closing.ts";

export type DealFormValues = Record<keyof DealInputs, string>;
export const PRIMARY_DEAL_FIELDS = ["purchasePrice", "rehabBudget", "arv", "monthlyRent"] as const;
export const DEAL_ESTIMATES = {
  contingencyPercent: 4, // $2,000 / $50,000 from the spreadsheet.
  contingencyBeforeBudget: 2000,
  holdingCosts: 1500,
  interestRate: 6.25,
  refinanceLtv: 75,
  loanTermYears: 30,
  annualInsurance: 970,
  managementPercent: 13,
  monthlyCapexReserve: 100,
  vacancyPercent: 0,
  maintenancePercent: 0,
  fundingDaysFromToday: 90,
} as const;

export function defaultFundingDate(asOf: string): string {
  const date = new Date(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== asOf) throw new RangeError("Invalid default-estimate date.");
  date.setUTCDate(date.getUTCDate() + DEAL_ESTIMATES.fundingDaysFromToday);
  return date.toISOString().slice(0, 10);
}
export function initialDealFields(asOf: string, input?: DealInputs): DealFormValues {
  const defaults: DealFormValues = {
    purchasePrice: "", rehabBudget: "", arv: "", monthlyRent: "",
    unexpectedConstructionCosts: String(DEAL_ESTIMATES.contingencyBeforeBudget),
    holdingCosts: String(DEAL_ESTIMATES.holdingCosts),
    interestRate: String(DEAL_ESTIMATES.interestRate), refinanceLtv: String(DEAL_ESTIMATES.refinanceLtv),
    loanTermYears: String(DEAL_ESTIMATES.loanTermYears), annualInsurance: String(DEAL_ESTIMATES.annualInsurance),
    annualPropertyTaxes: "", managementPercent: String(DEAL_ESTIMATES.managementPercent),
    monthlyCapexReserve: String(DEAL_ESTIMATES.monthlyCapexReserve), vacancyPercent: "0", maintenancePercent: "0",
    closingDate: defaultFundingDate(asOf), closingCosts: "0", appraisalFee: "675", originationPercent: "1.75",
    taxEscrow: "0", insuranceEscrow: "0",
  };
  if (input) for (const key of Object.keys(defaults) as (keyof DealInputs)[]) defaults[key] = String(input[key]);
  return defaults;
}
export function updateEstimatedFields(fields: DealFormValues, key: keyof DealInputs, value: string, automatic: { contingency: boolean }): DealFormValues {
  const next = { ...fields, [key]: value };
  if (key === "rehabBudget" && automatic.contingency) {
    next.unexpectedConstructionCosts = value.trim() === "" ? String(DEAL_ESTIMATES.contingencyBeforeBudget)
      : String(cents(Number(value) * DEAL_ESTIMATES.contingencyPercent / 100));
  }
  return next;
}
