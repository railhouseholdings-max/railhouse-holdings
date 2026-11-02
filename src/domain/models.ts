import type { SavedDealDetails } from "./saved-deal.ts";
// USD amounts are dollars; percentages use 0–100; dates are ISO strings.
// Records remain plain serializable data, independent of React or a database SDK.
export type PropertyStatus = "Rented" | "Rehab" | "Vacant";
export interface Acquisition { purchasePrice: number; closingCosts: number; initialFinancing: number; cashInvested: number; acquisitionDate: string }
export interface Rehab { originalBudget: number; actualCost: number; startDate: string | null; completionDate: string | null }
export interface Loan { lender: string; originalAmount: number; balance: number; interestRate: number; termYears: number; monthlyPrincipalAndInterest: number; annualTaxes: number; annualInsurance: number; prepaymentPenalty: string | null; refinance: { date: string; amount: number; costs: number } | null }
export interface Lease { monthlyRent: number; startDate: string | null; endDate: string | null }
export interface RentalOperations { lease: Lease | null; managementPercent: number; vacancyPercent: number; maintenancePercent: number; annualTaxes: number; annualInsurance: number; monthlyOtherExpenses: number }
export interface Valuation { originalArv: number; appraisedValue: number | null; currentEstimatedValue: number; asOfDate: string }
export interface PropertyFinancials { totalCashInvested: number; cashLeftInDeal: number; realizedCashFlow: number; realizedSaleProceeds: number }
export interface Property { id: string; address: string; city: string; state: string; zip: string; beds: number; baths: number; squareFeet: number; yearBuilt: number; garage: string; lotSquareFeet: number; propertyType: string; status: PropertyStatus; acquisition: Acquisition; rehab: Rehab; loan: Loan | null; operations: RentalOperations; valuation: Valuation; financials: PropertyFinancials }
export interface DealInputs {
  purchasePrice: number;
  rehabBudget: number;
  unexpectedConstructionCosts: number;
  holdingCosts: number;
  arv: number;
  monthlyRent: number;
  interestRate: number;
  refinanceLtv: number;
  loanTermYears: number;
  closingCosts: number; // Fixed refinance transaction costs; not project costs.
  appraisalFee: number;
  originationPercent: number;
  closingDate: string; // YYYY-MM-DD, inclusive prepaid interest through month-end.
  taxEscrow: number; // Upfront dollar deposit, separate from annual operating tax.
  insuranceEscrow: number; // Upfront dollar deposit.
  annualPropertyTaxes: number;
  annualInsurance: number;
  managementPercent: number;
  monthlyCapexReserve: number;
  vacancyPercent: number; // Optional app extension, zero for spreadsheet comparison.
  maintenancePercent: number; // Optional app extension, zero for spreadsheet comparison.
}
export interface DealAnalysis extends SavedDealDetails { id: string; address: string; status: "Reviewing" | "Researching"; updatedAt: string; inputs: DealInputs }
