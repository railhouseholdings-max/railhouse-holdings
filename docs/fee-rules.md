# Fee dependency audit

The estimator distinguishes a fixed planning charge, a calculated dollar amount, and an amount requiring a deal-specific input or quote. Read-only outputs do not imply that every fee is universally fixed.

| Value | Behavior / dependency |
| --- | --- |
| Purchase protection, settlement, deed/disclosure and e-recording charges | Fixed observed baselines, totaling $314 for the supplied one-parcel cash purchase. They do not grow with price. |
| Appraisal + AMC | Fixed observed $500 + $175 = $675 baseline. |
| Underwriting, credit report, settlement, notary, courier, endorsements, protection/fund/recording charges | Fixed observed service-charge baselines, not loan percentages. |
| Origination rate | Fixed planning assumption of 1.75%. |
| Origination dollar charge | Refinance loan × 1.75%, rounded to cents. |
| Refinance loan | ARV × LTV. Purchase price does not directly set the refinance amount. |
| Mortgage P&I | Loan amount, interest rate, amortization term. |
| Prepaid interest | Loan amount, rate, funding date; rounded daily interest × inclusive days to month-end. |
| Annual homeowners/flood prepaids | The deal's entered annual premiums. |
| Escrow dollar deposits | Rounded monthly taxes/homeowners/flood amounts × the profile's 4/8/3 month assumptions. Dollar amounts recalculate; lender-specific months are not fabricated from price. |
| Monthly taxes and insurance | Entered annual amounts / 12, rounded to cents in document mode. They are not inferred from purchase price. |
| Management, vacancy, maintenance | Entered percentages × monthly rent. |
| Monthly CapEx | Entered flat monthly allowance, not a price or rent percentage. |
| Project cost | Purchase, rehab, holding, contingency, and net purchase closing costs. |
| Cash to borrower | Loan − charges paid at closing + credits − debt payoff. |
| Cash left / recovery | Whole-project cost and refinance recovery, including fees paid beforehand. |
| Lender's title premium | **Quote-dependent**, not a universal fixed fee. Without a quote, $195 is labeled an unconfirmed source reference on $113,250 coverage. A confirmed premium replaces it dollar-for-dollar. |
| Credits, debt payoff, aggregate escrow adjustment, additional quote items | Confirmed deal-specific inputs; not assumed to scale with purchase price or loan amount. |

Changing purchase price alone changes project capital. It must not silently change user-entered ARV, actual annual tax/insurance inputs, rent, or an existing refinance quote. Changing ARV/LTV changes loan-linked figures. Changing rent changes rental economics, not transaction costs.

## Title insurance boundary

Indiana Department of Insurance guidance states that lender coverage is based on the loan amount and premiums use insurers' filed schedules, with potential discounts. The single $195 premium in the source document cannot identify the insurer's complete pricing curve, minimum premium, tiers, eligibility, or discounts. The app therefore does not invent a linear premium percentage or claim $195 is universal.

Primary references:
- https://www.in.gov/idoi/title/shopping-tips/
- https://www.in.gov/idoi/consumers/title-insurance-rate-comparison-tool/

`quotedTitlePremium: null` selects the explicitly unconfirmed document reference. A nonnegative quoted value, including zero, replaces that reference. The input's help text requires the quote to apply to the current deal's loan coverage; users must reconfirm quotes when coverage or insurer changes. Loading the actual source closing sets its known $195 quote.

## Verification

`tests/fee-dependencies.test.ts` varies purchase price, ARV, LTV, rate, term, date, annual taxes, rent, and quoted title premium independently. Existing tests cover annual homeowners/flood changes, reserves, credits, payoffs, and payment timing. Tests ensure relevant outputs change and unrelated fixed charges remain unchanged. Original document totals continue to reconcile.
