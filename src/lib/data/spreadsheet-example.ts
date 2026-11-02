import type { DealInputs } from "@/domain/models";

// Read-only snapshot of the source's values on 2026-10-30, not market defaults.
// D7 supplies the unified rent; F16 supplies the annual property tax.
export const spreadsheetExample: DealInputs = {
  purchasePrice: 165000,
  rehabBudget: 50000,
  unexpectedConstructionCosts: 2000,
  holdingCosts: 1500,
  arv: 260000,
  monthlyRent: 1800,
  interestRate: 6.25,
  refinanceLtv: 75,
  loanTermYears: 30,
  closingCosts: 4000,
  appraisalFee: 675,
  originationPercent: 1.75,
  closingDate: "2026-06-08",
  taxEscrow: 0,
  insuranceEscrow: 0,
  annualPropertyTaxes: 2410,
  annualInsurance: 1000,
  managementPercent: 13,
  monthlyCapexReserve: 100,
  vacancyPercent: 0,
  maintenancePercent: 0,
};
