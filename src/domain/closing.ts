export interface ClosingAdjustments {
  annualFloodInsurance: number;
  aggregateEscrowAdjustment: number;
  brokerCredit: number;
  lenderCredit: number;
  existingLoanPayoff: number;
  additionalClosingCosts: number;
  quotedTitlePremium: number | null; // null = unconfirmed document reference, not a fixed rate.
  appraisalPaidBeforeClosing: boolean;
  floodPremiumPaidBeforeClosing: boolean;
}
export interface ClosingLineItem {
  id: string;
  label: string;
  category: "loan" | "government" | "prepaid" | "escrow";
  amount: number;
  timing: "atClosing" | "beforeClosing";
  basis: string;
  explanation: string;
}
export interface ClosingLoanInputs {
  loanAmount: number;
  annualRate: number;
  annualTaxes: number;
  annualInsurance: number;
  fundingDate: string;
}
