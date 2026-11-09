# Google Sheets property feed

## Current architecture

The agent-populated Google Sheet is now the scheduled source of listings **and completed agent analyses**. The server reads it daily at **9 AM America/New_York**, then upserts the existing canonical Supabase property records. No RentCast discovery, property enrichment, ARV searches, or other paid property API calls run during this sync. The app does not invoke a ChatGPT agent or connector; your separate agent continues maintaining the sheet.

Source spreadsheet: `1pwGmqgLpAZ_WWqduYLaVDctTHcY4KiiTQXsyF5QroBw`, tab ID (`gid`) **0**. The client resolves the actual tab title from Google metadata; no tab name is guessed. Google Sheets remains read-only to the app. Supabase remains the app's persistent store and serves the feed when Google is unavailable.

The prior property identity, revision protection, owned-property lifecycle, saved deal scenarios, manual reviews, listing history and run locking are reused. Google Sheet rows update source observations/agent snapshots, **never** your `property_details`, notes, decisions, unit plans, acquired-asset records, or saved financial inputs. Ordinary address abbreviations and ZIP formatting deduplicate against manually analyzed properties through the existing owner + canonical-address unique index. Unit identifiers remain distinct. Incomplete legacy addresses still need manual reconciliation; fuzzy similarity never silently merges homes.

Every full sync reads all source rows, including Sold, Pending, inactive, Pass and Watch recommendations. Old listing dates do not cause source rows to be discarded. Removing a row does **not** delete a property or imply sold/off-market status. A previously sold property can be reactivated when the sheet explicitly changes its availability. Run history and immutable analysis snapshots remain in Supabase.

## Setup

1. Apply the initial workspace migration, then `202611090001_property_feed_scout.sql`, then **`202611090002_google_sheet_feed.sql`**. If the first two are already applied, apply only the new Google Sheets migration. It replaces the two existing Scout save/finish RPCs without deleting records or changing their access permissions. It makes imported agent rows visible regardless of their recommendation/status and records Google request counts.
2. In Google Cloud, enable **Google Sheets API**, create a service account, and download its JSON credential. Domain-wide delegation is unnecessary. Share only the source spreadsheet with its `client_email` as **Viewer**. You do not need to make the sheet public. Do not paste the private key into chat or commit it.
3. Configure server-only production variables:
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`: complete JSON credential, including email/private key.
   - `SCOUT_GOOGLE_SHEET_ID`: defaults to the supplied spreadsheet ID above.
   - `SCOUT_GOOGLE_SHEET_GID`: defaults to `0`.
   - Existing `SCOUT_SUPABASE_SECRET_KEY`: Supabase secret/service-role key for unattended owner-scoped database writes.
   - Existing `CRON_SECRET`: random value of at least 32 characters.
   - Existing Supabase URL/publishable key/owner ID, APP_ORIGIN and `RAILHOUSE_DATA_MODE=supabase` remain required.
4. After approved deployment, open **Properties → Import settings**, enable the daily import, save, and click **Import now**. Review Import activity for results, errors and row diagnostics.

Read access was unavailable during development: the connector required an unavailable connection identifier and unauthenticated export returned HTTP 401. Column mapping and regressions therefore use the exact header row and three example entries supplied in chat. **Private-sheet end-to-end access remains unverified until the service-account credential and sharing are configured.** No Google sharing settings or production deployment were changed.

## Schedule

`vercel.json` calls `/api/scout` at **13:00 and 14:00 UTC** each day. The endpoint accepts only the invocation during the **09** hour in America/New_York: 13:00 UTC during daylight saving, 14:00 UTC during standard time. A unique daily Eastern key prevents double imports; a database lock also prevents overlap with manual imports. Manual imports are owner-authenticated, same-origin POST requests, deduplicated within a UTC minute.

Legacy Vercel Hobby cron timing may vary within the hour; this is a **9 AM-hour** schedule, not guaranteed exact-minute execution. For strict 09:00 timing, use a timezone-aware production scheduler calling the same protected endpoint with its Bearer cron secret. Both shipped cron expressions are daily. Nothing was remotely enabled during implementation.

[Google service-account authorization](https://developers.google.com/identity/protocols/oauth2/service-account), [Sheets read API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get), [Vercel cron timing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Schema and interpretation

The header row must be row 1. `src/lib/sheets/import.ts` contains the supplied **58-column schema**, from Date Added through Source Notes. Columns are matched by normalized name rather than position. Unknown named columns and all original text are retained in the attributed snapshot. Header duplication or a missing Address header fails the import rather than guessing. Blank cells stay unavailable. Invalid individual rows make the run partial while other valid properties import.

- Prices/currency and percentages such as `$49,900.00`, `84.47%`, `$153.27`, `11.04%` become proper numerical display metrics. Refinance recovery/ROE stay percentage points; rent efficiency becomes a ratio. No score, gate result or appraisal value is re-derived from these imported outputs.
- Recommendation is the **agent's** supplied recommendation, separately labeled from your app decision. A source Strong Buy is not independently certified by the app; `qualifies` remains false for imported results. The app's own deterministic valuation/deal engines remain available when you explicitly analyze a property.
- Listing Status/Status is separate from Recommendation. `Watchlist` is a workflow label and maps to **Unknown availability**, while the original Watchlist label remains visible. It is never converted to Active from an old narrative. `Sold` stays Sold with its historical analysis. List Price remains the historical asking price, not an inferred closed price.
- The source has no State column. IN is explicitly inferred only for configured Indiana target communities, with a warning. Full addresses that already provide state retain it. City/ZIP come from the row; coordinates stay unavailable. Unrecognized communities need an explicit state in the Address/State field to establish identity.
- Rent Low/Base/High / mo are interpreted as stabilized property-total monthly rents under the user's supplied Scout schema. A multifamily author must total units in the agent/sheet. No per-unit income is automatically multiplied.
- Last Checked is source freshness. Sheet imported is retrieval time; it does not establish a new property verification. Supported source date formats are ISO and M/D/YYYY. Ambiguous relative dates inside comp text are retained as narrative, never turned into invented closing dates.
- Full multiline ARV Comps, ARV Comp Count, Confidence, neighborhood context, rehab scope, investment thesis, key risks, next action, Source Notes, Mashvisor fields and external IDs are displayed under **Agent analysis, comps & source details**. They are attributed source text, not fabricated structured closed comps. For example, a date appearing in Mashvisor Rent stays original text and never becomes a rent estimate.
- Actual HTTPS listing links are read from cell hyperlinks or URL text. No Zillow/Realtor URLs are guessed from IDs. Hyperlink display labels such as "View listing" retain their real link target through the Sheets CellData API. Neither formulas nor cell text are executed by the app.

Identical duplicate rows import once. Conflicting rows for the same normalized address are rejected together with row-number diagnostics, preserving the previous property record. Source IDs derive from sheet/tab + canonical property identity, not row number, so reordering the sheet does not create duplicate properties. Snapshots retain the row location as retrieval provenance; that coordinate can change later as the source sheet is edited.

## Analyze Deal and existing services

Opening an imported property prepopulates supplied purchase/rehab/ARV/rent and financing/operating estimates. Source taxes become an editable **manual estimate override**, not an official tax bill. Missing inputs retain existing calculator defaults; no absent input is filled with an invented sheet value. Recalculating applies the existing app's closing/purchase/tax conventions and can differ from the agent's supplied metrics. Saving creates/updates the app analysis without overwriting the historical imported report.

When a saved manual analysis exists it remains primary; a later sheet import does not overwrite those inputs. Shared current property corrections and unit plans still load across the app. Google Sheets facts carry a Google Sheets source label and user-supplied evidence, not a RentCast label or independent verification.

Existing optional RentCast lookup/ARV features in Analyze Deal are preserved for explicit manual use. `RENTCAST_API_KEY` is **not required by the daily feed import**. There is no automatic paid enrichment from this workflow. No email is sent. Old Scout provider/calculation modules remain available to existing callers and regression tests; the deployed daily endpoint exclusively calls `syncSheetToFeed`.

## Reliability and verification

The client uses readonly Sheets OAuth scope, an RS256 service-account assertion, fixed Google token/API origins, bounded response sizes, no redirects, no credential logging, and a short-lived in-memory token cache. It first reads metadata, then a bounded data range with formatted values and hyperlink targets. It permits at most 200 allocated columns and 5,000 data rows; exceeding supported bounds fails rather than silently truncating. Request timeouts and failed API reads retain all existing records.

The existing ten-minute database run lease exceeds the five-minute function maximum. Partial writes are retry-safe canonical upserts; a failed run never deletes source history or manual data. All rows are reread next run, so retries do not depend on a new-listing checkpoint. No additional database tables or new runtime packages were required.

Run:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run scout -- --offline-demo
npm run test:db
```

The offline demo uses a clearly synthetic sheet fixture and in-memory store with no Google/RentCast/database requests. Unit tests include the user's supplied three example values, currency/percentage/date mapping, Sold vs Watchlist handling, multiline text/hyperlinks, conflicting duplicates, row reorder, missing rows, malformed rows, failed reads, manual-note preservation, and cryptographic validation of the readonly Google assertion. PostgreSQL/PGlite tests run all three real migrations, check canonical legacy analysis links, import visibility for terminal/Pass records, snapshots, run locking and access controls. The development-only PGlite module can be supplied via `PGLITE_MODULE_PATH` if the local node_modules directory is read-only.
