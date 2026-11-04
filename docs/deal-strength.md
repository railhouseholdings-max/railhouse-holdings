# Deal strength visuals

`src/lib/calculations/deal-strength.ts` computes deterministic planning metrics and the overall rating. `src/components/deal-strength.tsx` renders responsive SVG half-circle dials with a red–amber–green gradient, actual values, explicit status text, target ticks, accessible image labels, and tap-to-open explanations. No dependency or AI is added. Narrow result columns use stacked dial rows.

These are initial product planning rules, not externally sourced market benchmarks, investment advice, or lender underwriting criteria. All thresholds live in `STRENGTH_RULES` and are visible under “How the rating works.”

- Cash flow: the existing monthly cash flow after debt service and entered costs/reserves. Negative < $0; neutral $0–$50 inclusive; positive > $50. Dial −$500 to +$500 with a $0 tick.
- Cash recovery: existing whole-project net refinance recovery / total project cost. Target >=85%. Dial 0–120% with an 85% tick. This is before acquisition-debt payoff, not the actual closing wire.
- Value created: (ARV − total project cost) / total project cost ×100. Costs include purchase, rehab, contingency, holding, and net purchase fees; refinance costs are separate. This is projected net value, not gross purchase-to-ARV appreciation or proof of causation by rehab. Dial −20% to +40% with a 0% break-even tick; dollar value also shown.

The actual labels retain values outside each dial's scale; only the needles clamp. Undefined percentages have no needle.

Overall rating:

- Bad: negative cash flow or negative value created.
- Moderate: nonnegative cash flow and value created, with recovery below 85%. Lower recovery alone does not make a deal Bad.
- Good: nonnegative cash flow and value created, and >=85% recovery.
- Excellent: all of >=$250/month cash flow, >=100% recovery, and >=20% value created.
- Not rated: missing positive project cost, ARV, or rent, or undefined recovery.

Supporting metrics do not affect the rating:

- Debt coverage = monthly NOI / P&I. NOI is cash flow + P&I + CapEx (excludes capital replacements, includes entered operating costs and vacancy/maintenance reserves). No debt service => N/A. No lender eligibility claim.
- Cash-on-cash = annualized monthly cash flow / positive modeled cash remaining. Zero/negative cash left => N/A, not an infinite return.

`tests/deal-strength.test.ts` covers all rating boundaries and gates, zero denominators, full/excess capital recovery, NOI/CapEx treatment, and needle clamping. The calculated page reads in three labeled sections: deal metrics and the price explorer, primary inputs, then derived values and assumptions. Supporting metrics and detailed financial breakdowns live in the third section.

## Purchase-price explorer

After calculation, a vertical slider on the left and a numeric price field share the primary purchase-price state. The deal dials sit alongside the slider, with compact rows on mobile. Slide up to increase price and down to lower it. Changes recalculate the dials and breakdowns immediately. The gold tick and “Use target” button identify the highest whole-dollar purchase price meeting the Good thresholds, holding other inputs fixed.

The target limits total project cost to the lesser of ARV and net whole-project refinance recovery / 0.85, then subtracts all non-purchase project costs (including net purchase fees). Negative monthly cash flow, nonpositive recovery, or infeasible fixed costs produce “No price-only solution.” The target is rounded down to a whole dollar. It uses the current modeled fees and assumptions, not a market valuation.

Purchase-price changes do not change monthly cash flow because the refinance is sized from ARV. They change capital recovery, cash remaining, value created, and cash-on-cash return. `tests/target-purchase-price.test.ts` verifies the boundary through the actual deal calculation and rating functions.
