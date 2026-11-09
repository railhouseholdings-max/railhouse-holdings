# Eby original-appraisal calibration — eby-original-appraisal-2026-04-24-v2

Source: `appraisal and 1007.pdf`, file 1359298, 34 pages, effective/inspected 2026-04-24, signed 2026-04-27. SHA256 `9c83877c34f5ef7e8dc44467001d5f0235afd1a3051ba3d92819ce8bcdb1aa97`. Page numbers below are one-based PDF pages. The privately supplied PDF stays ignored by Git; the extracted valuation-only fixture is `tests/fixtures/arv/eby-appraisal-grid.json`. Verified means checked against this document, not independently checked with MLS/county records.

## Subject (pages 3–4)

2221 Eby Ave, Fort Wayne IN 46802: one-unit single-family Traditional, built 1928, 3 bedrooms, 1 full bathroom, 1,171 sq ft above grade, lot 6,268 sq ft, basement 509 sq ft with **255 sq ft finished** in the grid, one-car detached garage, C3/Q4, AE. Page 3 rounds finished basement to 50%; use the grid's 255 rather than the previous arithmetic inference of 254.5. The as-is appraisal values an already renovated property at $151,000. Renovations include kitchen/bath, flooring, paint, windows, siding, fascia, soffit and gutters. It supports an investor-grade reference finish, not luxury pricing.

## Closed-sale grid (pages 4 and 9)

| Comp | Closed price | Settlement / contract month | Distance | Time | Flood | Lot | GLA | Basement utility | Garage | Net | Adjusted | Weight (p24) |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1823 Brown St | 150000 | 2025-10 / 2025-09 | .34 mi | 2100 | 0 | 0 | 0 | -1800 | 4000 | 4300 | 154300 | 27.20% |
| 1307 W Wildwood Ave | 144995 | 2026-03 / 2026-03 | .92 mi | 290 | -3500 | 2296 | 0 | 2600 | 4000 | 5686 | 150681 | 23.26% |
| 919 Wilt St | 145500 | 2026-04 / 2026-03 | 1.13 mi | 291 | -3500 | 2113 | 0 | 2600 | 0 | 1504 | 147004 | 26.62% |
| 1631 Howell St | 165000 | 2026-04 / 2026-03 | 1.33 mi | 330 | -3500 | 0 | -5900 | 1200 | -4000 | -11870 | 153130 | 22.92% |

All four are reported arms-length, C3/Q4. No separate bedroom adjustment. Comp 3's 81 sq ft difference is unadjusted. Comp 4's $5,900 GLA deduction is the recorded rounded amount, not exactly 169 × $35. Basement amounts represent combined utility and are applied once, not treated as above-grade area or universal per-area rates. Neutral location labels for comps 2–4 do not establish FEMA zone X. Years built are not inferred from reported ages.

Absolute displayed net percentages: 2.9%, 3.9%, 1.0%, 7.2%; gross: 5.3%, 8.7%, 5.8%, 9.0%. Engine net percentages retain direction (comp 4 negative).

## Reconciliation and limitations

Page 24 reports weights based on relative gross adjustments, without the exact weight-derivation formula. Recorded weights produce $151,247.8614. The engine's $100 rounding produces $151,200, $200 above the appraiser's $151,000. Final rounding convention is not stated; do not force an exact match. Independent equal-weight sensitivity produces $151,300. The hoped-for $160,000 is excluded.

`npm run arv -- --eby-regression` uses the production adjustment calculator with the **recorded historical dollar entries**, checks all four adjusted values, and reconciles the disclosed weights. This is a grid arithmetic regression, not independent inference of rates/weights. Exact settlement days are absent; preserve month strings. Full production selection/recency ranking needs exact daily dates; do not invent them to feed these records through selection.

Historical references remain scope-limited: material GLA about $35/sq ft; lot about $0.70/sq ft; half bath $2,500; one garage space $4,000; flood influence $3,500; 2.4% annual movement then. The time entries are consistent with monthly/contract-based increments; the general engine uses supported daily compounded movement and does not claim identical methodology. These are not universal current coefficients.

## Active context and report inconsistencies

Page 9 also has active listings 1818 Hale Ave ($159,900 asking; $148,900 adjusted asking) and 2027 Thompson Ave ($160,000 asking; $157,900 adjusted asking). Page 24 instead shows $160,780 for Thompson, with different net/gross percentages. Preserve both; neither listing receives closed-sale weight. Hale's UAD bath notation 1.1 means one full plus one half bath (canonical 1.5), not 1.1 numeric bathrooms.

Page 4 describes comp 1 as most recent despite later settlement months for comps 2–4. Preserve chronology over that wording. Page 10's 1007 rental schedule is separate evidence, not closed-sale ARV data.

The former `eby-partial-calibration.json` is a superseded snapshot of the user's initial transcription. Never prefer it over the original-document fixture. One appraisal calibrates methodology; it does not train a statistical valuation model.
