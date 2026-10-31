# Connected deployment handoff

No hosting account, database service, credentials, real email or deployment has been provisioned by this work. The repository is prepared for a PostgreSQL-backed HTTP deployment; the local cloud workspace is not a public demo.

## Run the connected application

Use Node 24 and PostgreSQL 17. Install with `npm ci`. Supply `DATABASE_URL` privately and run `npm run db:migrate` from a trusted one-off migration job using the source checkout. Migrations are checksum-checked and transactionally serialized. Do not run seed/reset commands against production.

Build with `NEXT_PUBLIC_DATA_MODE=http npm run build`, then run `npm start`. Mock mode is development-only and never silently substitutes fixtures for an HTTP failure. `/api/health` is liveness; `/api/ready` verifies DB connectivity in HTTP mode. Apply additive migrations before rolling out code.

`docker build -t loopledger .` creates a standalone Node 24 image in HTTP mode; runtime environment values are supplied by the hosting secret manager. The Dockerfile specifies a nonroot runtime user. The local Docker build failed during npm ci because container DNS returned EAI_AGAIN for registry.npmjs.org. It must be verified on the intended host with working approved registry access; no image has been published.

## Required private runtime configuration

- `DATABASE_URL`: dedicated PostgreSQL database with TLS configured according to the provider. Do not disable certificate verification.
- `APP_URL`: exact public HTTPS origin. Session cookies become Secure on HTTPS. Mutation requests require the same Origin and `X-LoopLedger-CSRF: 1`.
- `OUTBOX_ENCRYPTION_KEY`: privately generated 32-byte hex key for encrypted reset email payloads. Retain it while encrypted messages are pending; never expose it through NEXT_PUBLIC variables.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and provider-approved `SMTP_USER`/`SMTP_PASSWORD` if required. `EMAIL_DELIVERY_ENABLED=true` explicitly enables sending. TLS/STARTTLS is required and certificates are verified. First verify reset/invoice messages with an authorized test recipient. Until then email delivery is unverified.
- `CRON_SECRET`: independent random server-only credential, at least 32 characters. Do not reuse an account password. Configure it privately after approval; never place it in a URL.
- Demo only: `ENABLE_DEMO_CLOCK=true` plus `DEMO_DATABASE_NAME` exactly matching a separate database whose name contains demo/test. Leave disabled for real billing. It never changes the machine clock.

The original SESSION_SECRET placeholder is unnecessary: sessions are independent random tokens with only their hash stored on the server. Public registration can create CUSTOMER only. Admin/staff provisioning uses a trusted seed for local demo or an explicitly approved private provisioning step for deployment.

## Demo data and local verification

The seed is intentionally restricted to loopback demo/test databases and requires `ENABLE_DEMO_SEED=true` with a compliant `DEMO_PASSWORD` supplied through the environment. `npm run db:seed` inserts fictitious `admin@example.test`, `staff@example.test`, `ananya@example.test` and `arjun@example.test` accounts without overwriting existing passwords or records. `npm run db:seed:performance` adds 5,000 subscriptions. It never deletes data. No usable password is committed.

Run `DB_TEST_URL=... npm run check` against a disposable test database. Domain suites create/drop only their generated test schemas. The public demo database is not a test target. For HTTP performance, run `BENCHMARK_BASE_URL=... DEMO_PASSWORD=... npm run benchmark` against a separately authorized loopback demo with the performance seed. Results are local unless measured on the deployed demo itself.

## Scheduler and email processing

`POST /api/v1/scheduler/run` accepts only `Authorization: Bearer <CRON_SECRET>`, rate limits to one invocation per minute and runs up to 500 due periods. Missed cycles remain due for later batches. It processes the email queue only when delivery is explicitly enabled. Admin `/operations` provides a 100-period manual fallback, forward-only isolated demo controls and safe outbox status/retry actions.

`.github/workflows/scheduler.yml` is a five-minute scheduler example, disabled unless repository variable `ENABLE_BILLING_SCHEDULER=true` is explicitly configured. It needs secrets `LOOPLEDGER_APP_URL` and `LOOPLEDGER_CRON_SECRET`. A hosting-provider scheduler calling the same endpoint is also supported. GitHub schedules can be delayed; monitor billing_runs/billing_failures and rerun safely. Do not enable either scheduler until the target deployment and credentials are approved. Record an actual scheduled invocation, its run ID and resulting invoice period before marking automatic billing deployed.

Invoice email queues are unique per invoice. SMTP processing occurs after invoice commit. SENT means SMTP accepted, not guaranteed mailbox delivery. FAILED records have backoff/retry; UNCERTAIN acceptance requires provider-log reconciliation and an explicit admin retry. A crash after SMTP acceptance may remain ambiguous; SMTP does not provide exactly-once end-to-end delivery.

## Outstanding delivery gates

Verify a public HTTPS application and dedicated DB, real reset/invoice emails, an authenticated deployed scheduler run, cross-role browser flows and deployed 5,000-record API/page p95 under two seconds. Record against the exact tested main commit. Teammate catalog/subscription/portal/finance interfaces still need their owners' implementation PRs; this core work preserves their files and exports. Portal starter copy and missing feature forms are not evidence of completed UI integration.

Contest portal/evaluator identity, deadline/window, functional video and submission require actual supplied details and separate authorization. No evaluator was invited and nothing was submitted.
