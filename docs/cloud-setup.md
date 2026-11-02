# Local → GitHub → Vercel → Supabase

This preparation does not deploy anything. Keep working in the same VS Code folder. The app runs without accounts in demo mode; private mode needs the following setup. Use a **new** Supabase project for this initial migration; do not apply it blindly to an existing populated database.

## Accounts and choices

Account setup is already confirmed for GitHub user `railhouseholdings-max`; Supabase and Vercel accounts are connected through GitHub. A Supabase project named Railhouse Holdings also exists. A GitHub **repository** still needs to be created. The links below remain useful for signing in or for a fresh setup:

1. [GitHub](https://github.com/signup): source control. Create a **private** repository for the business application.
2. [Supabase](https://supabase.com/dashboard/sign-up): hosted PostgreSQL and owner sign-in.
3. [Vercel](https://vercel.com/signup): hosting; you can sign in with GitHub. Select a plan appropriate for Railhouse's business use and review current plan terms.

No OpenAI account/key, separate PostgreSQL account or service-role key is required. Creating these accounts does not deploy the app. Do not paste passwords, access tokens or API keys into chat, Git files or screenshots.

## 1. Check the local project

Use Node **24** locally and in Vercel. `.nvmrc`, `.node-version` and package engines document that target. If you already use nvm:

```sh
cd "/Users/Andy/my_applications/Railhouse Holdings"
nvm install 24
nvm use 24
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

If nvm is not installed, install Node 24 through your normal Node installation method; do not use sudo npm install. `npm ci` needs registry access and uses package-lock.json. The build uses Webpack consistently. Type checking generates Next route types first, so a clean checkout does not need a prior dev session.

If `npm ci` reports permission errors, the existing `node_modules` was created by a prior root-owned install. From this project folder only, repair that generated directory's ownership, then retry without sudo:

```sh
sudo chown -R "$(id -u):$(id -g)" node_modules
npm ci
```

Open http://localhost:3000. Without configuration it remains demo mode. Existing fictional examples, calculator, fee explanations and county tax lookup stay available. No original workbook is required at runtime.

## 2. Initialize source control and create the repository

The workspace prevented automated `.git` creation. Run this yourself in VS Code's terminal:

```sh
git init -b main
git add .
git status
git diff --cached --stat
```

Review the staged file list. It should include source code, tests, docs, package-lock.json, `.env.example`, migrations and the extracted county reference JSON. It should exclude `.env.local`, other real environment files, `.next`, node_modules, `.vercel`, local DB files, imported CSVs/PDFs and Excel workbooks. `next-env.d.ts` and TypeScript build metadata are generated and ignored. The 11 MB county JSON is intentional server reference data, not personal holdings; the 50 MB workbook is excluded.

On GitHub: click **New repository**, name it `railhouse-holdings`, select **Private**, and leave the README/license/gitignore initialization options off because these files already exist. Click **Create repository**. Copy its HTTPS URL. Then run, using the confirmed repository URL (the example below assumes the repository is named railhouse-holdings):

```sh
git commit -m "Prepare private cloud workspace and persistence"
git remote add origin https://github.com/railhouseholdings-max/railhouse-holdings.git
git push -u origin main
```

If Git asks for a commit identity, set `git config user.name "Railhouse Holdings"` and `git config user.email "YOUR_GITHUB_EMAIL"` in this repository, using a verified address or the no-reply address shown in [GitHub email settings](https://github.com/settings/emails), then retry the commit. Complete GitHub's browser/device sign-in if prompted. GitHub account passwords are not Git HTTPS credentials; use your credential manager/browser flow or an appropriately scoped Git credential. Never put a token in the remote URL. This guide supplies commands; no remote was created or pushed automatically.

## 3. Create Supabase and the owner account

In the [Supabase Dashboard](https://supabase.com/dashboard):

1. Your Railhouse Holdings project already exists. Open it in the Supabase Dashboard. For a fresh setup, create an organization/project named `railhouse-holdings` (or `railhouse-dev` for initial testing). Pick a suitable nearby region. Generate/store its database password in your password manager; the Next app does **not** need this password.
2. Wait for the project to become ready.
3. In **Authentication → Users**, use **Add user / Create new user** to create your own email/password account. Confirm the account using the dashboard's confirmation option or the resulting email workflow. This is the login for the app, separate from your Supabase dashboard login.
4. In Authentication settings, disable public/new-user signup. The app has no signup page; only the configured owner can access data even if another Auth user exists. Keep password/email authentication enabled. Password recovery is initially managed through the dashboard; no custom reset-email or MFA flow is implemented.
5. Copy your Auth user's UUID. This exact value goes in the owner bootstrap SQL and `SUPABASE_OWNER_ID` below.
6. Under project settings/API information, copy the **Project URL** and **publishable key** (`sb_publishable_…`). A legacy `anon` key also works. Do not copy a secret/service-role key for the app; privileged keys are rejected.

For a first private prototype, local and deployed code can use one project. They then read/write the **same data**. Before experiments with real holdings, use a separate development project; apply the same migrations and owner setup there, and point only `.env.local` at it. Never run destructive experiments against production.

## 4. Apply the migration and bootstrap owner access

1. Open `supabase/migrations/202611020001_initial_workspace.sql` in VS Code.
2. Open Supabase **SQL Editor → New query**. Paste the entire migration and click **Run** once.
3. If it errors, stop and fix that error; do not drop existing tables or keep rerunning migrations. It runs in a transaction. If your editor leaves an aborted transaction, run `rollback;` before retrying.
4. In another new SQL query, replace OWNER_UUID with your real Auth UUID and run:

```sql
insert into private.app_owner (singleton, user_id)
values (true, 'OWNER_UUID'::uuid);
```

This configures the **one owner**. Before this row exists, RLS denies all app-user access. Ordinary authenticated users cannot edit this allowlist. If it already has an owner, investigate rather than replacing it automatically.

5. Open `supabase/tests/security.sql`, paste it into a new SQL Editor query and run it in full. It impersonates owner/non-owner/anonymous roles, tests a saved deal, a zero override, stale revisions and rollback of invalid child writes, then rolls all test data back. Success is no SQL errors. These live checks have **not** been run from this workspace because no cloud project or Postgres runtime was provided.

Keep migrations in Git. Future schema changes get a **new migration file**; do not edit/reapply an already-applied migration against real data. This initial dashboard workflow applies files manually. If adopting the Supabase CLI later, first reconcile its migration history with the files already applied.

### Tables and relationships

| Table | Purpose / relationship |
| --- | --- |
| `properties` | Property identity, physical details, acquisition status; parent record |
| `property_financials` | One row/property: acquisition, rehab summary and recorded financial contributions/proceeds |
| `property_operations` | One row/property: ongoing taxes, insurance, management, reserves, other expenses |
| `property_loans` | Many loans/property; at most one current, with optional refi details |
| `property_leases` | Many leases/property; at most one current, no tenant PII added |
| `property_valuations` | Many valuation snapshots/property; at most one current |
| `deals` | Address, review status and typed financial inputs; optional property relationship |
| `deal_adjustments` | One row/deal: purchase/refinance fees, credits, payoffs and payment timing |
| `deal_tax_assumptions` | One row/deal: parcel, year, nullable annual override and one small county-source evidence object |

All user tables have owner-scoped RLS and composite parent/owner foreign keys. Anonymous users have no table or save-function access. The save function is security-invoker and transactional. Derived outputs are recalculated, not saved as an authoritative output blob. The private allowlist helper has a fixed empty search path and restricted execution grants.

The cloud database starts **empty**. Fictional properties/deals are not auto-imported. Save actual analyses through the calculator. The preexisting prototype has no property creation/editor UI; that remains outside this migration. If you import real portfolio records with SQL/Table Editor, populate properties, financials, operations and a current valuation together, plus loan/lease records where applicable, using the owner's UUID on every row. Incomplete data intentionally errors rather than producing zeroed financial metrics. Add a dedicated importer/property editor as a subsequent feature before bulk use.

## 5. Configure local private mode

An ignored `.env.local` has been prepared with your confirmed project URL and demo mode. Open it and fill the missing key and Auth owner UUID. Switch the mode only after the migration, owner bootstrap and security checks are complete. For a fresh checkout, copy `.env.example` first. The private configuration is:

```dotenv
RAILHOUSE_DATA_MODE=supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_OWNER_ID=YOUR_AUTH_USER_UUID
APP_ORIGIN=http://localhost:3000
```

All are server-only variables. No key or password goes in a `NEXT_PUBLIC_` variable. No database password or service-role key is used. Restart `npm run dev` after environment changes. Use **http://localhost:3000** consistently; writes from `127.0.0.1` or another origin are rejected when APP_ORIGIN is localhost.

Visit `/login` and use the Auth email/password from step 3. An unauthorized visitor cannot read your portfolio or use private API routes. Sessions use a verified Supabase access token in an HttpOnly, SameSite cookie; HTTPS cookies are Secure. Sessions intentionally expire within an hour, requiring re-login. No refresh token is saved, and there is no background refresh. Signing in/out never saves passwords in app storage.

Calculate a real analysis, click **Save deal**, go to Dashboard, and reopen it. Verify all inputs, purchase/refinance adjustments, tax year/parcel and zero overrides survive reload. Calculate again and compare outputs. Make an edit, click **Update saved deal**, and reopen again. Two tabs editing the same revision should receive a conflict on the second stale save. If login expires, sign in again in another tab and retry saving; inputs remain in the original tab. Navigating/reloading with unsaved edits still loses those edits, so save first.

To return to fixture-only local exploration, change mode back to `demo` and restart. This does not delete cloud records. Do not delete your original source files/documents. A separate fixture example uses an explicit manual tax override so its historic scenario remains reproducible.

## 6. Prepare and deploy with Vercel (when you choose)

1. Sign in to [Vercel](https://vercel.com/signup), select **Add New → Project**, connect GitHub, and authorize access to your private `railhouse-holdings` repository.
2. Import the repository. Select the **Next.js** preset and repository root. Use **Node.js 24.x**, install command `npm ci`, build command `npm run build`, and the default Next.js output setting. No custom server, container or vercel.json is required.
3. Before enabling private mode, choose your stable production URL/project name (for example `https://railhouse-holdings-YOURTEAM.vercel.app`). Use that exact origin for APP_ORIGIN. If Vercel only assigns it after an initial deployment, first deploy explicit **demo** mode, then configure the private variables and redeploy.
4. Under **Settings → Environment Variables**, add the five variables above for **Production**. Replace APP_ORIGIN with the production HTTPS origin and use the production Supabase project/owner. Do not enable these production credentials for arbitrary Preview deployments. Leave Preview explicitly `RAILHOUSE_DATA_MODE=demo`, or configure a separate test project and matching preview origin.
5. Ensure Supabase **public** schema remains available through the Data API (the default). Keep `private` out of the exposed schemas. Optionally set your app's Site URL in Supabase Auth URL settings to its production origin; this password-only flow does not require a redirect callback route.
6. Click **Deploy** when you decide to go live. This click is a deployment; none has been performed for you. If you changed environment variables on an existing deployment, redeploy for them to take effect.
7. Check the deployed `/login` in an incognito window. Confirm Dashboard is inaccessible until owner sign-in. Run Save → reload → update and verify original tax/fee calculations. Run the rollback-only SQL security test before storing important data. Confirm non-owner Auth accounts are denied as well.
8. Keep local VS Code development in this same repository. Commit/push changes when ready; Vercel's Git integration deploys configured branches automatically after you enable/connect it. Treat pushes to the production branch as releases.

A custom domain/account is optional later. The county snapshot is deployed as server data; the original workbook never needs uploading. For address search, the default Photon endpoint is a low-volume demo service: configure a suitable hosted Photon-compatible `ADDRESS_SEARCH_URL` before broader production use. The county live tax service can be unavailable, and the rental model supports only its documented assessment/payable year; existing manual fallbacks remain explicit.

## 7. What remains to verify before calling private production ready

- Online clean install and dependency audit: registry DNS was unavailable in the agent's shell; no new packages were added. Run `npm ci` and, before production, `npm audit --omit=dev` with registry access. Review findings rather than applying forced upgrades blindly.
- Local production server: the sandbox rejected `next start` socket binding (EPERM). After building locally, run `npm start` (with the dev server stopped or a different port) and verify the pages.
- Execute the migration and `supabase/tests/security.sql` against your actual project. No live SQL engine/credentials were available here, so SQL/RLS execution is unverified until that step succeeds.
- Verify real Supabase password login, owner bootstrap, API permissions, transactional save and reload against your project. Local automated tests use mocked Auth/Data API transports plus actual mapping/calculation functions, not a live database.
- Ensure your chosen Vercel plan fits business use. Session refresh, MFA, password reset screens, property editing/import forms and automated backup management are future work. Review Supabase backup/export availability for your plan before relying on it for important records.

## Official references

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Auth HTTP API](https://supabase.github.io/auth/)
- [Supabase Data API and API keys](https://supabase.com/docs/guides/api/creating-routes), [publishable keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database-function security](https://supabase.com/docs/guides/database/functions)
- [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [environment variables](https://vercel.com/docs/environment-variables)
