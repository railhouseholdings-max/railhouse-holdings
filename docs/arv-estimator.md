# Railhouse ARV estimator

## Repository assessment and integration

Inspected 2026-11-09: Next.js App Router, React 19, TypeScript, Node 24 project convention, npm, Tailwind/global CSS, Node's built-in test runner, Supabase owner-authenticated PostgREST/RPC persistence and Vercel-oriented server environment. Existing integrations are server-side RentCast property/rent lookup, Photon autocomplete and Allen County tax records/snapshot. The existing `DealInputs.arv` is a manual after-repair-value input used by refinance formulas; there was no closed-sale valuation engine.

Integration preserves that financial model, its save RPC and table schema. Existing `GET /api/property-lookup` keeps its property/rent contract; `POST` adds an ARV operation. The existing RentCast adapter and new ARV provider share one request client. The calculator's collapsed ARV panel consumes existing property details, corrections and building-level additions. It imports JSON/CSV comps, optionally discovers live recorded sales, displays evidence and applies **likely ARV only when explicitly requested**. Existing Save deal persists the applied ARV. Full valuation evidence is downloadable JSON, not a new database table. Do not confuse the current portfolio's stored valuations with this proposed-renovation estimate.

The original Eby appraisal is now available locally as `appraisal and 1007.pdf` (ignored by Git). Its four closed-sale grids, page-level sources and weights are captured in `tests/fixtures/arv/eby-appraisal-grid.json`. No local RentCast key was present. No paid provider was called and no deployment was performed.

## Entry points

- `estimateARV(input)` — `src/lib/arv/engine.ts`; pure, deterministic, no network/clock calls.
- `runArvEstimate(input, { live, apiKey, ... })` — service/orchestration; offline by default.
- `ArvDataProvider` — `providers.ts`; fixture provider and RentCast recorded-sale provider.
- `calculatorArvInput(...)` — bridges existing property/rent draft data into canonical subject/proposed records.
- `.agents/skills/railhouse-arv-estimator/SKILL.md` — repository-local Codex skill; references explain policy and calibration without duplicating calculations in prose.

Modules: `normalization.ts`, `selection.ts`, `adjustments.ts`, `weighting.ts`, `reconciliation.ts`, `confidence.ts`, `validation.ts`, `application.ts`, `discovery.ts`, `service.ts`, `providers.ts`, `import.ts`. Types live in `src/domain/arv.ts`. The API uses existing owner-session access checks and same-origin POST validation. No OpenAI API key is needed for deterministic valuation. No AI transaction, condition or dollar adjustment is silently generated.

## Run offline

```sh
npm run arv -- --offline-demo
npm --silent run arv -- --offline-demo --json --output /private/tmp/arv-result.json
npm --silent run arv -- --input input.json --json
npm run arv -- --input input.json --comps-csv permitted-sales.csv
npm run arv -- --eby-regression
```

`tests/fixtures/arv/synthetic-input.json` is an executable complete schema example. Every property and transaction in that demonstration is explicitly **SYNTHETIC**, not an actual sale or a recreated Eby comparable. `eby-appraisal-grid.json` contains the actual documented sale grid; `eby-partial-calibration.json` is a superseded initial-transcription snapshot. The CLI supports human-readable or JSON output; invalid input exits nonzero. `--live` is opt-in and requires a current valuation date and `RENTCAST_API_KEY`; historical searches require supplied historical records.

## Input and output contract

`ArvInput` has:

- `valuationDate`: YYYY-MM-DD; explicit for reproducibility.
- `subject`: canonical `ArvProperty` (all numeric characteristics present as numbers or null), address/ID, property type, units, GLA, lot, basement, condition/quality, style, flood, optional coordinates, sources, field `evidence` map and `conflicts` array.
- `proposed`: optional finished-layout fields. Above-grade GLA and total/finished basement are distinct. C3/Q4 defaults are disclosed assumptions when not supplied. Missing proposed layout uses current values provisionally.
- `comparables`: canonical property records plus `sale`, `distanceMiles`, `competingMarketEvidence`, `conditionAssessment`, optional `manualAdjustments`.
- `settings`: optional sourced adjustment rates, materiality thresholds, historical-Eby scope justification and independent-bedroom evidence.
- `scenarioName`: optional description; supply independent inputs to compare scenarios.

Every source contains provider, recordId, reference, retrieval date, reliability 0–1 and status (`verified`, `provider-reported`, `user-supplied`, `inferred`, `unavailable`). Field metadata does not magically establish legal units or official UAD grades. Record source disagreements in `conflicts` with both values and references.

Result contains original subject, proposed subject, methodology/calibration versions, scenario/date/status, conservative/likely/high numeric values or explicit nulls, confidence score/level/factor breakdown, selected comp records, adjustments, adjusted prices, net/gross percentages, normalized weights and scoring components, exclusions, reconciliation, assumptions, warnings and complete selected-source attribution. `final` means no tracked provisional assumptions, not licensed appraisal certification. Condition statements from photos/remarks remain preliminary.

## Application/API usage

```ts
import { estimateARV } from '@/lib/arv/engine';
const result = estimateARV(input); // same values/settings/date => same numeric result
// Apply result.likelyArv only if non-null and the user chooses it.
```

Browser request (same authenticated workspace and origin):

```ts
const response = await fetch('/api/property-lookup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ operation: 'estimate-arv', live: false, input }),
});
```

Use `live: true` only for permitted paid retrieval. Input limit is 500 KB, maximum 500 supplied comp records. The UI accepts up to 450 KB text/file imports. Route errors are sanitized; provider failure never means no transactions exist. Stale UI results cannot be applied after scenario/property/comparable inputs change. Address changes cancel requests through component cleanup. The current tab retains separate scenarios; each downloaded JSON preserves the versioned evidence. No subscriptions/accounts/deployments are initiated.

## Manual CSV import

For permitted Allen County exports or other authorized data, map columns into this explicit format. It is a canonical import, **not an assertion that COMPS exports these exact column names**.

Required: `id,address,provider,reference,retrievedAt`.

For a usable sale also supply: `propertyType,units,glaSqFt,salePrice,saleDate,transactionStatus,distanceMiles` (or valid coordinates and subject coordinates). `transactionStatus` must be `closed`; absent status is `unknown`, never assumed sold.

Supported optional columns: `bedrooms,bathrooms,lotSqFt,yearBuilt,garageSpaces,basementSqFt,basementFinishedSqFt,condition,quality,floodZone,style,submarket,latitude,longitude,armsLength,conditionAssessment,competingMarketEvidence,reliability`. Blank means unavailable. Use `true`/`false` for armsLength, and `verified`, `preliminary-photo`, `description`, or `unknown` for conditionAssessment. Comma-bearing addresses need CSV quoting. No formulas execute. Imported fields are user-supplied evidence by default, and must retain row/document references. CSV's default source reliability 0.65 is a policy choice, not verification. Use JSON for sourced dollar adjustments and detailed conflicts.

## Selection and adjustments

Start with closed sales within 0.5 mile / 183 days; expand to 1 mile, 1.5 miles only in a competing market, then to 365 days. Select up to six quality-ranked comps from the earliest expansion providing at least four. Minimum three credible sales plus subject type/unit/positive-GLA identity is necessary for numeric ARV. Future/old sales, active/pending asking prices, non-arms-length sales, insufficient transaction evidence, incompatible type/units, subject matches and location outliers are excluded. One property contributes once; price conflicts are retained. Inferred or unavailable closed-sale assertions are not sufficient.

GLA outside 0.5–2× subject and gross adjustments above 40% are screening guardrails, not purported professional standards. Gross above 25% prompts review. With at least three evaluated indications, a price farther from the median than max(35% of median, 3× median absolute deviation) is withheld as an adjusted-price outlier pending market-substitution review. These guardrails are code/version policy and can be improved against real reference appraisals.

### Adjustments

Adjusted price = actual closed price + signed supported adjustments, rounded to cents per entry. Net percentage = net adjustments / actual price; gross percentage = absolute adjustment sum / actual price. Each entry includes both characteristics, evidence, confidence and rationale. Unpriced differences are surfaced, not assigned arbitrary dollars.

Rate schema example (SYNTHETIC, not a real adjustment study):

```json
{
  "value": 35,
  "basis": "current-market",
  "effectiveDate": "2026-04-24",
  "rationale": "SYNTHETIC demonstration only; replace with a documented local market study.",
  "confidence": 0.9,
  "evidence": {
    "provider": "SYNTHETIC test study", "recordId": "test-study",
    "reference": "synthetic-fixture#study", "retrievedAt": "2026-04-24",
    "reliability": 0.9, "status": "verified"
  }
}
```

Current-market rates require confidence and source reliability >=0.5 and non-inferred available evidence. Effective dates after the valuation date are not used; when absent, rate-source retrieval date is the effective-date guard. Historical Eby rates have the appraisal's 2026-04-24 effective date, require an explicit reviewed single-family Fort Wayne scope and must match the documented historical coefficients. They are discounted and cap confidence at Low. They cannot be applied to earlier valuations. The half-bath and one-space garage fallbacks do not extrapolate to larger differences. No historical basement/condition/quality/bedroom rate is invented. Market time compounds a supported annual rate on the original sale price; 2.4% is never a universal current default.

GLA materiality defaults to 75 sq ft (reviewable policy based on the user's historical 60–90 sq ft observation), lot materiality to zero. Basement unfinished area is total minus finished, avoiding double counting finished basement or treating it as GLA. Bedroom premiums require separate independent evidence. Per-comp sourced manual adjustments override that feature's automatic calculation and cannot repeat a feature. Manual adjustments use the same `effectiveDate` (or source retrieval date) as-of guard as rates; unavailable/inferred/very weak evidence does not create a dollar premium.

## Reconciliation and confidence

Comparable weights: location 25%, recency 15%, condition 15%, size 15%, layout 5%, type/units 5%, adjustment magnitude/support 10%, source 10%. At least three comps => no weight above 45%. Strong comp weights are not forced equal.

Likely ARV is the weighted mean rounded to $100. Conservative/high use weighted observed 15th/85th indications; low confidence expands to full observed min/max. Bounds always include likely ARV. There is no arbitrary luxury or optimistic premium. These ranges do not quantify every unknown feature and are not statistical prediction intervals.

Confidence is a policy score, not probability or investment attractiveness. Factor weights: count 15, location 15, recency 10, condition 15, subject completeness/evidence 10, adjustment evidence 15, agreement 10, source 10. Both adjustment confidence and source reliability matter. Empty/unavailable field evidence and missing comparable characteristics are penalized. Provisional layout/photo-description evidence caps at 69; <4 comps or unresolved features at 59; conflicts at 49; all unknown comp conditions at 39; <3 comps at 24 and no numeric ARV. Weak historical adjustment support caps at 59. High >=80, Medium >=60, otherwise Low with sufficient evidence. Under three credible comps => Insufficient Evidence. All components/cap reasons are exposed.

## Provider operation and remaining configuration

Live RentCast queries use documented property records and recorded last-sale fields, not listing/AVM asking comps. Docs: [records](https://developers.rentcast.io/reference/property-records), [schema](https://developers.rentcast.io/reference/property-data-schema), [listings distinction](https://developers.rentcast.io/reference/property-listings). Unknown condition, basement, flood, arms-length status and legal-unit verification remain unknown; they commonly yield provisional Low confidence. Search caps at 50 records per stage, not exhaustive pagination. Up to six actual HTTP requests including retries; 45-second total and 15-second individual deadlines. Retry 429/502/503/504 once for Retry-After <=1 second (or 250 ms default); longer delays are reported without sleeping. No provider keys or addresses appear in usage logs.

`RENTCAST_API_KEY` is server-only. `RENTCAST_ARV_CACHE_SECONDS` defaults to 0; enable instance caching only after confirming account retention/licensing terms (max 3600 seconds, 50 complete results). In-flight identical valuation requests are deduplicated. Existing property-lookup GET caching is unchanged. A serverless instance cache is not guaranteed across deployments or instances.

RentCast integration was **mock-tested only**; the local key is absent. Production credentials/account endpoint access and actual Fort Wayne sale coverage need live verification after authorized deployment. Existing production environment may already have the key, but that was not queried or used here. No OPENAI_API_KEY is needed by this estimator. No ATTOM/RealAI/Zillow/Realtor adapter is added because the app had no such authorized integration and there was no demonstrated need to duplicate RentCast. Allen County's [assessor/COMPS](https://www.allencounty.in.gov/164/Assessor) is supported via permitted manual exports; no approved production viewer API was established and no scraper was built.

Next user inputs: exact settlement dates if full historical selection/ranking regression is needed; permitted closed sales with condition/quality and unit verification for useful valuations; sourced current adjustment studies or explicit limited Eby-scope review; production RentCast access validation. UI input or JSON supports custom scenario rates through the function/API/CLI. Synthetic fixture mode requires none of these credentials.

## Calibration and validation

`npm run arv -- --eby-regression` uses the production adjustment calculator with the **recorded historical dollar entries**, checks all four adjusted values, and reconciles the disclosed weights. This is a grid arithmetic regression, not independent inference of rates/weights. Exact settlement days are absent; preserve month strings. Full production selection/recency ranking needs exact daily dates; do not invent them to feed these records through selection.


The recorded appraiser weights yield $151,247.8614; the engine rounds to $151,200, $200 above the reported $151,000. Equal-weight sensitivity yields $151,300. The exact weight derivation and final appraisal rounding convention are unavailable. See the skill calibration reference for all four grids and source limitations. The raw PDF is private and is not committed. Active Thompson listing figures conflict between pages 9 and 24; neither value contributes to ARV.


Tests cover closed/listed distinctions, normalization, missing facts, adjustment directions and units, basement separation, flood/condition/quality, time adjustments, location/type/unit exclusions, weak adjustment evidence, look-ahead prevention, source conflicts, duplication, outliers, confidence, deterministic ordering/math, weights/bounds, CSV, mock-provider parameters, rate limits and original-document Eby adjustment/reconciliation regression. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; `npm run arv -- --offline-demo` and `--eby-regression`. Skill Creator validation uses its bundled `quick_validate.py` (PyYAML installed in an isolated temporary environment), plus an independent offline skill forward-test. No live financial transactions or provider subscriptions are part of the tests.
