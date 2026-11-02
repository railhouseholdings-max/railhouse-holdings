import type { PurchaseAdjustments } from "@/domain/purchase";
import type { estimatePurchaseCosts } from "@/lib/calculations/purchase";
import { money } from "@/lib/format";
import { ExplainedValue } from "./calculation-help";
import { DetailRows } from "./ui";

export function PurchaseCostEstimate({ estimate, adjustments, onChange, onLoadReference }: {
  estimate: ReturnType<typeof estimatePurchaseCosts> | null;
  adjustments: PurchaseAdjustments;
  onChange: (key: keyof PurchaseAdjustments, value: number) => void;
  onLoadReference: () => void;
}) {
  return <div className="purchase-estimate">
    <div className="purchase-summary"><ExplainedValue label="Purchase closing costs" explanation={<p>{estimate?.explanation ?? "The five observed buyer fees total $314. Add confirmed additional purchase charges and subtract buyer/seller credits. Purchase price and rehab remain separate inputs."}</p>} /><strong>{estimate ? money(estimate.netClosingCosts, true) : "—"}</strong></div>
    <details className="purchase-details"><summary>Purchase costs & adjustments <small>Read-only fee baseline · December 2025 statement</small></summary>
      {estimate && <DetailRows rows={estimate.items.map(item => [<ExplainedValue key={item.id} label={item.label} explanation={<p>{item.explanation}</p>} />, money(item.amount, true)])} />}
      <p className="note">These are cash-purchase fees from your buyer’s statement. Purchase-loan charges and other unlisted costs are not assumed. Enter confirmed additional charges below, excluding purchase price and rehab.</p>
      <div className="input-grid">{([
        ["additionalCosts", "Additional purchase charges"],
        ["buyerCredits", "Buyer / seller credits"],
      ] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><div className="input-wrap"><input type="number" inputMode="decimal" step="0.01" min={0} max={1000000000} value={adjustments[key]} onChange={event => onChange(key, Number(event.target.value))} /><span>$</span></div></label>)}</div>
      <button type="button" className="text-link" onClick={onLoadReference}>Use purchase statement amounts →</button>
      <p className="note">Source: $80,000 purchase + $50,000 estimated rehab + $314 fees = $130,314 due from buyer. Rehab is counted once through the rehab budget. The statement does not establish rent, holding costs, contingency, annual taxes, or purchase-loan terms.</p>
    </details>
  </div>;
}
