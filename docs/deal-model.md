# Analyze Deal: source and calculation mapping

Source: [Property Feasibility Calculator, Estimate Calculator](https://docs.google.com/spreadsheets/d/1AbqioKua9vH7aydg4yp3IpXMgZ1eur9af0HbZQksuDc/edit?gid=614623037#gid=614623037). Formulas and effective values were read through the Google Sheets connector on October 30, 2026. The source workbook was not modified. This is a TypeScript implementation, not a live sheet connection; changing the source later does not change the app automatically.

## Inputs and layout

1. **The project:** purchase, rehab, unforeseen construction allowance, total holding costs, and ARV. Address is optional.
2. **The refinance:** LTV, annual rate, term, fixed transaction costs, appraisal, origination, closing date, and explicit escrow deposits.
3. **The rental:** one expected monthly rent, annual property taxes, annual insurance, management rate, and a flat monthly CapEx reserve.
4. **Results:** monthly cash flow, cash left invested, capital recovery, refinance deductions, monthly expenses, and investment checks.

New analyses are blank except for the 30-year term and explicit zero escrow/optional reserve values. The **Load spreadsheet example** button loads the source inputs as a labeled reference scenario. It does not imply recommended market assumptions. Dashboard mock deals retain their own illustrative inputs.

## Formula map

All USD inputs are dollars; percent inputs use 0–100, so a sheet value of 0.75 is entered as 75%. Annual taxes and insurance are divided by 12. Calculations are unrounded; only display rounds.

| Source | App calculation |
| --- | --- |
| B18 = SUM(B13:B16) | Purchase + rehab + holding + unforeseen construction costs |
| B22 × B23 | Gross refinance loan = ARV × LTV |
| F19 | Fully amortizing monthly payment on refinance principal + annual taxes / 12 + annual insurance / 12 |
| B26 × (B22 × B23) | Origination rate × gross refinance loan |
| B27 | Tax escrow deposit + insurance escrow deposit + gross loan × annual interest / 365 × days from closing through month-end, inclusive |
| B30 | Gross loan − fixed costs − origination − closing escrow **− appraisal fee (corrected)** |
| Derived | Cash left in deal = project cost − net refinance proceeds |
| F25 | **Entered management rate** × **unified monthly rent** + monthly CapEx reserve; optional vacancy and maintenance are added only if entered |
| F28 | Monthly mortgage including taxes/insurance + additional monthly costs |
| F31 / B35 | **Unified monthly rent** − total monthly costs |
| B34 | Net refinance proceeds / project cost; target ≥ 85% |
| A36 label, blank B36 | Annual rent / ARV; target strictly > 10%, implemented from the label’s stated definition |
| A37 label, blank B37 | Year-1 stabilized ROE remains uncalculated pending a defined formula |

The monthly mortgage subtotal already includes taxes and insurance; they are not deducted again. Escrow deposits are upfront cash requirements and do not change recurring monthly expenses. Loan amortization handles zero interest explicitly. Date arithmetic uses date-only UTC values to avoid daylight-saving and timezone effects, including leap years. Prepaid interest retains the sheet’s 365-day denominator even in leap years.

## Source inconsistencies and explicit corrections

- D7 is $1,800, while F29 independently contains $1,400. The app uses one rent for income and management. The source example uses D7 ($1,800).
- F25 hard-codes 0.13 and ignores editable F22. The app uses the entered management percentage; the source example is 13%.
- B24 lists a $675 appraisal fee, but B30 never subtracts it. The app deducts the appraisal fee once, separately from fixed closing costs.
- D8 contains $1,435 in taxes but is not referenced by the mortgage formula. The app has one annual tax input; the example uses F16 ($2,410), the value actually used by F19.
- B27 references G16 and G17, which are blank, making their contributions zero. The app replaces these ambiguous references with explicit upfront tax and insurance escrow deposits, defaulting to zero. It does not silently substitute annual taxes or insurance into escrow.
- A36/A37 have descriptions but no result formulas. Only rent efficiency has a clear definition in the label; ROE is left undefined.

These deliberate corrections are described in the page’s calculation notes. The app preserves the sheet’s project/refinance structure rather than treating refinance closing costs as part of B18.

## Reconciliation scenario

Source values: purchase $165,000; rehab $50,000; holding $1,500; contingency $2,000; ARV $260,000; LTV 75%; rate 6.25%; term 30 years; annual taxes $2,410; annual insurance $1,000; fixed closing costs $4,000; appraisal $675; origination 1.75%; closing June 8, 2026 (Sheets serial 46181); blank G16/G17 → zero deposits; management 13%; CapEx $100/month.

| Output | Source effective value | App example |
| --- | ---: | ---: |
| Project cost | $218,500.00 | $218,500.00 |
| Gross refinance loan | $195,000.00 | $195,000.00 |
| Mortgage incl. taxes/insurance | $1,484.82 | $1,484.82 |
| Prepaid interest / closing escrow | $767.98 | $767.98 |
| Additional monthly costs | $334.00 | $334.00 |
| Total monthly costs | $1,818.82 | $1,818.82 |
| Net refinance proceeds | $186,819.52 | $186,144.52 (deducts appraisal) |
| Cash left in deal | Not shown | $32,355.48 |
| Recovery | 85.50% | 85.19% (deducts appraisal) |
| Monthly cash flow | −$418.82 (income $1,400) | −$18.82 (unified income $1,800) |
| Rent efficiency | Blank | 8.31% |

Automated tests compare source effective values with full precision and explicitly reconcile each intentional difference. They also exercise altered management rates, fees, zero-interest/zero-loan cases, leap years, escrow, negative cash remaining, reserve additions, invalid inputs, and check thresholds.

## Limits

Net refinance proceeds are before any acquisition-loan payoff, consistent with the source model. Cash left is a project-capital approximation; there is no separate bridge-loan payoff or debt timeline. Fixed costs must exclude separately entered appraisal, origination, and escrow to prevent double counting. Income tax, disposition costs, lender cash-out restrictions, appreciation, and ROE are not invented. Vacancy/maintenance remain optional app extensions, zero for the workbook example. CapEx may overlap other reserves, so the form advises against counting the same expense twice.
