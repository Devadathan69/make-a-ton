# LoopLedger

Subscription operations for Brightloop Software, built for **Odoo x Make-A-Ton 9.0 Kochi 2026**.

## Start here

The core now includes PostgreSQL repositories/migrations, authenticated customer/staff/admin roles, catalog and subscription APIs, immutable contract snapshots, exact recurring billing, invoice actions/documents, a guarded SMTP outbox, idempotent payments, live reports and isolated demo controls. **This is not yet the finished hackathon submission:** teammate feature interfaces, approved public deployment, real SMTP/scheduler verification and contest delivery gates remain. See [core evidence](docs/CORE_STATUS.md) and [connected deployment setup](docs/DEPLOYMENT.md).

### Run the starter (no accounts or database needed)

Use Node.js **24 LTS** and npm. Node 22.13+ is also supported by the selected tools.

```powershell
git clone https://github.com/Devadathan69/make-a-ton.git
cd make-a-ton
npm ci
Copy-Item .env.example .env.local
npm run dev
```

For macOS/Linux use `cp .env.example .env.local` instead. Open http://localhost:3000. The home route redirects to `/dashboard`.

Default mode is `NEXT_PUBLIC_DATA_MODE=mock`. Fixture CRUD is browser-memory only and resets on reload. Financial reports are fixed examples. In mock mode, billing, lifecycle actions, payments, sending and documents remain intentionally unavailable; use connected mode for implemented server behavior. A visible banner identifies this mode. It is not a secure production app.

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
src/server/                   Auth, repositories, domain services, billing and reports
db/migrations/                Versioned PostgreSQL SQL
scripts/                      Migration and HTTP smoke tooling
```

Money DTOs use integer paise; percentage rates use basis points. Plan fees are once-per-cycle base fees plus product lines. Read the full plan before implementing money/date/state rules.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development |
| `npm run check` | Lint, types, unit tests, production build |
| `npm test` | Contract, financial/calendar and disposable-DB integration tests |
| `npm run build` / `npm start` | Production build/server |
| `npm run smoke` | HTTP liveness, readiness and protected-route smoke (optional local demo login) |
| `npm run db:migrate` | Apply versioned SQL to DATABASE_URL |
| `npm run db:seed` / `db:seed:performance` | Non-destructive loopback demo/test data / 5,000 subscriptions |
| `npm run benchmark` / `qa:browser` | Explicit local performance / Chromium QA evidence |

`SMOKE_BASE_URL` can select a different running server for smoke checks. CI runs checks on main/member branch pushes and PRs.

Verification now includes real PostgreSQL 17 migration/rerun/rollback and connected auth/domain/billing/payment concurrency checks, strict types, lint and HTTP production build. Local Chromium and 5,000-record measurements are recorded in the core status; they do not establish hosted performance or email delivery.

## Optional database setup (Devadathan)

```powershell
docker compose up -d db
# .env.local already contains the local development DATABASE_URL example.
npm run db:migrate
```

The local container uses development-only credentials and a persistent named volume. Managed PostgreSQL works too. Migration checksums protect already applied SQL. No real DB, auth, email, or scheduler is required for feature UI development.

To use the implemented endpoints, set `NEXT_PUBLIC_DATA_MODE=http`, configure the private runtime settings described in docs/DEPLOYMENT.md, migrate PostgreSQL and restart/rebuild. `npm start` runs the standalone build and binds loopback by default (`APP_HOST` controls intentional host binding). HTTP mode never falls back to fixtures. Do not deploy the mock preview as the completed application.

## Submission reminders

The team leader submits the public repository before the portal's 10:00 AM deadline on the applicable round date, selects the problem, adds the actual evaluator as collaborator, follows Discord/timeline announcements, and submits an open-access functional video after coding (maximum 5-6 minutes). Repository setup does not itself complete portal submission or the evaluator invite.

Do not commit `.env.local`, real credentials, user data, build outputs, reference PDFs, or demo recordings.
