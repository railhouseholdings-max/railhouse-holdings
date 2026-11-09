# Adjustments

Adjust the comparable toward the subject. A smaller comp receives a positive supported GLA adjustment; a superior comp receives a negative condition adjustment. Each dollar entry retains both characteristics, amount, direction, evidence source, rationale and confidence. Zero differences do not need a dollar adjustment. GLA materiality defaults to 75 sq ft as an explicit policy derived from the user's 60–90 sq ft historical summary; lot materiality defaults to zero. These are reviewable settings, not market facts.

Use `settings.rates[feature]` with `value`, `basis`, `evidence`, `rationale` and `confidence`. Rates are per square foot/garage space/condition or quality grade as appropriate; bathroom rate is per half bath. Condition and quality differences use comp grade number minus proposed subject grade number. MarketTime is an annual percent compounded for elapsed days / 365.25 on the unadjusted closed sale price. External effects require a sourced manual adjustment.

No rate means an unresolved difference, not an invented coefficient. Unresolved features reduce confidence and make results provisional. Bedroom differences receive no separate dollar premium absent `independentBedroomEvidence`; this avoids automatically paying for the same utility already reflected by GLA.

Basement finished area is adjusted separately from unfinished area (total basement minus finished basement); it never increases above-grade GLA. Manual sourced adjustments may replace a feature's automatic adjustment; duplicate manual features are rejected. Net percentage is signed net / actual price, gross percentage is sum of absolute adjustments / actual price.

Historical Eby rates require an explicit `historicalEbyScope` justification and a single-family Fort Wayne subject. A half-bath historical reference is restricted to a half-bath difference; it is not silently extrapolated to multiple full baths. A one-space garage reference is restricted to a one-space difference. Flood fallback applies only to AE versus X. No historical condition, quality, basement or bedroom coefficient was supplied. Historical fallback is always marked and discounted. Do not enable it solely to increase ARV.

Rate evidence must exist as of the valuation date (`effectiveDate`, or retrieval date if absent). Eby effective date is 2026-04-24, so it cannot be used for earlier valuations. Inferred/unavailable manual evidence or confidence/reliability below 0.5 is unresolved rather than applied. Current-market rates require those same support minimums. Historical rates retain their weaker calibration status and cap confidence at Low.

Per-comp manual overrides also require evidence effective as of the valuation date. Their optional `effectiveDate` can identify a genuinely earlier source period; otherwise retrieval date is the guard. The existence of a future study must not create a retrospective premium.
