# Google Sheets property feed

## Current architecture

The agent-populated Google Sheet is now the scheduled source of listings **and completed agent analyses**. The server reads it daily at **9 AM America/New_York**, then upserts the existing canonical Supabase property records. No RentCast discovery, property enrichment, ARV searches, or other paid property API calls run during this sync. The app does not invoke a ChatGPT agent or connector; your separate agent continues maintaining the sheet.

Source spreadsheet: `1pwGmqgLpAZ_WWqduYLaVDctTHcY4KiiTQXsyF5QroBw`, tab ID (`gid`) **0**. The client resolves the actual tab title from Google metadata; no tab name is guessed. Google Sheets remains read-only to the app. Supabase remains the app's persistent store and serves the feed when Google is unavailable.

The prior property identity, revision protection, owned-property lifecycle, saved deal scenarios, manual reviews, listing history and run locking are reused. Google Sheet rows update source observations/agent snapshots, **never** your `property_details`, notes, decisions, unit plans, acquired-asset records, or saved financial inputs. Ordinary address abbreviations and ZIP formatting deduplicate against manually analyzed properties through the existing owner + canonical-address unique index. Unit identifiers remain distinct. Incomplete legacy addresses still need manual reconciliation; fuzzy similarity never silently merges homes.

Every full sync reads all source rows, including Sold, Pending, inactive, Pass and Watch recommendations. Old listing dates do not cause source rows to be discarded. Removing a row does **not** delete a property or imply sold/off-market status. A previously sold property can be reactivated when the sheet explicitly changes its availability. Run history and immutable analysis snapshots remain in Supabase.

## Setup

1. Apply the initial workspace migration, then `202611090001_property_feed_scout.sql`, then `202611090002_google_sheet_feed.sql`, then `202611090003_property_feed_views.sql`, then **`202611090004_property_photo_storage.sql`**. Apply only migrations not already installed. It replaces the two existing Scout save/finish RPCs without deleting records or changing their access permissions. It makes imported agent rows visible regardless of their recommendation/status and records Google request counts.
2. In Google Cloud, enable **Google Sheets API**, create a service account, and download its JSON credential. Domain-wide delegation is unnecessary. Share only the source spreadsheet with its `client_email` as **Viewer**. You do not need to make the sheet public. Do not paste the private key into chat or commit it.
3. Configure server-only production variables:
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`: complete JSON credential, including email/private key.
   - `SCOUT_GOOGLE_SHEET_ID`: defaults to the supplied spreadsheet ID above.
   - `SCOUT_GOOGLE_SHEET_GID`: defaults to `0`.
   - Existing `SCOUT_SUPABASE_SECRET_KEY`: Supabase secret/service-role key for unattended owner-scoped database writes.
   - Existing `CRON_SECRET`: random value of at least 32 characters.
   - Existing Supabase URL/publishable key/owner ID, APP_ORIGIN and `RAILHOUSE_DATA_MODE=supabase` remain required.
4. Import controls are hidden from the Properties feed. Existing enabled imports continue automatically. For initial setup, enable the existing owner row in Supabase `scout_settings` (`config.enabled = true`). Inspect `scout_runs` for results, errors and row diagnostics. Owner-authenticated manual imports remain available through POST `/api/scout` with `{"operation":"run"}`.

Read access was unavailable during development: the connector required an unavailable connection identifier and unauthenticated export returned HTTP 401. Column mapping and regressions therefore use the exact header row and three example entries supplied in chat. **Private-sheet end-to-end access remains unverified until the service-account credential and sharing are configured.** No Google sharing settings or production deployment were changed.

## Schedule

`vercel.json` calls `/api/scout` at **13:00 and 14:00 UTC** each day. The endpoint accepts only the invocation during the **09** hour in America/New_York: 13:00 UTC during daylight saving, 14:00 UTC during standard time. A unique daily Eastern key prevents double imports; a database lock also prevents overlap with manual imports. Manual imports are owner-authenticated, same-origin POST requests, deduplicated within a UTC minute.

Legacy Vercel Hobby cron timing may vary within the hour; this is a **9 AM-hour** schedule, not guaranteed exact-minute execution. For strict 09:00 timing, use a timezone-aware production scheduler calling the same protected endpoint with its Bearer cron secret. Both shipped cron expressions are daily. Nothing was remotely enabled during implementation.

[Google service-account authorization](https://developers.google.com/identity/protocols/oauth2/service-account), [Sheets read API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get), [Vercel cron timing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Schema and interpretation

Cards prominently show the source **Date Added** at the top, falling back to the first discovery/creation date only when the sheet date is unavailable. Feed cards sort newest-added first; daily refresh timestamps do not make older entries appear newly added.

Properties display a green **New** badge with white text for seven Eastern calendar days after Date Added, regardless of whether they have been viewed. **Mark as new** saves an owner-scoped `new_marked_at` and restarts that week; imports preserve it. The existing read marker is independent of the New badge. Properties are ordered newest first by their original Added date. Properties older than one calendar month are inside a collapsed **Older properties** section. Sold properties have a red outline and a red-circled Sold badge. Apply `202611090005_feed_presentation.sql` for manual New markers and Eby's January 1, 2026 feed-date override; it does not alter acquisition or appraisal dates.

Optional **Image URL in column BG** (also accepts Photo URL, Listing Photo URL, Main Photo URL) and **Photo Credit** / **Photo Source** columns provide the actual image to archive. The core 58-column schema remains compatible, and BG is column 59. Cell hyperlink targets are supported.

The daily/manual importer downloads the image bytes into the private Supabase Storage bucket **`railhouse-property-photos`**, using the existing `SCOUT_SUPABASE_SECRET_KEY`. Apply the new storage migration to create the private bucket and owner-only read policy before importing. No new API account or key is required. Source-image downloads use a fixed list of known listing-image CDNs, no redirects/cookies/credentials, a 20-second timeout, a 6 MB maximum and JPEG/PNG/WebP/AVIF byte-signature checks. Arbitrary sheet URLs do not become a server-side web proxy. Unsupported hosts or broken images are reported in the stored import run; the property data still imports.

Storage paths use owner + canonical-property hash + **image-content SHA-256**. Uploads do not overwrite existing objects. Repeated imports reuse an already archived source URL; equivalent bytes deduplicate even if the source URL changes. Source URL, credit, saved timestamp, MIME, byte size and checksum remain in listing metadata. New source images retain older archived versions. Blank image cells, listing status changes, unavailable source images and removed sheet rows **never delete a stored image**. A failed replacement download/upload preserves the previous archived image. If there was no previous saved image, the import reports that no permanent copy was saved; it does not pretend success.

Cards load saved files through the owner-authenticated `/api/property-photo` endpoint, using the property ID and optional content hash. The endpoint resolves the property through existing RLS and then fetches its private object using the owner's JWT. It never accepts a raw storage path or arbitrary remote URL. Permanent references do not depend on expiring signed URLs or the original listing remaining available. The browser does not receive the storage secret. The caption identifies archived files as **Saved photo**; lazy loading and broken-image fallback remain.

Images are the source-provided originals; reuse rights are not independently verified. No photo is guessed from Zillow ID or scraped from listing HTML. Storage uses your existing Supabase storage/bandwidth quota. Archive the source URLs once while they are still available by running **Import now** after deployment. Live private-bucket upload/download has mock and RLS coverage but remains unverified with production credentials.


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

The existing ten-minute database run lease exceeds the five-minute function maximum. Partial writes are retry-safe canonical upserts; a failed run never deletes source history or manual data. All rows are reread next run, so retries do not depend on a new-listing checkpoint. No additional app property entities or new runtime packages were required; images use the existing managed Supabase Storage tables.

Run:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run scout -- --offline-demo
npm run test:db
```

The offline demo uses a clearly synthetic sheet fixture and in-memory store with no Google/RentCast/database requests. Unit tests include the user's supplied three example values, currency/percentage/date mapping, Sold vs Watchlist handling, multiline text/hyperlinks, conflicting duplicates, row reorder, missing rows, malformed rows, failed reads, manual-note preservation, and cryptographic validation of the readonly Google assertion. PostgreSQL/PGlite tests run all five real migrations, check canonical legacy analysis links, import visibility for terminal/Pass records, snapshots, persistent read markers across repeated views/imports, run locking and access controls. The development-only PGlite module can be supplied via `PGLITE_MODULE_PATH` if the local node_modules directory is read-only.


## Property Feed and My Properties

`/properties` contains two tabs: **Property Feed** for prospects and **My Properties** (`/properties?tab=mine`) for owned properties. Purchased properties stay visible in My Properties regardless of age. They retain the same canonical ID, photos, shared facts, notes and saved analysis history.

After calculating in Analyze Deal, expand **Record purchase & add to My Properties**, review the actual purchase price and purchase date, and confirm. The app saves the latest analysis, then calls the owner-only `purchase_deal` database function through the existing `/api/deals` endpoint. The function checks the saved deal revision, locks the existing property, and records ownership atomically. Retries preserve the first confirmed purchase; they do not create another property or overwrite recorded actuals. Future sheet updates cannot revert ownership.

Apply migration `202611090006_property_ownership.sql` after the preceding migrations. It adds owner-confirmed purchase metadata, permits owned properties to retain unknown physical facts, and moves the existing 2221 Eby Ave record to owned. It does not infer an actual acquisition date from Eby's January 1 feed date or turn its estimated price into a purchase price.

Ownership and operational performance are separate. A newly purchased property can appear in My Properties before complete actual financial, operating and current-valuation records exist. Its detail page shows the known purchase facts and links to its saved analysis. The existing portfolio calculations continue using complete actual records only; this workflow creates no fictitious lease, debt, appraisal, paid rehab or realized cash flow.

## Recorded actuals and purchased-property edit locks

Migration `202611090007_property_actuals.sql` extends the existing financial, operating, loan and valuation tables to preserve unknown actuals as NULL. All owned properties now count on the dashboard, including incomplete records; a missing component makes the corresponding total unavailable instead of treating it as zero. The dashboard separates target rent from signed lease income and labels target-based cash flow as projected. Recorded debt and valuation dates remain visible on the property page. Owned properties no longer appear in the dashboard's deals-in-review list.

Purchased-property detail pages have a read-only form with **Edit property** at the bottom. **Save & lock property** validates and saves all related records atomically through the owner-only `save_owned_property` function, with an optimistic revision check and append-only actuals history. Cancel restores the loaded values. Analyze Deal inputs and feed notes also start locked for owned properties; analysis edits remain separate projections.

For the Eby source import, use the final Updated CD (June 5 settlement / June 8 disbursement) for financing and closing figures and the supplied final calculator's Actual columns for rehab, holding costs and target rent. Source links, timing qualifications, closing reconciliation and worksheet reserve assumptions are stored on the canonical property in `actuals_evidence`, not in public client configuration. The original acquisition date, lease and realized returns are not inferred. Raw documents and the one-time private import payload are not committed to the repository.
