import type { PurchaseAdjustments, PurchaseCostItem } from "../../domain/purchase.ts";
import { cents } from "./closing.ts";

// Buyer ALTA statement p1, settled 2025-12-19. Separate from refinance fees.
export const PURCHASE_FEE_PROFILE = [
  { id: "purchase-cpl", label: "Purchase closing protection coverage", amount: 25 },
  { id: "purchase-settlement", label: "Purchase settlement / closing fee", amount: 230 },
  { id: "deed-transfer-disclosure", label: "Deed transfer / sales disclosure · 1 parcel", amount: 30 },
  { id: "deed-recording", label: "Deed recording", amount: 25 },
  { id: "electronic-recording", label: "Electronic recording service", amount: 4 },
] as const;
export const DEFAULT_PURCHASE_ADJUSTMENTS: PurchaseAdjustments = { additionalCosts: 0, buyerCredits: 0 };
export const PURCHASE_STATEMENT_REFERENCE = {
  purchasePrice: 80000,
  rehabBudget: 50000,
  acquisitionDate: "2025-12-19",
  buyerStatementTotal: 130314,
};

export function estimatePurchaseCosts(purchasePrice: number, adjustments: PurchaseAdjustments = DEFAULT_PURCHASE_ADJUSTMENTS) {
  for (const [key, value] of Object.entries({ purchasePrice, ...adjustments })) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RangeError(`${key} must be a finite, non-negative amount.`);
  }
  const items: PurchaseCostItem[] = PURCHASE_FEE_PROFILE.map(item => ({
    ...item,
    explanation: `$${item.amount.toFixed(2)} is the observed buyer-paid charge on the December 19, 2025 purchase ALTA statement. It is a fixed planning baseline, not a percentage of purchase price. Different title providers, parcel counts, states, or transactions may have different charges. This is separate from any title or recording fee incurred again at refinance.`,
  }));
  const baselineClosingCosts = cents(items.reduce((total, item) => total + item.amount, 0));
  const grossClosingCosts = cents(baselineClosingCosts + adjustments.additionalCosts);
  const netClosingCosts = cents(grossClosingCosts - adjustments.buyerCredits);
  const acquisitionCost = cents(purchasePrice + netClosingCosts);
  if (acquisitionCost < 0) throw new RangeError("Purchase credits cannot exceed the purchase price plus closing charges.");
  if (![grossClosingCosts, netClosingCosts, acquisitionCost].every(Number.isFinite)) throw new RangeError("Purchase amounts exceed the supported range.");
  return { items, baselineClosingCosts, additionalCosts: adjustments.additionalCosts,
    buyerCredits: adjustments.buyerCredits, grossClosingCosts, netClosingCosts, acquisitionCost,
    explanation: `Fixed buyer fees: $25 closing protection + $230 settlement + $30 deed transfer/sales disclosure + $25 deed recording + $4 electronic recording = $${baselineClosingCosts.toFixed(2)}. Add $${adjustments.additionalCosts.toFixed(2)} in confirmed additional purchase charges and subtract $${adjustments.buyerCredits.toFixed(2)} in buyer/seller credits = $${netClosingCosts.toFixed(2)} net purchase closing costs. This amount enters project cost once. The source's $50,000 estimated rehab belongs in the rehab budget and is not an extra closing fee.`,
  };
}
