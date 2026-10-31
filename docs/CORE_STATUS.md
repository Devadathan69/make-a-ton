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
