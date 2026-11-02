# New-deal estimates and tax lookup

The four project entries are purchase price, rehab budget, ARV, and projected monthly market rent. Other costs start with editable defaults. Taxes require a matched county rental estimate or an explicit annual override; no tax amount is fabricated from ARV. `src/lib/deals/defaults.ts` supplies both initial state and Clear Inputs. Clear restores the other estimates, clears tax/property inputs and overrides, cancels/ignores pending lookups, and restores payable 2027. Nothing is persisted.

| Item | Default / behavior |
| --- | --- |
| Contingency | 4% of rehab (spreadsheet $2,000 / $50,000), until manually edited; $2,000 before rehab entry |
| Holding costs | $1,500 spreadsheet allowance |
| Loan | 75% LTV, 6.25%, 30 years from reference terms; planning estimates, not current quotes |
| Funding date | 90 calendar days after the page's server-supplied UTC date; editable |
| Homeowners | $970/year from closing document; not a quote for a new property |
| Property taxes | Allen County rent × GRM method for 2026 assessment / payable 2027, or explicit annual override. Current county bill is historical reference only. |
| Management / CapEx | 13% of rent / $100 per month, from spreadsheet |
| Vacancy / maintenance / flood | 0, separately editable. Not a claim that no reserve or flood coverage is needed. Avoid overlapping CapEx. |
| Title premium | $195 unconfirmed reference, editable; never auto-scaled from one observed quote |
| Purchase / refinance charges | Existing itemized source profiles; loan-linked amounts remain dynamic |
| Credits, payoff, extra costs | 0 until supplied; past transaction credits are not projected |

## Property tax model

See [County rental taxes](county-rental-taxes.md) for verified workbook formulas, matching, mixed-component limitations, annual refresh instructions, and tax selection. No automatic ARV fallback remains. The live county bill and projected rental estimate are separate. Only the selected county estimate or manual override is used in financial calculations.
