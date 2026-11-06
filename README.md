# Railhouse Holdings

Cloud preparation is documented in [the project audit](docs/architecture-audit.md) and [the sequential setup guide](docs/cloud-setup.md). Default mode remains a fixture-only local demo. Private mode adds single-owner Supabase sign-in and explicit saved analyses; accounts, owner bootstrap, SQL verification and deployment are manual next steps. No cloud service or remote repository has been created.

Use Node 24. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run dev`. See `.env.example` for demo/private configuration. Do not commit `.env.local` or source financial documents.

The original implementation notes below describe the prototype's calculation/model history. Statements there about “future persistence” or “no authentication” refer to the original demo; the setup guide is authoritative for private mode.


A personal real estate operating workspace for Railhouse Holdings LLC. Next.js App Router, TypeScript, Tailwind CSS, and ESLint. Mobile bottom navigation and a responsive desktop sidebar.

## Local development

Use Node.js 22.18+ (a supported LTS version is recommended) and npm.

```sh
npm install
npm run dev
```

Open http://localhost:3000. The development server binds to your Mac's loopback interface. There is no authentication; do not expose this development workspace publicly with private financial data.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The financial tests use Node's built-in test runner and native TypeScript stripping, with no extra test dependency. After dependencies are installed, commit the generated `package-lock.json` for reproducible installs.

## Important files

- `src/app/`: Dashboard (`/`), Properties (`/properties`), individual property (`/properties/[id]`), Analyze Deal (`/analyze`), Portfolio (`/portfolio`), shared layout, and install manifest metadata.
- `src/domain/models.ts`: Serializable domain interfaces for property, acquisition, rehab, loan/refinance, lease, rental operations, valuation, property financials, and deal analysis. USD amounts are dollars, percentages are 0–100, dates are ISO strings. IDs do not encode storage behavior.
- `src/lib/calculations/deal.ts`: Input validation, project cost, refinance/cash remaining, stable amortization including zero-interest loans, reserves, and estimated monthly cash flow. No UI, network, or AI dependency.
- `src/lib/calculations/portfolio.ts`: Property and portfolio economics. Calculations retain precision; rounding happens only for display.
- `src/lib/data/repository.ts`: Async read boundary for future database queries. Pages consume these functions rather than importing mock records directly.
- `src/lib/data/mock.ts`: Fictional properties and deal examples. These are not actual Railhouse holdings, market guidance, or investment assumptions.
- `src/components/deal-calculator.tsx`: In-memory form and result presentation. Drafts are not persisted and disappear on navigation or refresh. Example deals can be opened from the dashboard.
- `src/app/globals.css`: Tailwind entry point, shared visual tokens, responsive layout, touch targets, safe-area handling, and focus states. Uses system fonts with no remote font dependency.
- `tests/calculations.test.ts`: Financial benchmarks and edge cases.
- `.env.example`: Placeholder guidance. No configuration is required yet.

## Deal model and source spreadsheet

Analyze Deal now follows the supplied [Property Feasibility Calculator](https://docs.google.com/spreadsheets/d/1AbqioKua9vH7aydg4yp3IpXMgZ1eur9af0HbZQksuDc/edit?gid=614623037#gid=614623037). The implementation includes construction contingency, refinance transaction costs, appraisal, origination, month-end prepaid interest, explicit escrow deposits, monthly CapEx, and recovery/cash-flow checks.

See [`docs/deal-model.md`](docs/deal-model.md) for the exact cell mapping, independent source benchmarks, and intentional corrections to duplicated rent/tax inputs, hard-coded management, and the omitted appraisal deduction. The spreadsheet is read-only and is not queried by the running app. The page includes a clearly labeled source example. New analyses prefill editable planning estimates; see [`docs/default-estimates.md`](docs/default-estimates.md).

Portfolio calculations continue to use stored property operations. Portfolio cash-on-cash uses annualized current cash flow divided by cash left invested; zero/negative cash left yields N/A. Estimated total return includes unrealized equity; see the calculation module for its definition.

## Closing-document fee estimates and explanations

Analyze Deal now uses the signed closing package as its fee baseline. See [`docs/closing-cost-model.md`](docs/closing-cost-model.md) for the full charge mapping, exact reconciliation, inferred-rate assumptions, cash-timing treatment, and model limits. This supersedes the earlier spreadsheet-only closing estimate.

- `src/domain/closing.ts`: Closing input, adjustment, and line-item types.
- `src/lib/calculations/closing.ts`: Fixed fee profile, dynamic origination/prepaid/escrow calculations, payment timing, credits, and cash disbursement.
- `src/lib/calculations/deal-explanations.ts`: Explanations with current deal values.
- `src/components/closing-cost-estimate.tsx`: Read-only estimate and itemized charges.
- `src/components/calculation-help.tsx`: Question-mark buttons and accessible explanation dialogs.
- `tests/closing.test.ts`: Exact document totals and investment/accounting invariants.

The closing reference reproduces $9,336.12 total closing costs, $1,580 paid beforehand, $7,756.12 paid at closing, and $105,833.63 cash to borrower. New deals do not assume the source broker credit or aggregate escrow credit. No source PDF, ID scans, bank details, or signatures are stored in the application.

## Purchase closing costs

The separate purchase-statement profile adds $314 of observed acquisition charges to project cost. The $50,000 estimated rehab line populates rehab once; it is not counted as a second closing fee. A compact, collapsible purchase-cost section keeps Rental ahead of Refinance. See [`docs/purchase-cost-model.md`](docs/purchase-cost-model.md) for source mapping and assumptions.

- `src/domain/purchase.ts`: Acquisition adjustments and fee types.
- `src/lib/calculations/purchase.ts`: Fixed purchase baseline and project-cost adjustments.
- `src/components/purchase-cost-estimate.tsx`: Read-only fees, calculation help, and source-value loading.
- `tests/purchase.test.ts`: Source total and no-double-counting regressions.

## Fixed and dynamic fee rules

See [`docs/fee-rules.md`](docs/fee-rules.md) for the audited dependencies. Flat service charges remain read-only baselines; origination dollars, interest, mortgage payments, premiums, escrow, operating reserves, and capital figures recalculate from their relevant inputs. Title insurance is quote-dependent: the $195 document reference is explicitly unconfirmed until replaced with an actual quote. `tests/fee-dependencies.test.ts` checks each changed input without allowing unrelated fees to drift.

## Address live search

The Analyze Deal address field provides US address suggestions after 4 characters and a 500 ms pause. Tap a result, or use Arrow Up/Down and Enter; Escape closes suggestions. Manual entry always works. Requests are cancelled when the query changes, and no address searches are saved or cached by the application. Selecting an address or leaving the address field triggers the supported county tax lookup.

- `src/components/address-autocomplete.tsx`: Accessible combobox, debouncing, cancellation, touch/keyboard selection, loading/empty/error states.
- `src/app/api/addresses/route.ts`: Same-origin server endpoint with input length limits, no-store responses, and generic error handling.
- `src/lib/addresses/search.ts`: Photon provider adapter and normalization into `AddressSuggestion`, independent of the UI.
- `src/domain/address.ts`: Structured suggestion fields for later persistence or provider changes.

Local development defaults to [Photon's public endpoint](https://github.com/komoot/photon#demo-server), which permits reasonable low-volume use without an API key and offers no availability guarantee. Suggestions use OpenStreetMap data; coverage may be incomplete. Search text is sent to Photon to obtain results. Attribution is displayed with suggestions. `ADDRESS_SEARCH_URL` optionally selects a Photon-compatible hosted endpoint, server-side. Use a suitable hosted provider before wider production use; the public demo is a development convenience. No new dependency, API credential, local data store, browser geolocation, or OpenAI integration is needed.

## Excel reconciliation

Native Google Sheets formulas and effective values have been inspected through the connector. If the original Excel workbook is supplied later, inspect its formulas and cached values with Python/openpyxl and reconcile any differences before changing the TypeScript model. Excel files remain git-ignored. No workbook files have been uploaded or persisted by this app.

## Deployment and future integration

The app has no runtime dependency on local files, SQLite, file uploads, or filesystem writes. Mock data is imported as source code. There is no production database, authentication, OpenAI integration, or deployment.

For Supabase/PostgreSQL, replace repository reads with server-side queries and add explicit writes when property editing is implemented. Keep credentials in environment variables on the server; never use `NEXT_PUBLIC_` for a database password, service-role key, or future OpenAI key. Configure the same server variables in Vercel when deployment is authorized. Plain domain types and calculation modules can be retained.

The standard Next.js build requires no custom server and can run on Vercel. Add authentication before storing private data in a publicly accessible deployment.

The app includes standalone display metadata, a manifest, responsive navigation, and iPhone safe-area support. A full PWA rollout (PNG/maskable/Apple touch icons, install testing, service worker and offline policy) remains future work. No offline financial data is cached now.

## Verification environment

Dependencies are now installed locally. The calculation suite, linting, and TypeScript checks can run here. This environment restricts loopback socket access from the terminal: Turbopack builds may fail when spawning its CSS worker. `npm run build -- --webpack` uses the standard alternate Next.js bundler without changing the app architecture. The existing development server runs independently at http://localhost:3000.

### Deal strength visuals

Calculated results include cash-flow, recovery (85% target), and net value-created dials plus a Bad / Good / Excellent planning rating. Debt coverage and cash-on-cash provide context. See [`docs/deal-strength.md`](docs/deal-strength.md) for definitions, initial rating thresholds, and limits.

### Allen County rental tax estimates

Analyze Deal now uses the official 2026 assessment / payable 2027 rental calculator snapshot and projected monthly rent × GRM, replacing the previous forced ARV assumption. Current tax bills remain historical references. An explicit annual-tax override (including zero) wins everywhere. Missing data, other years, mixed cap values and excess adjustments require manual entry. See [`docs/county-rental-taxes.md`](docs/county-rental-taxes.md) for source cells, limits, server-only data and annual refresh steps.

### RentCast address enrichment

Set the server-only `RENTCAST_API_KEY` in the deployment environment. Selecting an address (or leaving a manually entered full address) calls `/api/property-lookup`, which requests RentCast `/v1/properties` and `/v1/avm/rent/long-term` concurrently. The key is sent only in the provider request header, never to the browser. Private-workspace lookup access uses the existing owner session guard.

Available property facts appear in a collapsed-by-default Property details section within Primary Estimates, including size, beds/baths, year built, lot size, features, HOA, and labeled historical sales/tax/assessment figures. Every displayed property value is editable; corrections remain separate from the original provider snapshot and survive lookup retries. Separate planned additions for bedrooms, bathrooms, and living area show proposed totals. Missing current values stay unknown rather than becoming zero. Reset restores provider values and clears additions. Edits and additions are current-tab planning data, included in shared text, and do not automatically rerun the rent AVM or alter ARV, rent, or rehab inputs. Missing fields remain absent. A matching long-term rent estimate fills expected monthly rent only when it is blank or still automatic; manual edits are retained. Changing the address cancels obsolete requests and clears previous automatic rent. RentCast multifamily estimates are per unit and require explicit review before use. Historical sale prices and assessed values never populate purchase price or ARV, and historical taxes do not replace the projected-tax model.

Two provider requests run per uncached full-address lookup; successful complete results are cached for one hour in a bounded server-instance cache, with identical concurrent requests deduplicated. Failures and partial results can be retried. Property details are current-tab lookup data and are included in Share deal; the chosen monthly rent is saved with the normal deal inputs. Tests mock provider responses, including exact-address matching, partial failure, cancellation, missing values, and manual-rent preservation. Live provider verification requires a configured server environment.

Provider references: [property records](https://developers.rentcast.io/reference/property-records), [rent estimates](https://developers.rentcast.io/reference/rent-estimate-long-term), and [property data schema](https://developers.rentcast.io/reference/property-data-schema).

### Multifamily units and concise sharing

Property details supports an editable property type and current unit count. Multifamily properties have separately editable unit rows for unit name, current/proposed status, beds, baths, living area, monthly rent, and planned additions. Provider unit counts up to 12 seed blank rows; building totals are never divided or copied into those unit layouts. Larger or uncounted buildings can be entered incrementally. Add/remove current and proposed units as needed. Combined entered rents can be explicitly copied to the deal rent field once all rents and reported current units are accounted for; RentCast per-unit estimates are applied to reviewed units, rather than directly to whole-property rent.

Share deal now contains only address, property type, purchase price, rehab estimate, whole-property rent estimate, estimated ARV, current layout, unit breakdown, and proposed additions/new units. It uses current edits and flags missing layouts and differences between unit rents and the deal’s rent estimate. It omits mortgage terms, fees, taxes, ratings, cash-flow/recovery metrics, and target purchase price. Property and unit drafts remain in the current tab and are shared as text; they are not saved with the financial deal record.
