import type { SavedDealDetails } from "./saved-deal.ts";
// USD amounts are dollars; percentages use 0–100; dates are ISO strings.
// Records remain plain serializable data, independent of React or a database SDK.
export type PropertyStatus = "Rented" | "Rehab" | "Vacant" | "Owned";
export interface Acquisition { purchasePrice: number|null; closingCosts: number|null; initialFinancing: number|null; cashInvested: number|null; acquisitionDate: string|null }
export interface Rehab { originalBudget: number|null; actualCost: number|null; startDate: string | null; completionDate: string | null }
export interface Loan { lender: string; originalAmount: number|null; balance: number|null; balanceAsOf?:string|null; interestRate: number|null; termYears: number|null; monthlyPrincipalAndInterest: number|null; annualTaxes: number|null; annualInsurance: number|null; prepaymentPenalty: string | null; refinance: { date: string; amount: number; costs: number } | null }
export interface Lease { monthlyRent: number; startDate: string | null; endDate: string | null }
export interface RentalOperations { lease: Lease | null; targetMonthlyRent?:number|null; managementPercent: number|null; vacancyPercent: number|null; maintenancePercent: number|null; annualTaxes: number|null; annualInsurance: number|null; monthlyOtherExpenses: number|null }
export interface Valuation { originalArv: number|null; appraisedValue: number | null; currentEstimatedValue: number|null; asOfDate: string|null }
export interface PropertyFinancials { totalCashInvested: number|null; cashLeftInDeal: number|null; realizedCashFlow: number|null; realizedSaleProceeds: number|null }
export interface Property { id: string; address: string; city: string; state: string; zip: string; beds: number|null; baths: number|null; squareFeet: number|null; yearBuilt: number|null; garage: string|null; lotSquareFeet: number|null; propertyType: string|null; status: PropertyStatus; acquisition: Acquisition; rehab: Rehab; loan: Loan | null; operations: RentalOperations; valuation: Valuation; financials: PropertyFinancials; editorValues?:Record<string,string|number|null>; revision?:number; evidence?:Record<string,unknown> }
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
