# Methodology

Value the proposed finished real estate, not acquisition economics. Current condition, proposed finish, legal units, above-grade area, basement area and garage remain separate assertions with sources. `null` means unavailable. Property disagreement is retained in `conflicts`; primary supplied assertions are used with warnings, not silently declared correct.

Default proposed finish is C3/Q4: clean modern investor-grade kitchen/baths, flooring, paint/trim, fixtures, functional mechanicals and general presentation. It does not imply luxury, a verified UAD inspection, or unrequested added bedrooms/area. Missing proposed layout uses the current layout provisionally. Do not sum building additions and unit additions twice.

Invoke `estimateARV` with canonical typed records in `src/domain/arv.ts`. Use `runArvEstimate` only when provider retrieval is needed. Adjust closed prices to the proposed subject; rank and normalize up to six useful indications. The likely value is their weighted mean rounded to $100. The range uses weighted 15th/85th observed indications, expanded to full observed min/max at low confidence, and always brackets the likely value. These are support bounds, not statistically calibrated prediction intervals or arbitrary ± percentages.

At least three usable closed sales and subject type/unit/GLA identity are required; otherwise all ARV values are null. The supported `final` status means no tracked provisional assumptions or unresolved adjustments, not a licensed appraisal. `provisional` flags layout assumptions, weak adjustments or conflicts. Investment attractiveness never raises the valuation.

Use multiple input scenarios for alternate renovations; same inputs and date must produce identical numeric results. Apply likely ARV to the existing calculator explicitly. Original comp evidence and result JSON remain exportable; only the chosen ARV uses the existing financial save mechanism.
