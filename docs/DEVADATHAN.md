# Devadathan: core platform, all complex work, and integration

## Mission

Own the server, data model, authentication, permissions, all money/date/business rules, recurring billing, reliable payments, reporting, deployment, and integration. The other three members implement interfaces against your shared contracts. Keep their work independent by retaining the facade and DTOs already committed on main.

Read `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md`, `src/lib/contracts.ts`, `src/lib/api/http.ts`, and `db/migrations/001_foundation.sql` first. The implementation plan defines exact MVP policy decisions. Do not silently choose different pricing, date, discount, or lifecycle behavior.

## Branch and contribution requirements

Assigned branch: **`feat/devadathan-core`**, based on latest `main`. Initial bootstrap was pushed directly to main so everyone could start; subsequent core work uses PRs.

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/devadathan-core
npm ci
Copy-Item .env.example .env.local
```

If the branch exists, switch to it and merge `origin/main` instead of recreating it. Use your own real Git identity. After EVERY feature, run the relevant checks, commit descriptive changes, push `git push -u origin feat/devadathan-core`, and open/update a PR to `main`. Push at least once per hour. Never bundle the whole platform into one final push.

```powershell
npm run check
git add YOUR_CORE_FILES
git commit -m "feat(auth): implement customer signup and protected sessions"
git push -u origin feat/devadathan-core
gh pr list --base main --head feat/devadathan-core --state open
Copy-Item .github/pull_request_template.md .git/pr-body.md
# Complete the body. Create if none is open; otherwise edit the existing PR.
gh pr create --base main --head feat/devadathan-core --title "Core: customer authentication and sessions" --body-file .git/pr-body.md
```

For an existing PR use `gh pr edit PR_NUMBER --body-file .git/pr-body.md`. After merge, `git fetch origin`, `git merge origin/main` on your branch, implement the next feature, push, and create a new PR. Prefer merge commits to retain actual member contributions.

As integration owner, merge reviewed passing feature increments frequently and before each hourly checkpoint so main reflects the latest integrated code. Track open PRs from all four members; do not let finished work accumulate on branches.

## Ownership

Own `src/server/**`, `src/features/auth/**`, `src/app/**`, `src/components/**`, `src/lib/**`, `db/**`, `scripts/**`, `.github/**`, root config, dependencies/lockfile, environment configuration, and deployment. The only initial backend route is `/api/health`; domain `/api/v1` endpoints are still to be built.

Avoid editing another owner's feature files while their PR is open. Provide shared fixes through your branch, keep export names stable, and announce contract changes with exact DTO/method differences. Add optional fields compatibly where possible.

## Feature D1: database foundation and repository layer

1. Start PostgreSQL (`docker compose up -d db` or a managed DB) and run `npm run db:migrate` using `.env.local`.
2. Verify migration rollback-on-error and rerun behavior against a disposable database. Add subsequent migrations for changes; do not rewrite applied SQL.
3. Add server repositories with parameterized queries, transaction helpers, DTO mapping, bounded pagination, safe BIGINT conversion, and date-only mapping that preserves Asia/Kolkata business dates.
4. Validate snapshot JSON shapes and return no password/session/reset fields in public DTOs.
5. Add deterministic, non-destructive demo seed tooling. Use fictitious data and documented demo-only credentials supplied through environment configuration. Refuse production reset/seeding without explicit demo opt-in.
6. Seed admin, staff, and TWO customer accounts, catalog, taxes, discounts, templates, subscriptions, invoices, payments. Keep seed IDs compatible with fixture scenarios where useful. Add a separate 5,000-subscription performance seed.

Acceptance: fresh database can migrate and seed; restart retains records; rerunning migrations safely skips unchanged files; no secrets committed. Push + PR this feature.

## Feature D2: authentication and permissions

- Customer registration creates customer + user transactionally. Email uniqueness is case-insensitive and database-enforced. Public registration never accepts ADMIN/STAFF role.
- Password must be MORE THAN eight characters (minimum nine), at least one uppercase, one lowercase, and one special character. Digits are not required by the brief. Use a well-supported password hash or Node scrypt with random salt and safe comparison; never plaintext or fast hashes.
- Opaque random sessions, server-stored token hash, HttpOnly SameSite cookies, Secure in HTTPS, expiry, logout revocation. Use origin/CSRF protection for mutations, throttling, generic login/reset errors, and no sensitive request logging.
- Forgot-password sends a real SMTP reset link to the registered address. Store only a short-lived token hash, consume once, invalidate sessions after successful reset. Do not put reset tokens into UI logs or allow account enumeration.
- Implement register/login/logout/forgot/reset endpoints and screens, current session, admin-only staff provisioning/list screen, and protected role-aware layouts. The starter `/login` is a placeholder, not authentication.
- Enforce the plan's permission matrix in every handler. Customer queries derive customerId from session, ignore/reject caller-supplied ownership fields, and deny cross-customer object requests. Staff cannot create staff or rules.
- In HTTP mode, never expose an unprotected admin shell while session is loading. The `/portal` shell must not leak internal navigation or data to customers.

Acceptance tests: case-variant duplicate email; eight-character password rejected; nine-character compliant password accepted; invalid/expired/used reset; logged-out/role-denied writes; customer A cannot read customer B invoice via any route or document URL. Push + PR.

## Feature D3: catalog, customer, and template APIs

Implement GET/list/POST/PATCH endpoints already described by the HTTP adapter. Use Zod validation and field errors, resource-specific filters, 1-based pagination with maximum 100, deterministic ordering, and no hard deletion.

- Products: complete fields and variant IDs; +₹560 = 56000 paise. Validate variant-parent relationships and safe amounts. Archive rather than remove referenced variants.
- Plans: all four intervals, base fee, tax IDs, minimum quantity, availability, auto-close and policy flags. Availability affects new subscriptions only.
- Taxes: basis points 0..10000, active flag. Fixture tax is illustrative.
- Discounts: fixed/percentage, thresholds, product IDs for product scope, inclusive dates, usage cap. Clients cannot set usageCount. Staff writes are forbidden.
- Customers: business/contact details separate from authentication. Avoid orphaning existing login ownership on edits.
- Templates: plan ID, product/variant/tax line references, positive validDays. Referenced inactive data cannot silently enter new quotations.

Acceptance: Athul/Hannath UI can persist and reload catalog/customers/templates in HTTP mode; invalid/missing references give field errors; pagination/filter totals are correct. Push incremental PRs.

## Feature D4: quotation and subscription lifecycle

Implement `subscriptions.list/get/create/update/transition/preview`. A quotation is a subscription stage, not a parallel model. Generate unique readable numbers using a database sequence; IDs remain opaque.

- New subscription starts DRAFT. A selected template prefills validated lines and validity, never trusts client prices.
- Draft/quotation edits change references/quantities/dates/terms only. Server resolves prices. Lock confirmed/active contract economics in MVP.
- Transitions: quote, confirm, activate, pause, resume, renew, close; validate source state, quote validity, plan policy, dates, actor, and ownership.
- Confirmation snapshots prices, variants, descriptions, tax rates, plan fee/policies; preview uses the same calculator but consumes no rule usage or invoice number.
- Future CONFIRMED subscriptions activate when due in the scheduled service. Return correct allowedActions to every UI; portal actions are owner-scoped and policy-scoped.
- Implement the main plan's anchor/expiry/pause/resume/renew decisions explicitly and cover boundary dates. For off-cycle expiry, return a clear MVP validation error.
- Audit stage changes. Serialize competing transitions to prevent illegal interleavings.

Acceptance: template -> quotation -> confirmed -> active works; expired quote and prohibited pause fail; Jan 31/Feb 29 schedules correct; active quote economics cannot be edited. Push + PR.

## Feature D5: deterministic billing calculator

Write pure tested services under `src/server/billing/` before wiring the worker:

1. Base plan fee once/cycle plus quantity × snapshotted adjusted unit price.
2. Product-group discount eligibility, best-rule selection, fixed/percentage value, deterministic allocation, then best subscription discount.
3. Inclusive periodStart eligibility dates and global usage limits. Separate pure eligibility/calculation from transactional reservation.
4. Half-up integer arithmetic; proportionally allocate discounts with deterministic remainder assignment; per-line per-tax rounding. Use BigInt internally when multiplication may exceed safe integers; map bounded results to DTO numbers.
5. Invoice line totals must sum exactly to header subtotal, discount, tax, and total. Fixed discounts never yield negative bases.
6. Human-readable explanation derived from exact stored calculation inputs, not an AI-generated financial answer.

Tests must include Odoo +560 adjustment, multiple quantities, zero plan fee, nonzero base fee, tax after discount, fixed discount cap, same-product multiple lines, best-rule ties, threshold boundary, date boundary, usage exhaustion, and rounding remainders.

Acceptance: fixture calculation produces subtotal 1000000, discount 100000, tax 90000, total 990000 paise, and every line/header reconciles. Push + PR.

## Feature D6: automatic billing, catch-up, and idempotency

- One shared `runDueBilling(effectiveDate)` service for scheduler, authorized admin button, and isolated demo clock.
- Claim due active subscriptions with transaction locks; process missed periods until caught up or bounded batch limit. Handle future activations and expiry before generating a new period.
- Atomically create invoice/lines/customer snapshot, reserve applicable discount redemptions, record audit, and advance nextBillingDate. Unique subscription-period key is the final duplicate barrier.
- Cancelled period records remain; reruns do not recreate them. A failure rolls back the period, keeps it due, and writes a retryable failure record separately.
- Lock discounts in stable ID order and enforce global usage limits without oversubscription. Do not reserve on preview or increment on retry.
- Return BillingRunResult with runId/counts/asOf. Expose meaningful counts in admin controls; never imply skipped subscriptions were charged.
- Configure a real deployed scheduler with server-only credential, throttling, and retry behavior. Implement a documented manual run fallback for demonstration, but verify scheduled execution too.

Tests: repeat same run, two concurrent workers, crash/rollback/retry, missed cycles catch-up, global discount cap race, paused/closed exclusion, expiry, future activation, all four intervals. Push + PR.

## Feature D7: invoice actions, documents, and email

- List/detail DTOs include derived paid/balance/overdue, immutable line details, and explanation.
- Confirm draft; auto-set PAID for zero total. Cancel only unpaid draft/confirmed invoices; release rule redemption once. No deletion, casual edits, or cancellation of partially/fully paid invoices.
- Authorize a printable HTML document route from stored snapshots; include number/customer/period/lines/discount/tax/total/payment terms. Browser print/save-to-PDF is sufficient for MVP. Do not require PDF service accounts.
- Send invoice email with real SMTP through a deduplicated outbox. Queue after commit; failed delivery is visible/retryable, does not undo billing, and never silently reports success.
- If send status needs new DTO fields, add optional fields and inform Adrinath/Hannath; preserve existing method signatures.

Acceptance: confirm/cancel/send/print on legitimate invoices; unauthorized direct document requests fail; an old issued document is unchanged after catalog edits. Push + PR.

## Feature D8: transactional payments and real reports

- Add stable mutation idempotency to shared transport without changing `api.payments.create(input)` usage. Reuse a request key on retry; do not accidentally reuse it for a genuinely new payment.
- Validate positive amount/method/date/note, nonfuture paidAt if using that policy, confirmed invoice, safe integer, and available balance. Row-lock invoice, insert payment, update paid/status, and audit atomically.
- Exact duplicate key returns original payment; same key/different payload returns 409. Concurrent payments cannot overpay. Partial remains CONFIRMED; exact settlement becomes PAID.
- Implement reports with the main plan's definitions. Billed and collected are distinct; current outstanding/overdue clearly separated from period filters. Do not label invoiced totals as recognized accounting revenue.
- Add index-backed filters and attention items. Aggregate on server; never ship 5,000 records to render a dashboard.

Acceptance: 400000 then 590000 on fixture-sized invoice settles 990000 once; overpay/duplicate race tests; payment/invoice/report views agree. Push + PR.

## Feature D9: isolated demo clock, deployment, integration, and evidence

- Server clock abstraction defaults to real Asia/Kolkata date. Enable forward-only demo clock only for an isolated demo DB with `ENABLE_DEMO_CLOCK=true`, admin authorization, and visible simulation labels.
- Put clock/billing controls in Devadathan-owned shared/admin components, not Adrinath's finance ownership. Display results and refresh affected screens.
- Deploy a real HTTP-mode application and PostgreSQL; configure secure cookies/APP_URL/SMTP/scheduler. Never expose mock mode as the final functional application.
- Remove starter notes and development-only navigation when core/feature PRs are integrated. Recheck owned feature changes with their owner.
- Run a clean-clone install/build, migration/seed, connected smoke, meaningful domain/integration tests, role checks, expired-discount next cycle, worker rerun/concurrency, actual reset/invoice emails, and document downloads.
- Seed 5,000 subscriptions, measure key page and API latency in the demo environment, record p95/conditions; fix queries until under-two-second target is evidenced.
- Review all feature PRs and merge preserving contribution history; latest main must be the tested submission. Record a functional video within 5-6 minutes against that commit.
- Team-leader portal submission/evaluator invite/video-access tasks need actual portal/evaluator details. Do them with the supplied information; do not invent identities or claim they were completed by a Git push.

## PR checklist and final handoff

Each PR explains behavior, routes/migrations, tests, environment changes, integration impact, and real limitations. Include screenshots for auth/admin controls and test evidence for monetary/state/concurrency behavior. Ensure `npm run check` passes; run DB integration tests against a disposable test DB, not the public demo DB.

Done means all required feature UIs operate in HTTP mode, all backend acceptance rows are proven, main contains every reviewed contribution, and the demo links are accessible. A working fixture preview alone is not done.
