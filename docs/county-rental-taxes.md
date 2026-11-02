# Allen County projected rental taxes

The Analyze Deal tax model uses the official [2026 assessment / payable 2027 rental calculator](https://www.allencounty.in.gov/192/Rental-Properties). The source workbook is read directly by `scripts/extract-allen-rentals.py` using Python's ZIP/XML standard library; there is no spreadsheet dependency in the application. No workbook is modified.

## Verified source and formulas

Source file: `Rental_Calculator_2026_202605151031592809.xlsx` (about 50 MB). SHA-256: `1e50b4ed9ae5e1e8a75f9c192f580fdb0a5a9afef60a30090e05b3e9c6dd6874`.

- `2026 Calculator!A5` identifies the 2026 calculator; `B54` explicitly says “26Pay27.” The website's download is also labeled 2026 Pay 2027.
- `D9/D10/D11/D12` look up parcel, address, neighborhood code/name from `lookup sheet` columns E/F/C/D.
- `D36` reads estimated monthly market rent from lookup column AA. `D40` reads the **monthly-rent GRM** from AB. Do not use the older `Rent Range lookup` table's different GRMs.
- `D34 = ROUND(D40*D36,-2)` estimates rental assessed value before excess land/improvements.
- `E42` separately reads lookup column AE (2%-cap income value including adjustments); `G42` reads AF (3%-cap income value). `D44 = E42+G42`.
- `D47 = (E42*0.88*0.02)+(G42*0.03)`. The 0.88 multiplier is **only** applied to the residential component in this 2026 / payable 2027 model.
- Cost-approach 2%/3% values are lookup AC/AD; land/improvement cap-3 values are S/V. `D27` uses the same mixed-component tax formula on the cost approach. These values must not be summed into a second copy of project taxes.
- The workbook's `E42/G42` lookups return saved parcel component values, not formulas that automatically reallocate projected rent. The app replaces the ordinary residential value with projected rent × GRM only when the snapshot's AE equals its rounded AA × AB baseline and there are no identified 3%-cap components. It does not use the saved default output as the projected scenario.

Verified lookup rows:

| Property | Source row | Parcel | Neighborhood | GRM | Saved estimated rent | Saved rounded base/2%-cap value | Rental flag |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 2221 Eby Ave | 22963 | 02-12-10-306-013.000-074 | 471211-074 | 94.57 | $1,000 | $94,600 | No |
| 2115 Laverne Ave | 68494 | 02-08-32-301-012.000-072 | 727601-072 | 84.14 | $1,600 | $134,600 | No |

Projected scenarios: Eby $1,400 × 94.57 → $132,400 nearest $100 → $2,330.24 annual taxes. Laverne $1,700 × 84.14 → $143,000 → $2,516.80. Both have zero AF and no identified cap-3 value. Both are flagged as **not assessed as a rental** in the snapshot; the UI warns that estimating a rental scenario does not change official classification.

## Limits and tax selection

This is the **county workbook's simplified estimate**, not an exact certified bill, district tax-rate calculation, or prediction of a future assessor decision. Projected rent is supplied by the user, not the old saved default rent. Only assessment 2026 / payable 2027 is implemented. The payable year is explicit and independent of the refinance funding date; choosing another year makes the automatic estimate unavailable.

Ordinary supported residential classes: 510–512, 520–522, 530–532, 540–542, 550. A positive GRM and all required component data are required. Missing data, ambiguous matches, mismatched address/parcel IDs, other classes, any 3%-cap income/cost/land/improvement value, or an adjusted AE value differing from the rounded rent baseline result in a visible limitation and **no automatic annual amount**. The compact `otherCap3` safety check is max(S+V, AD), not an additional amount to add to AF. No attempt is made to guess how projected rent reallocates mixed components.

An optional editable annual-tax override takes precedence, including a valid **$0**. Blank means use the county estimate; invalid values never fall through to it. No ARV fallback is provided. Current county taxes remain a separate historical reference from the live county tax service (spring + fall bill, not balance due). Historical lookup failure leaves the current bill blank and never changes the projected estimate.

`selectAnnualTaxes` owns the selected amount. `withSelectedPropertyTaxes` applies it to an input copy; the same amount feeds closing previews, tax escrow, cash flow, closing costs/recovery, explanations, and rating metrics. Missing selection prevents a completed calculation instead of treating it as zero. The source, year, neighborhood, GRM, projected rent, component values and formula are in the existing question-mark help UI.

## Data and deployment

`src/lib/taxes/data/allen-rentals-2026.json` stores about 11 MB of packed lookup-only data for 130,235 rows and a small neighborhood dictionary. It contains parcel/address/ZIP, neighborhood, GRM, rental flag, property class, component checks and source row. It omits reported rent, income/expense information, sales, contacts, other sheets and the original workbook. It is imported exclusively by `rental-snapshot.ts` with a `server-only` boundary. Records and exact-match indexes initialize once per server process. `/api/rental-tax-property` returns only the selected parcel and source metadata; the dataset is not sent to the client or read from a local workbook on requests. Static imports are bundled for Vercel; no production filesystem storage is needed.

Matching normalizes common street suffixes, directions, punctuation, case, whitespace, and parcel separators. A supplied ZIP/state is checked. Address entry should use `Street, City, IN ZIP` or just an exact street. Full 18-digit parcel IDs work with/without separators, and can resolve duplicate addresses. Distinct rows sharing an address or parcel are rejected rather than choosing the workbook's first wildcard match. Address and parcel must agree when both are supplied. Address changes, refresh, Clear and unmount cancel/ignore old requests; lookup results are scoped to their exact query before display. Overrides and the selected payable year survive refresh, rent changes, and address edits. Address edits invalidate prior query-scoped matches without silently changing the tax assumptions. Clear restores automatic mode and payable 2027.

## Annual refresh

1. Download the new official calculator from the county page to a location outside the repository. Keep `*.xlsx` excluded from Git.
2. Read the new calculator's formulas/year labels, lookup headers, GRMs, cap values and excess adjustments. Do not just replace a filename or assume the 0.88 factor continues.
3. Run the extractor for a same-schema 2026 refresh:

   ```sh
   python3 scripts/extract-allen-rentals.py /path/to/Rental_Calculator_2026.xlsx
   ```

   It validates formula cells/year labels/headers, writes only the packed JSON, records the file hash, and checks the two known 2026 lookup records. The script intentionally rejects other annual versions until reviewed. An optional `--output` path permits inspecting a candidate without replacing active data.
4. For a new assessment/payable year, update the extractor's year/formula assertions, target data filename and source metadata only after inspection. Add the year's explicit supported rule to `estimateCountyRentalTaxes`, the snapshot import and the UI's supported year/default. Keep 2026/2027 tests and add the new year's independent examples. Never apply 2026's deduction to another year.
5. Reconcile a residential row, a non-rental snapshot, mixed 2%/3% components, excess adjustments, missing/duplicate matches, and zero overrides. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build -- --webpack`.
6. Verify the new snapshot is absent from `.next/static`, inspect the UI/source help, then deploy the code/data together when authorized. The app will not silently fetch a new workbook at runtime.
