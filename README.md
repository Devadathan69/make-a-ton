# LoopLedger

Subscription operations for Brightloop Software, built for **Odoo x Make-A-Ton 9.0 Kochi 2026**.

## Start here

This is a **working development starter**, not the finished hackathon submission. It includes a responsive app shell, ten fixture-backed feature screens, stable typed mock/HTTP adapters, a PostgreSQL foundation migration, tests, and CI. Authentication, domain endpoints, billing, real payments, invoice documents/email, reports, and deployment remain implementation work.

### Run the starter (no accounts or database needed)

Use Node.js **24 LTS** and npm. Node 22.12+ is also supported by the selected tools.

```powershell
git clone https://github.com/Devadathan69/make-a-ton.git
cd make-a-ton
npm ci
Copy-Item .env.example .env.local
npm run dev
```

For macOS/Linux use `cp .env.example .env.local` instead. Open http://localhost:3000. The home route redirects to `/dashboard`.

Default mode is `NEXT_PUBLIC_DATA_MODE=mock`. Fixture CRUD is browser-memory only and resets on reload. Financial reports are fixed examples. Billing, lifecycle actions, payments, sending, and documents are intentionally unavailable until the backend is implemented. A visible banner identifies this mode. It is not a secure production app.

## Five implementation documents

| Document | Assignment | Branch |
| --- | --- | --- |
| [Full implementation plan](docs/IMPLEMENTATION_PLAN.md) | Scope, rules, ownership, contracts, calculations, integration, acceptance, demo | All members |
| [Devadathan](docs/DEVADATHAN.md) | All complex backend, authentication, billing, data, concurrency, deployment, integration | `feat/devadathan-core` |
| [Athul](docs/ATHUL.md) | Product/variant, plan, tax/discount UI | `feat/athul-catalog` |
| [Hannath](docs/HANNATH.md) | Customer, template/quote, subscription, portal UI | `feat/hannath-subscriptions` |
| [Adrinath](docs/ADRINATH.md) | Dashboard, invoice, payment UI | `feat/adrinath-finance` |

Give an agent the full plan plus its member document and `AGENTS.md`. The three feature assignments are independent: each has separate files and works against the same existing adapter without waiting for other branches. Keep existing component export names.

## Contribution workflow

1. Set your own Git name/email linked to your GitHub account.
2. Fetch latest main and create your assigned branch from it.
3. Work only in your documented ownership paths.
4. After **every feature**, run checks, commit with a descriptive message, push your branch, and open/update a PR to **main**. Leave it open for Devadathan's review.
5. Push at least **once per hour** while working. Incomplete checkpoints should be explicit draft PRs.
6. Devadathan reviews and merges passing increments throughout each hour, preserving members' commit attribution. Main must hold the latest integrated code, not just stale bootstrap files.
7. After a PR merges, merge `origin/main` back into your member branch before the next feature and open the next PR when ready. Do not force-push main.

Exact commands and feature-by-feature acceptance criteria are in each member document. Branch names are prescribed; members create them when they start. Initial code is on main.

## Project layout

```text
docs/                         Five implementation documents
src/app/                      Fixed route wrappers; Devadathan owns routing/auth/API
src/components/               Shared shell and UI primitives
src/features/catalog/         Athul
src/features/subscriptions/   Hannath
src/features/portal/          Hannath
src/features/finance/         Adrinath
src/lib/contracts.ts          Shared DTOs and API interface
src/lib/api/                  Mock and HTTP adapters
src/server/                   Backend foundation; Devadathan
db/migrations/                Versioned PostgreSQL SQL
scripts/                      Migration and HTTP smoke tooling
```

Money DTOs use integer paise; percentage rates use basis points. Plan fees are once-per-cycle base fees plus product lines. Read the full plan before implementing money/date/state rules.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development |
| `npm run check` | Lint, types, unit tests, production build |
| `npm test` | Focused contract/money helper tests |
| `npm run build` / `npm start` | Production build/server |
| `npm run smoke` | Check all starter routes against running localhost:3000 |
| `npm run db:migrate` | Apply versioned SQL to DATABASE_URL |

`SMOKE_BASE_URL` can select a different running server for smoke checks. CI runs checks on main/member branch pushes and PRs.

Bootstrap verification: lint/types/build and 11 tests pass; all ten feature screens were rendered in a browser, the mobile dashboard was checked, and all 12 smoke routes responded. Foundation SQL executed successfully in an embedded PostgreSQL engine (23 tables); the real PostgreSQL migration runner and backend integrations still require Devadathan's environment/tests. The runtime dependency audit is clean; npm currently reports moderate advisories in the development lint toolchain, which should be revisited with compatible upstream updates.

## Optional database setup (Devadathan)

```powershell
docker compose up -d db
# .env.local already contains the local development DATABASE_URL example.
npm run db:migrate
```

The local container uses development-only credentials and a persistent named volume. Managed PostgreSQL works too. Migration checksums protect already applied SQL. No real DB, auth, email, or scheduler is required for feature UI development.

To use real endpoints later, implement `/api/v1` as documented, set `NEXT_PUBLIC_DATA_MODE=http`, configure server secrets, and restart/rebuild. HTTP mode never falls back to fixtures. Do not deploy the mock preview as the completed application.

## Submission reminders

The team leader submits the public repository before the portal's 10:00 AM deadline on the applicable round date, selects the problem, adds the actual evaluator as collaborator, follows Discord/timeline announcements, and submits an open-access functional video after coding (maximum 5-6 minutes). Repository setup does not itself complete portal submission or the evaluator invite.

Do not commit `.env.local`, real credentials, user data, build outputs, reference PDFs, or demo recordings.
