# Closing-document estimates and reconciliation

Source: the signed closing package supplied by the user, Google Drive file `1N45cwHiy9Dm3W9VhFuJW566Z0DtyFfng`. Inspected October 30, 2026 using the Drive connector and visual review of the ALTA statement (package page 7) and Closing Disclosure (package pages 8–11). The PDF was not modified or stored in this repository. Identity documents, bank details, signatures, and unrelated package contents are not application data.

The document-derived model is now the Analyze Deal default. The earlier spreadsheet model remains available as `calculateDeal(inputs)` for regression comparisons. The application explicitly passes closing adjustments to `calculateDeal(inputs, adjustments)`, which selects the closing-document estimator. Legacy fixed-closing/appraisal/origination/escrow dollar inputs are not rendered or used in document mode.

## What is locked and what varies

The fee profile lives in `src/lib/calculations/closing.ts`. It is read-only in the deal form. Fixed fees reflect one observed closing, not a guaranteed price for another lender, location, or property. In particular, this document does not establish a title-insurance pricing curve. Title insurance is classified as quote-dependent; the $195 reference is not presented as a universally fixed fee. Flat service charges remain observed baselines.

| Item | Rule | Actual closing |
| --- | --- | ---: |
| Origination | Refinance loan × 1.75%, rounded to cents | $1,981.88 |
| Underwriting | Fixed baseline | $1,995.00 |
| Appraisal | Fixed baseline; paid before closing by default | $500.00 |
| Appraisal AMC fee | Fixed baseline; paid before closing by default | $175.00 |
| Credit report | Fixed baseline | $137.00 |
| Lender's title policy | Quote-dependent; $195 is an explicitly unconfirmed reference until a quote is entered | $195.00 |
| ALTA 8.1 environmental endorsement | Fixed baseline | $50.00 |
| ALTA 9 restrictions endorsement | Fixed baseline | $50.00 |
| Settlement / closing agent | Fixed baseline | $550.00 |
| Courier / express delivery | Fixed baseline | $25.00 |
| Notary | Fixed baseline | $175.00 |
| Closing protection letter | Fixed baseline | $50.00 |
| Title insurance enforcement fund | Fixed baseline | $5.00 |
| Mortgage recording | Observed Indiana charge; not a nationwide fee | $55.00 |
| Annual homeowners premium | One year of the entered annual premium, paid at closing | $970.00 |
| Annual flood premium | One year of entered premium; paid before closing by default | $905.00 |
| Prepaid interest | Rounded daily interest × inclusive days from funding through month-end | $445.97 |
| Homeowners escrow | Rounded monthly premium × 8 months | $646.64 |
| Property tax escrow | Rounded monthly taxes × 4 months | $803.36 |
| Flood escrow | Rounded monthly premium × 3 months | $226.26 |
| Aggregate escrow adjustment | Lender-confirmed signed amount; new-deal default $0 | −$604.99 |
| Broker credit | Lender-confirmed amount; new-deal default $0 | $339.75 |
| Lender credit | Lender-confirmed amount; new-deal default $0 | $0.00 |
| Existing debt payoff | Enter known payoff amount; default $0 | $0.00 |
| Additional quoted charges | User input only for items not already listed | $0.00 |

The 1.75% planning rate is inferred from $1,981.88 / $113,250 and agrees with the original spreadsheet. It is not represented as a universally applicable lender contract term. The 8/4/3 escrow periods are observed baseline assumptions, not a computed annual escrow analysis. Actual lender-required months may differ.

Flood coverage is not inferred from an address. The annual flood input starts at zero, and drives all three flood figures: the annual premium, three-month escrow deposit, and monthly operating expense. The profile does not assume an automatic broker credit or aggregate escrow credit for new deals.

## Exact reconciliation

The source loan is $113,250 (75% of $151,000), 6.25%, fixed, 30 years. Signing/settlement was June 5, 2026; funding/disbursement was June 8. Interest uses June 8, not June 5.

- Daily interest: round($113,250 × 6.25% / 365) = $19.39.
- Inclusive days June 8 through June 30: 23.
- Prepaid interest: $19.39 × 23 = $445.97. Multiplying unrounded daily interest would instead yield $446.02 and would not match the document.
- Homeowners monthly: round($970 / 12) = $80.83; 8-month deposit = $646.64.
- Property tax monthly: $200.84; 4-month deposit = $803.36. The reference's editable annual tax input, $2,410.08, is annualized from 12 × $200.84, not a separately verified tax bill.
- Flood monthly: round($905 / 12) = $75.42; 3-month deposit = $226.26.
- Gross initial escrow: $646.64 + $803.36 + $226.26 = $1,676.26; after −$604.99 aggregate adjustment = $1,071.27.
- Loan Costs (CD section D): $5,888.88.
- Recording: $55.00; prepaids: $2,320.97; initial escrow: $1,071.27.
- Other Costs (CD section I): $3,447.24.
- Total borrower closing costs: $9,336.12.
- Paid before closing: $675 appraisal/AMC + $905 flood premium = $1,580.00.
- Costs paid from loan proceeds: $9,336.12 − $1,580 = $7,756.12.
- Broker credit: $339.75; lender credit: $0.
- Cash to borrower: $113,250 − $7,756.12 + $339.75 = **$105,833.63**, matching the CD/ALTA.
- Monthly P&I: $697.30. Monthly escrow: $200.84 + $80.83 + $75.42 = $357.09. Total monthly mortgage including escrow: **$1,054.39**, matching the CD.

The document also lists $339.75 lender-paid loan-originator compensation. It is paid by others and is excluded from borrower costs. The distinct $339.75 broker credit is included once as a credit. Empty/zero points, mortgage insurance, balloon-payment, and other-charge rows do not generate invented fees.

## Cash to borrower versus investment recovery

These are deliberately separate:

1. Actual closing cash = new loan − costs paid at closing + credits − existing loan payoff.
2. Whole-project recovery = new loan − all borrower closing costs + credits.
3. Cash left invested = gross project cost (including net purchase closing charges) − whole-project recovery.

Gross project cost includes acquisition and rehab regardless of initial financing. Acquisition-loan payoff changes the closing wire, but must not be added again to gross project cost. Fees paid before closing are still investment costs; moving a fee between payment-timing buckets must not change cash left invested or recovery percentage. Tests enforce both invariants.

Annual insurance prepayment, initial escrow cash, and recurring monthly insurance are different cash/accounting concepts. The monthly mortgage subtotal already includes taxes and homeowners/flood insurance, so total monthly expenses do not deduct those a second time. Optional vacancy, maintenance, management, and CapEx remain separate operating assumptions.

## Terms that are tracked as context, not current costs

The source loan has no mortgage insurance or balloon payment. It discloses a prepayment penalty as high as $5,663 in the first five years. The UI explains this contingent future exposure but does not deduct it at origination or charge it every month. No future-sale, refinance-date, or penalty forecast is invented. The source APR is not substituted for the 6.25% note rate in amortization.

## UI behavior

The input sequence is Project → Rental → Refinance, placing rent, taxes, and insurance before the closing-cost details. The automatic estimate updates as loan terms, date, taxes, insurance, or adjustments change. Appraisal/AMC, origination rate, flat fees, escrow amounts, and prepaids are outputs, not editable dollar estimates. Confirmed concessions/payoffs and annual flood insurance remain inputs. **Use actual closing loan terms** fills only known loan/property/insurance details and actual adjustments; it does not invent acquisition costs, rehab costs, or rent.

Every calculated/estimated amount in Analyze Deal has a question-mark button. Its dialog explains the formula, current inputs where available, source baseline, rounding, and payment timing. Dialogs support tap/click, Escape, focus return, and background scroll locking. Form inputs that represent user assumptions are identified as inputs rather than being described as calculated estimates.

The original spreadsheet example now uses the new closing profile in the UI and is labeled accordingly. Its old expected totals remain regression tests for spreadsheet mode, not expectations for the expanded document model.

Purchase-statement charges are documented separately in `purchase-cost-model.md`. The application passes both refinance and acquisition adjustments to `calculateDeal(inputs, closingAdjustments, purchaseAdjustments)`; the expanded project-cost total includes acquisition fees without adding them to refinance deductions.

## Fixed-versus-dynamic audit

See `fee-rules.md` for the full dependency table and tests. The confirmed title-policy premium input replaces the source reference instead of adding a second charge. Without a quote, the estimate explicitly flags the reference as unconfirmed.
