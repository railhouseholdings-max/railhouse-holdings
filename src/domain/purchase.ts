export interface PurchaseAdjustments {
  additionalCosts: number;
  buyerCredits: number;
}
export interface PurchaseCostItem {
  id: string;
  label: string;
  amount: number;
  explanation: string;
}
