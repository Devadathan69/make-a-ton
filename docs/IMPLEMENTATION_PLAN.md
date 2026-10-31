# LoopLedger: full implementation plan

## 1. Outcome and scope

Build Brightloop Software's subscription operations platform for the Odoo x Make-A-Ton 9.0 virtual round. A judge must be able to follow a real customer from quotation to active subscription, recurring invoice, partial payment, final payment, and reporting. Include a customer portal with real server-side isolation.

The differentiator is explainable billing plus a clearly labelled demo clock that runs the same billing service as scheduled automation. Core correctness takes priority over optional AI, payment gateway integrations, bank reconciliation, mid-cycle proration, or accounting revenue recognition.

This repository initially contains a runnable Next.js starter with read screens, fixture CRUD, shared DTOs, an HTTP adapter, a PostgreSQL foundation migration, and checks. It does NOT yet contain real authentication, domain endpoints, recurring billing, invoice sending/documents, or payment recording. No feature is complete merely because a fixture table renders.

## 2. Team, branches, and independent ownership

| Member | Branch from main | Owned paths | Deliverable |
| --- | --- | --- | --- |
| Devadathan | `feat/devadathan-core` | `src/server/**`, `src/features/auth/**`, `src/app/**`, `src/components/**`, `src/lib/**`, `db/**`, `scripts/**`, root config, `.github/**` | All complex work: auth, database, APIs, calculations, lifecycle, billing worker, concurrency, payments, reports, deployment, integration |
| Athul | `feat/athul-catalog` | `src/features/catalog/**` | Products/variants, plans/policies, tax/discount configuration UI |
| Hannath | `feat/hannath-subscriptions` | `src/features/subscriptions/**`, `src/features/portal/**` | Customer forms, quote templates/composer, subscription detail/actions, customer portal UI |
| Adrinath | `feat/adrinath-finance` | `src/features/finance/**` | Dashboard, invoice detail/actions/explanations, record-payment UI |

Each owner places CSS Modules, subcomponents, and focused tests inside their owned directories. Existing `src/app/**/page.tsx` wrappers already import fixed named exports; feature owners preserve these exports and need not edit routing. Shared primitives live in `src/components/ui.tsx`; build local components for specialized behavior.

The three feature branches depend on the starter contracts, not each other's implementations. All can start immediately using fixtures. Product/customer/plan selectors consume `api` rather than importing another owner's feature code. Do not change shared config, dependencies, contracts, or root CSS from a feature branch. Coordinate a necessary shared change with Devadathan; keep working on unaffected features.

## 3. Repository and hackathon rules

- Repository: https://github.com/Devadathan69/make-a-ton (public).
- The team leader submits it through the portal before 10:00 AM on the applicable round date. The portal defines the actual date and coding window; do not infer them from the computer clock.
- Each member uses their own real Git/GitHub identity and commits their own work with descriptive messages.
- After EACH feature, commit and push to the assigned branch and leave a PR targeting `main`. An already open PR is updated by later pushes; do not create overlapping PRs from the same head. If merged, synchronize the same member branch with main and open a new PR for the next feature.
- Each member pushes at least once every hour while working, even for a clearly labelled incomplete checkpoint. Use a draft PR for incomplete work.
- Devadathan reviews and merges coherent passing feature increments throughout the hour. Branch pushes alone do not satisfy the separate requirement that latest integrated code be on `main`. Target merges before the end of each hourly checkpoint; keep a review buffer.
- Leave feature PRs open for Devadathan. Avoid squash merging when it would erase individual contribution history; prefer merge commits. Never manufacture commits or change another member's author identity.
- Leader also selects the problem statement, adds the evaluator as collaborator using the actual provided handle, follows the portal timeline/Discord, and submits an open-access functional video after coding. The pasted rules specify a maximum of 5-6 minutes. Target 5:30 and verify access in a signed-out window.
- The linked Drive guides were not fully inspected. Confirm any additional rules in the portal. A separate slide deck is not established as mandatory by the pasted rules.

### Standard workflow (PowerShell-compatible commands)

```powershell
git clone https://github.com/Devadathan69/make-a-ton.git
cd make-a-ton
git config user.name "YOUR REAL NAME"
git config user.email "YOUR GITHUB-LINKED EMAIL"
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c YOUR_ASSIGNED_BRANCH
npm ci
Copy-Item .env.example .env.local
npm run dev
```

If the member branch already exists remotely, use `git switch --track origin/YOUR_ASSIGNED_BRANCH` instead of creating it; if it exists locally use `git switch YOUR_ASSIGNED_BRANCH`. Never reset existing work.

After each feature (replace paths/branch/title with the actual assignment):

```powershell
npm run check
git add YOUR_OWNED_FEATURE_DIRECTORY
git commit -m "feat(catalog): add product variant editor"
git push -u origin YOUR_ASSIGNED_BRANCH
gh pr list --base main --head YOUR_ASSIGNED_BRANCH --state open
Copy-Item .github/pull_request_template.md .git/pr-body.md
# Fill .git/pr-body.md with the result, checks, evidence, and limitations.
# If no open PR exists, create one; otherwise update the existing PR description.
gh pr create --base main --head YOUR_ASSIGNED_BRANCH --title "Catalog: product variant editor" --body-file .git/pr-body.md
# For an existing PR:
gh pr edit PR_NUMBER --body-file .git/pr-body.md
```

Use the GitHub website if `gh` is unavailable. Push first, then open/update the PR after every feature. For an incomplete hourly checkpoint, be explicit and use `--draft`; do not call it ready.

Before the next increment and after a PR merge:

```powershell
git fetch origin
git switch YOUR_ASSIGNED_BRANCH
git merge origin/main
git push origin YOUR_ASSIGNED_BRANCH
```

Commit or safely stash your own unfinished work before merging. Resolve only your owned-file conflicts; coordinate shared-file conflicts. No force pushes are required.

## 4. Technology and local run

- Next.js App Router + React + strict TypeScript; ordinary CSS Modules for feature styling.
- PostgreSQL via parameterized `pg` queries; Zod for server validation.
- Same-origin `/api/v1` Route Handlers calling server services. No separate frontend/backend deployment required.
- Vitest for domain/contract tests; ESLint, type checking, production build, and HTTP route smoke checks.
- Node 24 LTS recommended. Commit and use `package-lock.json`; install with `npm ci`.
- Default `NEXT_PUBLIC_DATA_MODE=mock`: no database or accounts needed to work on UI. CRUD changes exist only in adapter memory and reset on page reload. Reports are fixed sample values, not live aggregates. Business actions return explicit `NOT_IMPLEMENTED` errors.
- Connected mode: Devadathan completes endpoints, sets `NEXT_PUBLIC_DATA_MODE=http`, configures secrets/SMTP, and restarts/rebuilds. It must never silently fall back to fixtures.
- Optional local DB: `docker compose up -d db`, then `npm run db:migrate`. A managed PostgreSQL URL is equally acceptable. Never expose database/session/SMTP secrets through `NEXT_PUBLIC_*` variables.
- Migrations are ordered SQL files. Do not edit an already applied migration; add a new one. The runner checks checksums and serializes migration attempts.

## 5. Routes and fixed exports

| Route | Export / owner |
| --- | --- |
| `/dashboard` | `DashboardPage` / Adrinath |
| `/catalog/products` | `ProductsPage` / Athul |
| `/catalog/plans` | `PlansPage` / Athul |
| `/catalog/rules` | `RulesPage` / Athul |
| `/customers` | `CustomersPage` / Hannath |
| `/quotes` | `QuotesPage` / Hannath |
| `/subscriptions` | `SubscriptionsPage` / Hannath |
| `/portal` | `PortalPage` / Hannath |
| `/invoices` | `InvoicesPage` / Adrinath |
| `/payments` | `PaymentsPage` / Adrinath |
| `/login`, planned `/register`, `/forgot-password`, `/reset-password`, `/settings/staff` | Devadathan |

Use local drawers/dialogs/detail panels for entity detail and editing, so no new routes are needed by feature owners. Devadathan replaces the unrestricted preview shell with role-aware protected layouts in connected mode. Customers must not receive internal navigation or internal data.

## 6. Integration contracts (authoritative source: `src/lib/contracts.ts`)

Import `api` from `@/lib/api`, DTOs from `@/lib/contracts`, helpers from `@/lib/format`. `AppApi` is already implemented by both adapters. Never copy types or reach into fixture modules from UI.

- All IDs are opaque strings. All money DTO fields are safe integer paise, not rupees or float strings. `parseMoney` converts typed rupees; `formatMoney` displays paise.
- Rates are integer basis points: 1000 = 10%; 10000 = 100%. Fixed discounts use paise.
- Quantities are positive integers. MVP currency is INR throughout.
- Business dates are `YYYY-MM-DD` in Asia/Kolkata. Audit timestamps are ISO timestamps with timezone. Server derives the effective date from a clock abstraction; never trust browser time for billing.
- `Page<T>` = `{ items, total, page, pageSize }`; page starts at 1, default size 20, cap 100. Filtering happens before pagination. UI resets page to 1 after changing filters.
- List filters: `search`, `status`, `customerId`, `from`, `to`. Per-entity search targets human-facing fields. Invoice date filters mean `issuedAt`; payment filters mean `paidAt`; subscription filters mean `startDate`; catalog/customer/template filters mean `createdAt`. The starter mock's generic date filter uses `createdAt` only; domain-aware filtering is backend work.
- A GET or mutation returns the DTO directly (no `{data: ...}` wrapper). Errors use `{error:{code,message,fields?}}`; HTTP client throws `ApiError` with `status`, `code`, optional `fields`.
- Use 400 invalid input, 401 no session, 403 denied, 404 missing/inaccessible record, 409 invalid transition/conflict, 422 business validation, 429 throttled. Portal object lookups should return 404 for another customer's IDs.
- HTTP mutation requests include a stable `Idempotency-Key` for operations vulnerable to retries, especially payment recording. Devadathan extends the existing transport once and documents the compatible API, rather than asking every feature owner to implement retry logic.

### API endpoints to implement (all under `/api/v1`)

| Endpoint | Methods / purpose |
| --- | --- |
| `/session` | GET current authenticated Session |
| `/auth/register`, `/auth/login`, `/auth/logout` | POST; customer registration, login, logout |
| `/auth/forgot-password`, `/auth/reset-password` | POST; send reset link / consume token |
| `/staff` | GET/POST; admin-only staff list and provisioning |
| `/products`, `/plans`, `/taxes`, `/discounts`, `/customers`, `/templates` | GET paginated / POST create |
| Each resource above `/:id` | GET / PATCH; no hard delete in MVP |
| `/subscriptions` | GET / POST draft creation |
| `/subscriptions/:id` | GET / PATCH draft or quotation editable data |
| `/subscriptions/:id/transition` | POST `{action}`; returns updated subscription with allowedActions |
| `/subscriptions/:id/preview` | GET nonpersisting invoice-shaped estimate; no discount redemption |
| `/invoices`, `/invoices/:id` | GET list/detail |
| `/invoices/:id/actions` | POST `{action:"confirm"|"cancel"|"send"}` |
| `/invoices/:id/document` | GET authorized printable HTML initially; download/print through browser; PDF optional |
| `/payments` | GET list / POST PaymentInput; transactional invoice settlement |
| `/reports/summary` | GET `?from=&to=` DashboardSummary |
| `/portal/subscriptions`, `/portal/invoices` | GET current customer's records; derive customer from session |
| `/portal/subscriptions/:id/transition` | POST permitted self-service action for current owner |
| `/billing/run` | POST admin-triggered due processing; scheduled invocation uses separate server credential |
| `/demo/clock` | POST `{to}`; admin-only, server opt-in, isolated demo workspace |

### Permission matrix

| Action | Admin | Staff | Customer |
| --- | --- | --- | --- |
| Catalog/plans/taxes/discounts read | Yes | Yes | No internal endpoints |
| Catalog/plans/taxes/discounts write | Yes | No | No |
| Staff provisioning | Yes | No | No |
| Customers/templates/subscriptions operate | Yes | Yes | Own portal records/actions only |
| Invoice confirm/cancel/send, payment record | Yes | Yes | Own invoices/documents read only |
| Internal reports | Yes | Yes | No |
| Billing run/demo clock | Yes | No | No |

The brief only specifies limited staff access; this matrix is our explicit MVP policy. Backend checks are mandatory even when buttons are hidden. No browser role selector in the final application.

## 7. Pricing, dates, and lifecycle decisions

These are explicit implementation decisions where the brief leaves details open. Keep them consistent across services and presentation.

1. Plan `price` is a base fee charged ONCE per cycle, plus subscription product lines. Each product line = quantity × (salesPrice + variant adjustment). A zero base fee supports pure per-seat plans. Base fee tax IDs come from the plan. The fixture Odoo variant adds 56000 paise (= ₹560).
2. At confirmation, snapshot product descriptions, prices, variant adjustments, plan policies/base fee, and tax rates. Catalog edits apply to new contracts, not historical invoices. No mid-cycle product/quantity editing for active subscriptions in MVP.
3. Daily/weekly schedules use local calendar dates. Monthly/yearly schedules retain the original anchor and clamp to the last valid date (Jan 31 -> Feb 28/29 -> Mar 31; Feb 29 annual -> Feb 28 in nonleap years). Do not implement months as 30 days.
4. Bill in advance for `[periodStart, periodEnd)`. Billing starts on activation/start date and repeats from the anchor. Generate due periods even after a missed worker run; cap each batch and continue via subsequent jobs.
5. Availability dates restrict new subscriptions, not existing contracts. Expiry prevents generating a period starting on/after expiry. For MVP, require finite expiry to fall on a billing boundary; reject an off-cycle expiry with a clear validation error rather than silently prorating. With autoClose, close at expiry; without autoClose, move to PAUSED awaiting renewal and do not bill beyond expiry.
6. Required main path: DRAFT -> QUOTATION -> CONFIRMED -> ACTIVE -> CLOSED. Add PAUSED as an explicit optional branch. Quote cannot confirm after `quotationValidUntil`. Activation cannot occur before start date; use a scheduled activation step for future confirmed contracts.
7. Pause blocks future, unissued periods. Already issued invoices remain collectible. Resume restarts a fresh cycle on the resume date; unused paid time is not refunded in MVP. Explain this policy before confirmation. Early closure follows plan policy; automatic closure follows expiry. Renewal preserves the existing contract and extends expiry by one cycle; a closed contract can renew only if policy allows and a new future cycle is explicitly started. Validate date windows again.
8. `allowedActions` is calculated server-side from status, dates, actor, and plan policy. UI renders it. Transitions are explicit POST actions, never free editing of `status`.
9. Discounts are evaluated per new billing period using periodStart. Start/end dates are inclusive. Usage limit is GLOBAL per rule, counted once per rule per invoice. Preview does not consume uses. Reserve a redemption transactionally when creating an invoice; cancelling an unpaid invoice releases it exactly once.
10. For predictable MVP discounting: choose one best eligible PRODUCT rule per product group (apply its fixed value once across that product's lines), then one best eligible SUBSCRIPTION rule across the remaining invoice subtotal. Eligibility thresholds use the original relevant pre-discount subtotal and quantity. Percent discounts round half-up to paise; fixed discounts clamp at eligible subtotal. Break equal-value ties by rule ID. Allocate invoice/product-group discounts proportionally with a deterministic largest-remainder rule so line totals reconcile exactly. No negative taxable amounts.
11. Taxes apply to each line's discounted taxable base using snapshotted configured rates, rounded half-up per line per tax, then summed. No external tax-law claims; fixture rates are illustrative.
12. Invoice states: DRAFT -> CONFIRMED -> PAID; cancellation is a terminal alternate for unpaid draft/confirmed invoices. Confirmed lines/totals are immutable. A zero-total confirmed invoice immediately becomes PAID without a payment row. Partially paid invoices remain CONFIRMED with paid/balance fields. OVERDUE is a derived flag, not a new persisted lifecycle state.
13. A payment must be positive, not exceed remaining balance, and reference a confirmed invoice. Lock the invoice row, insert a uniquely keyed payment, update paid/status, and write audit history atomically. Reusing an idempotency key with identical payload returns the original result; a different payload returns conflict. Never accept client-supplied paid/balance/totals.
14. Overdue means confirmed, positive balance, and effective local date > dueAt. Due date = issued date + payment terms. Cancelled invoices do not count as outstanding or billed.

## 8. Domain storage and billing reliability

`db/migrations/001_foundation.sql` defines customers/users/sessions/reset tokens, products/variants, plans/tax links, discounts/product links, quotation templates, subscriptions/lines, invoices/lines, payments, redemptions, billing runs/failures, audit/outbox, and demo clock. JSON snapshot fields preserve issued details; validate JSON shapes in server services.

- Database money is BIGINT. Map to DTO numbers only after a safe-integer check; never globally parse all BIGINT values without bounds checking.
- Use parameterized SQL and transactions. Validate that a selected variant belongs to its product and referenced taxes/products/plans exist.
- Unique recurring invoice key = `(subscription_id, period_start, period_end)`, including cancelled invoices. A retry reuses/skips an existing period rather than creating a replacement invoice.
- Lock per-subscription due processing and atomically create invoice, lines, discount redemptions, audit event, and advance nextBillingDate. On error rollback that period, log failure separately, and retain the due date for retry. Concurrent workers must not double count discount uses.
- Retain cancelled billing-period records. Correction/refund/credit-note accounting is outside MVP; never delete issued history to allow a rebill.
- Invoice send/reset email use an outbox with unique dedupe keys; asynchronous SMTP failures do not roll back an already issued invoice. Show queued/sent/failed delivery status when implemented.
- External scheduled invocation needs authenticated server credentials and a deployment scheduler. A manual button alone does not fulfill automation.
- Clock advances are forward-only, date-validated, admin-only, and opt-in. The demo application runs in its own database/workspace. Never alter the machine clock or real customer billing dates.

## 9. Reporting and performance definitions

- `activeSubscriptions`: current ACTIVE records as of effective date.
- `billed`: noncancelled confirmed/paid invoice totals issued within selected dates, including configured tax.
- `collected`: payment amounts with paidAt within selected dates.
- `outstanding`: current confirmed balances, independent of selected period; label as current, not period revenue.
- `overdue`: current overdue confirmed balances.
- `mrr`: current contractual recurring value before tax after recurring eligible discounts; annual /12, monthly unchanged, weekly ×52/12, daily ×365/12; round aggregate once. Exclude one-off components. Label as normalized recurring value, not cash or recognized revenue.
- `monthly`: billed and collected grouped separately by their corresponding dates, zero-fill months in range. `attention`: actionable current overdue/expiring/failure records with links.

Use the migration's due-date/status/customer indexes, paginated lists, aggregate SQL, and bounded joins rather than loading all rows into the browser or doing N+1 queries. Seed at least 5,000 subscriptions for performance evidence, measure end-to-end key page loads and API p95 in the actual demo environment, and target under two seconds. Report the measurements honestly; fixture load speed is not scalability evidence.

## 10. Delivery gates and integration order

No exact deadline was supplied. Map these gates onto the portal timeline and reserve the final 15% of the coding window for verification, merges, deployment, and recording.

1. Foundation (this starter): main is cloneable; all routes compile; contracts and ownership fixed.
2. First independent UI increments: Athul products; Hannath customers; Adrinath dashboard. Devadathan database/auth/permissions. Push and PR each increment.
3. Core connected workflow: Devadathan catalog/customer/template/subscription APIs; Athul plans/rules; Hannath quotation flow; Adrinath invoice detail.
4. Billing correctness: Devadathan lifecycle, snapshots, invoice generation, idempotency, payment service; UI owners wire their action states and refresh behavior through unchanged contracts.
5. Completion: portal isolation/auth layouts, invoice document/send, real scheduling, report filters, demo clock, seed/reset tooling. Integrate feature PRs frequently.
6. Verification/freeze: clean-clone check in HTTP mode, cross-role negative tests, billing rerun, concurrent payment test, 5k-record measurements, production smoke, public demo access. Merge all required code to main, tag the tested submission commit, record against that commit.

Devadathan's workload is intentionally largest. Keep optional polish out until the connected core works. Feature owners can improve their owned UI and provide manual verification evidence without touching backend ownership.

## 11. Acceptance matrix

| Requirement | Backend / integration | UI owner | Evidence |
| --- | --- | --- | --- |
| Unique email, exact password policy, emailed reset, roles/admin staff creation | Devadathan | Devadathan | Real signup/reset and 401/403 tests |
| Product fields, Odoo +560 variant | Devadathan | Athul | Persist/reload product; quote uses adjusted snapshot price |
| Four intervals, quantity/dates, plan policies | Devadathan | Athul | Configured policy rejects disallowed action |
| Templates/validity, numbered subscription lifecycle | Devadathan | Hannath | Quote -> confirmed -> active; expired quote rejected |
| Automatic invoices/taxes, no duplicate/skipped due periods | Devadathan | Adrinath display | Scheduled catch-up + repeated/concurrent run |
| Fixed/percent scoped discounts, thresholds/expiry/usage caps | Devadathan | Athul setup; Adrinath explanation | Boundary and concurrency tests; next cycle removes offer |
| Invoice confirm/cancel/send/print, Draft/Confirmed/Paid | Devadathan | Adrinath | Actual document and email, supported state controls |
| Payment metadata, outstanding/overdue | Devadathan | Adrinath | Partial then final payment, duplicate retry |
| Customer self-service and isolation | Devadathan | Hannath | Two customer accounts; cross-ID requests denied |
| Filterable summaries, thousands of subscriptions <2s | Devadathan | Adrinath | Real DB seed + recorded timing |

## 12. Functional video plan (target 5:30)

- 0:00-0:30: Brief view of admin/staff/customer roles; show catalog and variant.
- 0:30-1:30: Customer and quotation from template; confirm and activate.
- 1:30-2:40: Advance isolated demo clock; invoice generates; explain discount/tax; rerun same period without duplicates.
- 2:40-3:40: Record partial payment, show overdue balance, finish payment.
- 3:40-4:30: Next cycle after discount expiry; demonstrate allowed pause/renew or restricted action.
- 4:30-5:10: Customer portal shows only own records and invoice document.
- 5:10-5:30: Filtered finance view with balances updated.

Use real connected records, clearly identify simulated time, show functional flow only, and keep narration concise. Do not present mock figures or unmeasured speed claims as completed behavior.

## 13. Technical references

- Next.js App Router installation/version conventions: https://nextjs.org/docs/app/getting-started/installation
- Test clocks as an established testing approach: https://docs.stripe.com/billing/testing
- Retry/idempotency background: https://docs.stripe.com/api/idempotent_requests

These are references, not a requirement to integrate Stripe. Our invoice engine remains under our own application contracts.
