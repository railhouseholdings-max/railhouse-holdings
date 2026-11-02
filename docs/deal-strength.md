# Deal strength visuals

`src/lib/calculations/deal-strength.ts` computes deterministic planning metrics and the overall rating. `src/components/deal-strength.tsx` renders responsive SVG half-circle dials with a red–amber–green gradient, actual values, explicit status text, target ticks, accessible image labels, and tap-to-open explanations. No dependency or AI is added. Narrow result columns use stacked dial rows.

These are initial product planning rules, not externally sourced market benchmarks, investment advice, or lender underwriting criteria. All thresholds live in `STRENGTH_RULES` and are visible under “How the rating works.”

- Cash flow: the existing monthly cash flow after debt service and entered costs/reserves. Negative < $0; neutral $0–$50 inclusive; positive > $50. Dial −$500 to +$500 with a $0 tick.
- Cash recovery: existing whole-project net refinance recovery / total project cost. Target >=85%. Dial 0–120% with an 85% tick. This is before acquisition-debt payoff, not the actual closing wire.
- Value created: (ARV − total project cost) / total project cost ×100. Costs include purchase, rehab, contingency, holding, and net purchase fees; refinance costs are separate. This is projected net value, not gross purchase-to-ARV appreciation or proof of causation by rehab. Dial −20% to +40% with a 0% break-even tick; dollar value also shown.

The actual labels retain values outside each dial's scale; only the needles clamp. Undefined percentages have no needle.

Overall rating:

- Bad: any negative cash flow, recovery below 85%, or negative value created.
- Good: nonnegative cash flow and value created, and >=85% recovery.
- Excellent: all of >=$250/month cash flow, >=100% recovery, and >=20% value created.
- Not rated: missing positive project cost, ARV, or rent, or undefined recovery.

Supporting metrics do not affect the rating:

- Debt coverage = monthly NOI / P&I. NOI is cash flow + P&I + CapEx (excludes capital replacements, includes entered operating costs and vacancy/maintenance reserves). No debt service => N/A. No lender eligibility claim.
- Cash-on-cash = annualized monthly cash flow / positive modeled cash remaining. Zero/negative cash left => N/A, not an infinite return.

`tests/deal-strength.test.ts` covers all rating boundaries and gates, zero denominators, full/excess capital recovery, NOI/CapEx treatment, and needle clamping. Existing detailed financial breakdowns remain below the visuals.
