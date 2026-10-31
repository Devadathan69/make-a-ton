# Core platform evidence

Branch: `feat/devadathan-core`. No teammate-owned files changed.

## D1 foundation

- PostgreSQL 17 disposable container, bound only to loopback port 55432.
- Ordered migrations retain checksums, reruns skip applied files, migration errors roll back.
- Transaction helper, parameterized user lookup, explicit public user allowlist, checked BIGINT mapping, bounded pagination, valid date-only and snapshot validators.
- Non-destructive deterministic fictitious seed includes admin/staff/two customer users, catalog, template, active subscription, issued invoice, partial payment and redemption. Reruns preserve existing records/passwords.
- Separate `npm run db:seed:performance` adds 5,000 subscriptions. Requires a loopback database whose name contains demo/test, `ENABLE_DEMO_SEED=true`, and a compliant `DEMO_PASSWORD` supplied privately through the environment.
- Run connected tests with `DB_TEST_URL` pointing at a disposable PostgreSQL instance. Migration tests use an isolated temporary schema.

## Current delivery gates

The integrated UI now covers catalog, customers/templates, quotation lifecycle, subscriptions/portal, invoice actions/documents, received-payment recording and filtered reporting. Teammate commits remain attributed to their actual authors. Public HTTPS verification, actual SMTP acceptance/reset email, hosted scheduling and deployed p95 remain parent-owned verification gates. Video recording, evaluator invitation and contest submission have not been performed by this child.

## D2 authentication increment

- Transactional customer signup; database email uniqueness; exact minimum-nine-character password policy; salted Node scrypt.
- Hashed opaque sessions, HttpOnly/SameSite cookies, HTTPS Secure flag, expiry/logout, origin plus custom-header CSRF checks, database-backed throttles.
- Reset tokens are hashed, expire after 30 minutes, single use; reset revokes all sessions and sibling tokens. Reset email outbox payload is encrypted with a separately configured key; tokens are carried in URL fragments and are not returned by the API.
- Login/register/forgot/reset screens, admin-only staff provisioning, protected internal/portal layouts. Session loading hides internal navigation; customer shell only shows portal.
- Connected negative tests cover role injection, duplicate case-variant signup rollback, nine/eight-character boundary, invalid/used/expired resets, expired/logout sessions, CSRF and admin/staff denial.
- SMTP transmission is wired through the D7 outbox but remains unverified against an approved provider; queueing is not delivery. Missing reset encryption configuration returns a visible 503.

## D3 catalog/customer/template APIs

- GET/list/POST/PATCH for products, plans, taxes, discounts, customers and templates through the existing adapter contracts.
- Strict Zod validation, safe paise/rates, reference and variant-parent validation, deterministic bounded pagination/search/date/status filters, role checks and no hard-delete route.
- Variants are archived when removed. Customer business-email edits preserve the separate authentication email and ownership link.
- Batched SQL subqueries load variants and reference IDs; public DTOs have no auth fields.

## D5 pure calculator (before lifecycle preview wiring)

- BigInt intermediates; plan fee is a separate once-per-cycle line; product-group offer then subscription offer, original thresholds, inclusive dates and global usage eligibility.
- Best-value selection with rule-ID tie break, deterministic proportional largest-remainder allocation, per-line/per-tax half-up rounding and safe DTO bounds.
- Pure previews never mutate usage. Exact stored inputs produce the explanation.
- Focused financial tests reconcile every line/header and cover the agreed 1000000 / 100000 / 90000 / 990000 fixture, Odoo +56000 adjustment, base fee, fixed caps, grouped lines, thresholds, ties, date/cap eligibility and rounding.

## D4 lifecycle and contract snapshots

- Draft creation/editing resolves authoritative catalog economics. Template prefill validates references and validity; sequence-backed readable subscription numbers.
- Serialized quote/confirm/activate/pause/resume/renew/close transitions, role/owner/policy/date-based allowedActions and audit history. Catch-up is required before pausing/closing overdue unissued periods.
- Confirmation snapshots plan fee/policies, product/variant descriptions/economics and tax rates. Confirmed economics cannot be edited; preview uses the pure calculator and consumes no usage or invoice number.
- Calendar anchors retain Jan 31 and Feb 29 semantics across clamps. Expiry must be on a boundary. Resume starts a fresh cycle, does not refund prior time, and requires expiry alignment with that new anchor.
- Closed renewal requires a permitted plan and an explicitly supplied future startDate in the transition POST. Existing facade signatures remain unchanged; closed renew is not advertised as an action without that input.

## D6 transactional billing

- Shared runDueBilling service for admin/manual, isolated demo clock and authenticated scheduler. Bounded per-period transactions use SKIP LOCKED subscription claims and stable ordered global discount locks.
- Atomically issues snapshot-backed invoices/lines, reserves each applied rule once, audits and advances dates. Cancelled periods retain the unique barrier. Missed cycles catch up across reruns and future confirmed contracts activate when due.
- Expiry is processed against the next unissued period, preserving historical catch-up; auto-close or pause follows the snapshotted plan policy.
- Failed periods roll back, remain due and receive separate retryable failure records; successful retry resolves the failure.
- Scheduler endpoint requires a separate server credential and a one-minute rate guard. Hosted scheduling remains unconfigured/unverified; manual runs do not satisfy that deployment gate.

## D7 invoice actions, documents and outbox

- Invoice list/detail derives current balance/overdue and validates line/header reconciliation. Confirm/cancel/send enforce state and permissions; cancellation releases each redemption once and retains the period record.
- Printable HTML uses stored customer/line/economic snapshots, escapes all text and has a restrictive CSP. Customer direct-document/detail and portal lookups are owner-scoped.
- Invoice email is deduplicated by invoice ID. Outbox records commit atomically with invoices; external SMTP processing occurs after that commit, so SMTP failure does not undo billing. Reset payloads remain encrypted until sent and are then cleared.
- Nodemailer transport requires TLS and explicit EMAIL_DELIVERY_ENABLED opt-in. Delivery status is optional compatible Invoice.emailStatus/emailError; SENT means SMTP acceptance, not confirmed mailbox delivery.
- Failed sends are visible/retryable. Ambiguous DATA acceptance is UNCERTAIN and requires explicit reconciliation before retry. SMTP cannot promise exactly-once external delivery across a process/database crash after acceptance; stable Message-ID aids reconciliation.
- Connected tests inject a local sender; no real external email was sent. Actual SMTP acceptance/reset/invoice email remains a deployment gate.

## D8 payments and reports

- Payment transport preserves a random request key through automatic network/502/503/504 retry. Retrying a rejected input object preserves its key; a fresh draft or a successful request gets a new one. Other mutations are not silently retried.
- Server keys serialize across invoices, compare canonical actor/payload hashes, lock invoice balances and atomically insert payment/update status/audit. Positive safe amounts and nonfuture local payment dates are required.
- Reports use a consistent read snapshot, separate billed from collected, and keep current outstanding/overdue independent of date filters. Months are zero-filled; report ranges are bounded to 120 months.
- PostgreSQL groups identical active contracts before recurring-value calculation; no per-subscription query or browser dataset is used. All MVP contract lines recur. Current eligible recurring discounts apply before-tax; normalization rounds the total once across intervals.

## D9 local integration and deployment preparation

- Admin-only /operations shows billing counts, forward-only isolated demo controls, delivery states/retry, and explicit simulation labels. Shared refresh events update loaded resource views and session date labels.
- HTTP mode hides starter implementation notes. Feature-owner files/exports remain unchanged; their pending forms, actions, filtering and portal copy remain integration gates.
- HTTP standalone Dockerfile, DB readiness route, security headers and disabled-until-configured five-minute scheduler workflow are prepared. docs/DEPLOYMENT.md lists private setup and verification gates.
- Public hosting, approved DB/provider secrets, actual SMTP and scheduler execution are still pending; no public deployment is claimed.

## Local evidence checkpoint (2026-10-31)

- HTTP mode: lint, strict types, 57 tests and production build pass against disposable PostgreSQL 17. Tests include old-password login/reset concurrency, unique taxes, owner isolation and monetary/calendar/state races.
- A separate loopback DB contains 5,001 subscriptions (5,000 performance rows plus the baseline demo contract).
- Initial API benchmark: 50 samples after 5 warmups; subscription list p95 15.89 ms, report p95 53.57 ms, invoice list p95 7.27 ms. The invoice benchmark had one baseline invoice. These are native local production-build loopback timings, not hosted measurements.
- Initial Chromium page render benchmark: 20 samples after one warmup; dashboard/subscriptions/invoices p95 676/669/665 ms, including network-idle wait. Desktop 1440x1000 and mobile 390x844 checked. Login, logout, admin due-billing action, customer registration, portal-only navigation and direct internal-route denial pass with no browser runtime errors.
- Browser screenshots and measurement JSON are generated under ignored `output/`; they contain fictitious records, not credentials. Do not commit build outputs or test data.
- Docker build FAILED at `RUN npm ci`: container DNS returned `EAI_AGAIN` resolving registry.npmjs.org (eslint metadata). No image was published. Native npm install/build works; container build is unverified and needs a host with working approved registry DNS. No network restriction was bypassed.

- Final hardening adds a Next.js 16 Node proxy for pre-streaming session/role redirects, alongside protected layouts and independent API authorization. Browser pages never rely on cached layout checks alone.

## Feature-owner integration handoff

All domain endpoints in the original HTTP facade are now implemented. Route wrapper exports are unchanged; internal wrappers moved under src/app/(internal) for role protection. No files under catalog, subscriptions, portal or finance feature ownership were edited.

- Athul: persist catalog forms via existing CRUD facade; server returns field errors for invalid references, amounts, variants and rules. Removed variants are archived.
- Hannath: wire quotation composer/templates, allowedActions and portal self-service/documents. Show the specified nonrefunded resume and boundary-expiry policy before confirmation. Starter portal copy still says preview/sample and must be updated in the owner's PR.
- Adrinath: wire invoice actions/documents/payment forms/report filters. Optional Invoice.emailStatus/emailError adds queued/SMTP-accepted/failed/uncertain state. PaymentInput and payments.create signatures are unchanged: preserve the rejected input object to retry an ambiguous payment; a new draft object represents a genuinely new payment. Do not silently rebuild the same failed draft into a new payment key.
- Compatible Session additions: optional asOf and demoClock. The shared shell and /operations show server-provided simulation labels.
- HTTP mode hides shared StarterNote implementation instructions. This does not complete missing forms/actions in the feature-owner components.

No feature-owner PRs were open at the last review. Their unfinished UI is an explicit acceptance gate, not a claim of completed integration.

- Final Chromium pass after the pre-render proxy: admin staff creation, staff settings denial, actual demo-clock change and refresh, customer portal isolation/registration/logout, and desktop/mobile overflow all pass without runtime errors. Page p95 (20 samples after warmup, including network-idle wait) was 715/685/691 ms for dashboard/subscriptions/invoices.
- Final input guards cap streamed JSON at 100,000 bytes without trusting Content-Length, reject repeated tax IDs, and return field errors for adjusted-price/tax totals exceeding safe integer bounds.

## Post-D9 query-boundary review

- Draft subscription lists now join plan policy fields in the paginated query; increasing page size from 1 to 20 adds no queries (connected regression test).
- Contract resolution batches product/tax references and discount evaluation batches rules, avoiding per-line/per-rule network reads.
- HTTP-mode check passes with 58 tests, lint, strict types and production build. This corrects an active-only performance blind spot; owner UI files remain unchanged.

## Provider compatibility preparation

- Proposed Vercel/Neon demo: GET/POST bearer-authenticated cron, soft billing time budget with remainingDue, a 300-second Fluid route ceiling, one-message scheduler email batch, and an awaited operator catch-up fallback.
- Migration URLs are explicitly direct/unpooled; known pooler targets fail before connection. Runtime uses pooled pg with Vercel lifecycle management and transaction-local timeouts.
- Reset/invoice-send use targeted awaited Next after callbacks after DB commit, so resets do not wait for daily cron or an invoice backlog. No detached promise or assumed continuously running server is used.
- Inert vercel.example.json and docs/VERCEL_NEON.md explain Hobby daily timing, large backlog limitations and still-unverified deployment/email gates. Parent owns all provisioning/credentials/deploy actions.

- Provider preparation passes 62 tests plus lint/types/HTTP build. Added checks cover direct-versus-pooled migration selection, GET cron authorization, zero-budget backlog retention, lifecycle-targeted reset/invoice delivery and conservative uncertainty handling.
- Native Next after was exercised with SMTP explicitly unconfigured: invoice send returned QUEUED, the lifecycle callback persisted FAILED, and its 990000 total/400000 paid remained unchanged. No external SMTP connection was attempted. Vercel's actual lifecycle/SMTP acceptance is still a hosted verification gate.

- Final provider review: creation-date filters use explicit Asia/Kolkata midnight bounds without session timezone state; a connected four-record UTC/IST boundary test passes. Schema-isolated test URLs also reject known poolers. Current full check passes 63 tests; private external setup is still parent-owned.

- Money display preserves every paise up to Number.MAX_SAFE_INTEGER, including negative subrupee values, without dividing through a floating-point rupee amount. Full HTTP check now passes 64 tests across 12 files, lint, strict types and production build. The pre-format-change Chromium run at 06e7a0c passed all 13 role/clock/validation/mobile scenarios; final-run artifacts are emitted under ignored output/browser and output/local-benchmark.json with their source commit/tree identifiers.

## Authorized UI integration and recording handoff (2026-10-31)

- Integration PR #14 preserves Athul catalog commit 6e05566, Hannath's five subscription/portal commits ending 03eb20e, and Adrinath dashboard commit c2c5ab6. The user explicitly authorized teammate-file corrections and missing-feature completion. Devadathan authored the corrective work and remaining invoice/payment UI; no teammate authorship was fabricated.
- Corrected modal focus and restoration, selector-error visibility/retry, template edit loss, saved-draft retry, repeated quotation transitions, stale object actions/previews, keyboard form access, portal pagination and mobile tabs. Existing route exports remain unchanged.
- Finance invoice detail uses server explanations and totals, state-aware confirm/cancel/send, protected printable HTML and a received-payment form. Unknown payment outcomes lock the attempt for an identical retry, even after a background refresh observes settlement. History/search/date pagination and live filtered dashboard reads use the shared facade.
- Compatible optional third transition argument {startDate} enables CLOSED renewal with an explicit future cycle. Server policy, ownership and current plan availability are enforced; missing/past dates fail. Existing two-argument calls remain valid. Portal/internal forms collect that date and explain fresh-cycle/no-refund policy.
- Full HTTP lint/types/test/build passes with 107 tests across 19 files. Connected PostgreSQL migration plus seed and rerun pass on new isolated loopback databases. Local seed guard remains loopback-only. A separate exact-host/operator-approved hosted bootstrap is prepared but has not been executed remotely by this child.
- Connected Chromium regression passes 19 checks: typing/variant persistence; selector outage; exact tax entry; customer persistence; failed quotation creation stage with saved-draft retry; independent template edits; quotation PATCH without a repeated transition; confirm/activate/preview; failed second detail without old actions; real/repeated billing; partial and final payments with deliberately lost responses and background settlement refresh; authorized documents; truthful queued email; filtered zero reports/current balances; next-cycle discount expiry; portal pause/resume/closed renewal; A/B isolation; staff denial; 390px key pages. No browser runtime errors. Fresh fictitious local PostgreSQL, SMTP disabled; no external email was sent. Final source-specific evidence is generated in ignored output/demo-qa.
- docs/LOCAL_DEMO.md gives clean-checkout Node 24, private environment names, guarded Docker/native PostgreSQL and hosted operator steps. docs/DEMO_RECORDING.md is the <=5:25 functional recording plan. npm run deploy:manifest produces a clean-checkout source manifest without .env/dependencies/output.
- Historical earlier sections record intermediate gates; the implemented UI work in this section supersedes their former missing-screen lists. Hosting/SMTP/scheduler/video gates still require actual verification.
