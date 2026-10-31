# Vercel + Neon demo compatibility

This is preparation for the proposed free demo stack. Parent coordination owns resource creation, connection grants, credentials, secrets, data import and deployment. No hosted target or real email was verified by this code work.

## App and database

Use Vercel's native Next.js/Node deployment with Fluid Compute enabled. Docker and npm start are local/self-hosted paths, not background workers on Vercel. The catch-all API route declares maxDuration=300, which Hobby supports with Fluid Compute; without Fluid the limit differs and this profile must be adjusted before deployment. See [duration limits](https://vercel.com/docs/functions/configuring-functions/duration).

Keep the existing pg driver and session system. Runtime DATABASE_URL may be Neon's pooled endpoint; MIGRATION_DATABASE_URL (or DATABASE_URL_UNPOOLED) must be the direct endpoint for the same approved branch/database. The migration runner uses a session advisory lock and rejects known -pooler hostnames before connecting. Runtime payment/clock locks are transaction scoped. See [Neon pooling restrictions](https://neon.com/docs/connect/connection-pooling).

The runtime pool is lazy, limited to five clients and uses attachDatabasePool on Vercel to release idle clients around suspension. Transactions set LOCAL statement and lock timeouts, not session SET state. A private one-off migration job runs before rollout; do not migrate a shared database during every preview build. Preview/test branches require their own approved connection URLs. No real credentials belong in source or NEXT_PUBLIC variables.

For demo-clock use, the actual database name must contain demo/test (for example loopledger_demo), and DEMO_DATABASE_NAME must match it. A project name containing demo does not make default neondb pass that guard. Leave ENABLE_DEMO_CLOCK=false until the dedicated database is configured.

Set NEXT_PUBLIC_DATA_MODE=http at build time and runtime. Set APP_URL to that environment's exact HTTPS origin; preview mutations need their own exact configured origin or stable approved alias. Do not broaden CSRF acceptance to every vercel.app host. API and document authorization stays server-side.

## Cron and large backlogs

vercel.example.json is inert until deliberately copied to vercel.json during approved setup. It demonstrates one daily GET at /api/v1/scheduler/run. The route also accepts POST, and both methods require the independent CRON_SECRET bearer credential. Vercel supplies that header when configured. Cookies and User-Agent never authorize this endpoint. See [cron invocation](https://vercel.com/docs/cron-jobs) and [cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Hobby's daily cron runs within the selected hour, with no precise-minute guarantee and no automatic failure retry. It cannot act as a frequent queue worker. The existing five-minute GitHub workflow is an alternative external dispatcher, disabled until its separate flag and private secrets are approved. See [Hobby cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Each scheduler call handles at most 500 periods, normally stopping between periods after a 20-second soft work budget or before the platform deadline. An in-flight period remains transactional: platform termination rolls back uncommitted work, and unique period keys make a retry safe. Statement/lock/connection timeouts and the 300-second route ceiling add bounds, but deployed worst-case duration still needs measurement. Scheduler email processing is limited to one queued message per invocation and is awaited.

The response's remainingDue counts due subscriptions, including failed ones, not missed periods. A 5,000-subscription monthly burst needs at least ten full 500-period calls, possibly more when the time budget stops a call early. Daily-only invocation is not sufficient to drain that burst promptly. Enable an approved frequent external dispatcher, or run npm run billing:catchup from an authorized operator job with APP_URL, CRON_SECRET, and CONFIRM_CATCHUP_TARGET equal to the verified origin. It awaits each HTTP call, waits 61 seconds between calls, stops on no progress/errors, and caps runs. Failed records stay due for diagnosis/retry; nothing silently pretends they were charged. The CLI has not been run against a hosted target.

## Immediate reset and invoice email

Forgot-password and explicit invoice-send commit their outbox row before registering a Next after callback. That callback awaits exactly the targeted delivery, so an older invoice backlog cannot delay a reset. Both known and unknown reset requests register the lifecycle callback and return the same generic response; SMTP latency is outside that response. Failure remains visible/retryable in the outbox.

This uses Next's documented after/waitUntil platform lifecycle, not an unawaited detached promise or a continuously running local process. The work still counts toward maxDuration. Require the supported Next/Vercel Fluid lifecycle and verify an actual preview reset/invoice send; local process success alone does not prove it. See [Vercel SMTP lifecycle](https://vercel.com/kb/guide/serverless-functions-and-smtp) and [Next after](https://nextjs.org/docs/app/api-reference/functions/after).

SMTP requires Node, a verified provider sender, approved private credentials and EMAIL_DELIVERY_ENABLED=true. Use 465 or 587 according to provider instructions; Vercel blocks 25. Brevo account activation/SMTP access and sender verification are still external setup gates, not assumed complete. SMTP failure does not undo billing; SENT means SMTP acceptance, not mailbox receipt. Provider quotas also limit delivery throughput; the 5,000-record performance seed is not evidence of permission or capacity to send 5,000 real emails.

## Gates still open

- Parent obtains the Vercel workspace grant and approves/creates the isolated demo database plus private credentials, encryption key, cron credential and fictitious demo account password.
- Parent applies migrations using the direct URL and performs an approved non-destructive demo import/bootstrap. The local seed intentionally refuses remote databases; do not bypass it by tunnelling a public DB through localhost.
- Actual HTTPS session/CSRF/role flows; reset and invoice delivery to an authorized test recipient; one real scheduled run and repeated catch-up; cold/warm deployed 5,000-record p95 under two seconds.
- Teammate catalog/subscription/portal/finance forms/actions remain their owners' missing UI work. No contest submission or evaluator invitation has been made.
