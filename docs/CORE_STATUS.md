# Core platform evidence

Branch: `feat/devadathan-core`. No teammate-owned files changed.

## D1 foundation

- PostgreSQL 17 disposable container, bound only to loopback port 55432.
- Ordered migrations retain checksums, reruns skip applied files, migration errors roll back.
- Transaction helper, parameterized user lookup, explicit public user allowlist, checked BIGINT mapping, bounded pagination, valid date-only and snapshot validators.
- Non-destructive deterministic fictitious seed includes admin/staff/two customer users, catalog, template, active subscription, issued invoice, partial payment and redemption. Reruns preserve existing records/passwords.
- Separate `npm run db:seed:performance` adds 5,000 subscriptions. Requires a loopback database whose name contains demo/test, `ENABLE_DEMO_SEED=true`, and a compliant `DEMO_PASSWORD` supplied privately through the environment.
- Run connected tests with `DB_TEST_URL` pointing at a disposable PostgreSQL instance. Migration tests use an isolated temporary schema.

## Remaining gates

D2-D9 remain in progress: real auth/permissions, domain APIs, lifecycle/snapshots, billing, documents/outbox, payments/reports, clock, deployment/integration.
SMTP delivery, hosted scheduler, deployment performance, evaluator invitation and contest submission require verified setup. No external account credentials were provisioned, emails sent, or deployment published.

## D2 authentication increment

- Transactional customer signup; database email uniqueness; exact minimum-nine-character password policy; salted Node scrypt.
- Hashed opaque sessions, HttpOnly/SameSite cookies, HTTPS Secure flag, expiry/logout, origin plus custom-header CSRF checks, database-backed throttles.
- Reset tokens are hashed, expire after 30 minutes, single use; reset revokes all sessions and sibling tokens. Reset email outbox payload is encrypted with a separately configured key; tokens are carried in URL fragments and are not returned by the API.
- Login/register/forgot/reset screens, admin-only staff provisioning, protected internal/portal layouts. Session loading hides internal navigation; customer shell only shows portal.
- Connected negative tests cover role injection, duplicate case-variant signup rollback, nine/eight-character boundary, invalid/used/expired resets, expired/logout sessions, CSRF and admin/staff denial.
- SMTP transmission is still unverified and not yet wired; queueing is not delivery. Missing reset encryption configuration returns a visible 503.

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
