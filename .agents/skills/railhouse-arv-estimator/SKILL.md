---
name: railhouse-arv-estimator
description: Estimate after-repair or finished property value, analyze closed comparable sales, compare renovation scenarios, explain an appraisal-style ARV, or improve Railhouse valuation methodology using the repository's deterministic engine. Does not run full BRRRR underwriting unless requested.
---

# Railhouse ARV Estimator

Use the application engine, not arithmetic reconstructed in prose. Start from `docs/arv-estimator.md` for the repository integration and request schema. The authoritative entry point is `estimateARV` in `src/lib/arv/engine.ts`; network orchestration is `runArvEstimate` in `src/lib/arv/service.ts`.

- Establish current subject facts, sources, conflicts, valuation date, and proposed finished layout. Unknown is `null`, never zero. Keep basement separate from above-grade GLA.
- Use supplied closed transactions or authorized provider discovery. Never substitute active/pending asking prices, assessed value, or an AVM as a closed sale.
- Run the engine and report its conservative/likely/high values, status, confidence, adjustments, weights, exclusions, and unresolved evidence. Preserve insufficient-evidence results. Describe condition assessments from photos as preliminary.
- Default finish is C3/Q4 investor grade, not luxury. No added rooms or area without a stated proposed configuration. Validate legal-unit assumptions for conversions.
- Eby is verified against the original appraisal PDF, not training data or a current universal coefficient set. Use its sourced grid regression; preserve month-only dates and report inconsistencies. Do not invent missing settlement days.
- For methodology changes, change the versioned engine and meaningful tests together; verify deterministic output and source traceability. Preserve existing calculator formulas. Do not add providers when the existing RentCast/CSV interfaces suffice.

## Invoke

From the repository root:

```sh
npm --silent run arv -- --input input.json --json
npm run arv -- --input input.json --comps-csv verified-sales.csv
npm --silent run arv -- --offline-demo --json
npm run arv -- --eby-regression
```

`--live` explicitly enables paid RentCast retrieval using the server environment. It requires a current valuation date. Default is offline. Never expose credentials in output. App calls extend `POST /api/property-lookup` with `operation: "estimate-arv"`, an explicit `live` boolean and canonical `input`.

## Read selectively

- [Appraisal methodology](references/appraisal-methodology.md): proposed versus current facts and reconciliation.
- [Comparable selection](references/comparable-selection.md): substitution, expansion, exclusions and deduplication.
- [Adjustments](references/adjustments.md): sign conventions, evidence and historical fallback scope.
- [Eby calibration](references/eby-appraisal-calibration.md): original-document grid, recorded weights and regression limits.
- [Data providers](references/data-providers.md): supported endpoints, manual imports, licensing and live-test status.
- [Confidence scoring](references/confidence-scoring.md): policy score, caps and uncertainty.

This skill does not grant permission to deploy, purchase data subscriptions, publish valuations externally, or initiate investments.
