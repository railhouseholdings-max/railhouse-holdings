# Purchase closing costs

Source: Google Drive file `1_5aRlUT45rHNPqHTRheY8ueK_WniHcYz` (`278027.pdf`), visually inspected October 30, 2026. Page 1 is the buyer ALTA final settlement statement, settled/disbursed December 19, 2025. The scanned fee table was read visually because connector text extraction did not capture it. The original PDF is not modified or stored in the application.

## Verified charges

| Buyer debit | Amount | Estimator treatment |
| --- | ---: | --- |
| Sale price | $80,000.00 | Purchase price input |
| Closing protection coverage | $25.00 | Read-only purchase fee baseline |
| Settlement/closing fee | $230.00 | Read-only purchase fee baseline |
| Electronic deed transfer / sales disclosure, full consideration, 1 parcel | $30.00 | Read-only one-parcel baseline |
| Electronic deed recording fee | $25.00 | Read-only purchase fee baseline |
| Title electronic recording service | $4.00 | Read-only purchase fee baseline |
| Estimated rehab costs payable to the construction provider | $50,000.00 | Rehab budget input, never an extra closing fee |
| Buyer credits shown | $0.00 | No source credit assumed for other deals |
| Due from buyer | **$130,314.00** | $80,000 + $50,000 + $314 |

The five transaction charges sum to **$314.00**. This one cash-purchase statement does not establish a percentage-based fee schedule, purchase-loan charges, annual taxes/insurance, market rent, holding costs, or a contingency allowance. The $50,000 is labeled estimated rehab and is not presented as independently verified final rehab spending.

## Model

- Baseline purchase closing charges = $25 + $230 + $30 + $25 + $4.
- Gross purchase closing charges = baseline + additional confirmed purchase charges.
- Net purchase closing costs = gross charges − confirmed buyer/seller credits.
- Total project cost = purchase price + rehab budget + holding costs + contingency + net purchase closing costs.
- Cash left and capital recovery now use the expanded project-cost total.
- Refinance fees continue to be calculated at the refinance stage. Purchase fees do not alter the refinance quote, wire proceeds, or monthly rental cash flow.

Purchase and refinance title/recording fees are distinct charges incurred at different transactions. Counting each once is intentional. The $50,000 rehab line must not be added again to the purchase-fee profile; it is already counted in the rehab budget. Additional quoted purchase charges must exclude purchase price and rehab.

## UI

A compact Purchase closing costs summary appears under the project inputs. Itemized fees and editable additional charges/credits sit inside a collapsed section, preserving Project → Rental → Refinance ordering. Fees retain the compact question-mark explanations, including the live calculation using additional charges and credits.

**Use purchase statement amounts** populates $80,000 purchase and $50,000 rehab, resets acquisition adjustments to the statement's zero values, and fills the property address. It does not invent the remaining project/rental assumptions. The acquisition date is retained in the reference data, not substituted for the refinance funding date.

## Verification

`tests/purchase.test.ts` reconciles the five charges and $130,314 source total, checks that rehab is counted once, verifies effects on project capital without changing refinance or monthly costs, confirms no unsupported purchase-price scaling, and rejects invalid/negative amounts. The combined source-purchase/refinance test uses explicitly zero holding/contingency to isolate the documented costs; those zero values are test assumptions, not source facts or defaults in the UI.

Relevant code: `src/domain/purchase.ts`, `src/lib/calculations/purchase.ts`, `src/components/purchase-cost-estimate.tsx`. The app passes purchase adjustments as the third argument to `calculateDeal`; regression calls without this argument preserve the earlier spreadsheet/refinance-only benchmark behavior.
