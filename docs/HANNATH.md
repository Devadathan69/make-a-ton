# Hannath: independent customers, quotation, subscription, and portal UI

## Assignment and boundary

You implement forms and views for the subscription journey. Devadathan owns authentication, persistence, pricing, state transitions, dates, permissions, and billing. Read `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md`, and `src/lib/contracts.ts` before coding.

Branch: **`feat/hannath-subscriptions`**, created from latest `main`.

Allowed edits: **`src/features/subscriptions/**` and `src/features/portal/**` only**, including local components, CSS Modules, and tests. Preserve named exports `CustomersPage`, `QuotesPage`, `SubscriptionsPage`, and `PortalPage` in their existing files. Routes are already wired. Do not edit shared contracts/adapter/fixtures, routing, root CSS, dependencies, lockfile, backend, or another member's features.

All required selector data is provided by the starter adapter. Do not wait for Athul's screens or import them. A product selector loads `api.products`, a customer selector loads `api.customers`, and so on.

## Setup, individual contributions, and feature PRs

```powershell
git clone https://github.com/Devadathan69/make-a-ton.git
cd make-a-ton
git config user.name "YOUR REAL NAME"
git config user.email "YOUR GITHUB-LINKED EMAIL"
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/hannath-subscriptions
npm ci
Copy-Item .env.example .env.local
npm run dev
```

If branch already exists, switch to the local branch or `git switch --track origin/feat/hannath-subscriptions`. Never reset existing work. Default mock mode needs no database or real accounts.

After EVERY feature H1-H5, run `npm run check`, then:

```powershell
git add src/features/subscriptions src/features/portal
git commit -m "feat(subscriptions): add customer editor and search"
git push -u origin feat/hannath-subscriptions
gh pr list --base main --head feat/hannath-subscriptions --state open
Copy-Item .github/pull_request_template.md .git/pr-body.md
# Fill result/checks/screenshots/limitations for this feature.
gh pr create --base main --head feat/hannath-subscriptions --title "Subscriptions: customer editor" --body-file .git/pr-body.md
```

If a PR already exists, update with `gh pr edit PR_NUMBER --body-file .git/pr-body.md`; each push updates that open PR. Leave it for Devadathan to review. When merged, fetch and merge `origin/main` into this same branch before the next increment, then open a new PR. Website PR creation is fine if `gh` is unavailable.

Every member must push at least once per hour using their own identity. Push each finished feature immediately, with a descriptive message. Mark incomplete checkpoints as drafts. Devadathan merges passing work frequently so latest integrated code is on main. Do not merge your own PR unless explicitly authorized.

## Existing contracts and development behavior

Use `api`/`ApiError` from `@/lib/api`, DTOs from `@/lib/contracts`, shared UI primitives, and `formatMoney`/`formatDate`. Use local dialogs/detail panels so no new route wrapper is required.

- `api.customers`: list/get/create/update.
- `api.templates`: list/get/create/update.
- `api.products`, `api.plans`, `api.taxes`: read-only selectors here.
- `api.subscriptions`: list/get/create/update/transition/preview.
- `api.portal`: subscriptions/invoices/transition. Never substitute unscoped internal lists in the customer portal.
- `api.session.get()`: role and current identity. Devadathan implements the actual login/protected layouts.
- Quotation is a subscription whose status is QUOTATION; there is no separate quotes API or duplicate quote table.
- Mutation input contains product/variant IDs, quantity, tax IDs, customer/plan references, and dates/terms. Do not submit unit prices, totals, status, subscription numbers, or customerName as trusted input.
- Mock CRUD supports local form development and resets on reload. Lifecycle actions and preview intentionally return `NOT_IMPLEMENTED`; catch and show that message. Build loading/error UX now; backend proves actual success later. For UI tests, inject a local typed fake at the component boundary instead of editing the shared adapter.

## Feature H1: customers

Route `/customers`.

1. Add search and API-backed pagination with company, contact, email, address.
2. Create/edit form with nonempty name/company, valid email, address. Customer records are not automatically staff or authenticated accounts.
3. Send `CustomerInput` only; maintain user input on failure; show field errors/pending/success; refresh after successful mutation.
4. No password or role fields here. Authentication and linking a customer account are Devadathan's work.

Acceptance: create, edit, search, pagination, empty/error/retry, accessible dialog. Commit/push/PR before moving to H2.

## Feature H2: quotation templates and composer

Route `/quotes`, using local tabs/panels for templates and quotation editing.

### Templates

- List templates with name/plan/validity days/product count. Create/edit fields: name, planId, validDays >0, and at least one product line.
- Each line selects product, optional variant belonging to that product, positive integer quantity, and tax IDs. On product change, clear incompatible variant selection.
- Use adapter lookups even when Athul has not built a UI. Show loading/error/retry for selector fetches and preserve current edits.

### Composer

- Select customer and template (optional), then copy template plan/lines/validDays into a NEW editable draft. Editing it must not mutate the stored template.
- Allow manual plan/line selection. Fields: startDate, optional expiryDate, paymentTermsDays >=0, quotationValidUntil. A supplied template helps prefill validity; server validates the final date.
- Show product/variant labels and indicative read-only prices from lookup data, clearly estimates until server preview. Do not duplicate tax/discount calculation logic.
- Submit `SubscriptionInput` to `.create()`, then `.transition(id, "quote")` as an explicit separate step. Avoid losing the created draft if transition fails: show the saved draft and retry that action rather than create a second subscription.
- Quote list uses `.list({status:"QUOTATION", ...filters})`. Include draft access in the workflow so a user can continue a saved draft.

Acceptance: template selection prefills correctly; copied lines are independent; invalid quantities/variant mismatch cannot submit; saved draft remains accessible; expired quotation errors visible. Commit/push/update or open PR.

## Feature H3: subscription details and action controls

Route `/subscriptions`.

- Search/status filters/pagination; table reference, customer, plan, dates, next billing, stage.
- Detail drawer: unique number, customer, plan, dates, payment terms, lines with quantity/unit price/line subtotal, stage history presentation if backend later provides it.
- Show main path DRAFT -> QUOTATION -> CONFIRMED -> ACTIVE -> CLOSED and optional PAUSED clearly. Closed/paused must not look active.
- Render action controls from `allowedActions` only. Map quote/confirm/activate/pause/resume/renew/close to explicit `.transition()` calls. Confirm potentially disruptive pause/close with a clear dialog.
- Do not calculate next billing dates, authorize transitions, or infer all allowed actions from status. Show server reason for rejected transitions, keep current data, and refresh after success.
- Draft/quotation edits use `.update()`; confirmed/active economics are read-only in MVP. Disable repeat submit while pending.
- Billing estimate opens a separate `.preview(id)` read-only invoice-shaped view with subtotal/discount/tax/total/explanation. It is an estimate, never an issued invoice or a payment request.

Acceptance: filters, detail, allowed actions, disabled pending states, failure preservation, successful refresh when connected, inaccessible record message. Commit/push/update or open PR.

## Feature H4: customer portal

Route `/portal`; Devadathan supplies role-aware shell/session and real account protection.

- Use ONLY `api.portal.subscriptions()` and `.invoices()` for lists. Never accept a customerId selector or show internal customer search.
- Show current account's plan, products/quantities, lifecycle status, next billing, expiry, payment terms, invoice history, total/paid/balance/overdue.
- Offer only owner-permitted self-service actions through `api.portal.transition(id, action)`, driven by allowedActions. Final portal should expose pause/resume/renew/close when permitted; sales workflow actions belong to staff.
- Invoice print/download uses `api.invoices.documentUrl(id)`; Devadathan's document endpoint must authorize the current customer. Do not construct access decisions in the browser. In mock mode show download as unavailable with truthful help text rather than opening a fake document.
- Portal is invoice viewing/self-service, not a new payment gateway integration. Do not add card collection or store payment details.
- Add meaningful empty states and self-service request feedback. No fake role switcher or hardcoded customer name in final connected mode.

Acceptance: mock view limited to Maple fixtures; connected customer A/B isolation tested with Devadathan; actions follow plan policy; document access protected; 390px usable. Commit/push/update or open PR.

## Feature H5: polish and verification

- Consistent labels, keyboard navigation/dialog focus, mobile tables/cards, form error associations, and responsive detail panels.
- Add focused tests for template-copy isolation, resetting invalid variant selections, and meaningful form validation. Keep tests in your owned paths. Test effects/async state only where behavior warrants it.
- Error states must distinguish a saved draft from a failed later transition. Never make a failed action look successful.
- Check session loading/error and customer-vs-internal controls. UI hiding complements, but never replaces, Devadathan's server security.
- Remove starter notes from your implemented screens; preserve global development notice until Devadathan completes integration.

## Handoff

Run `npm run check`; include screenshots of composer, subscription detail, and mobile portal; list verified behaviors and mock-only limitations. Give Devadathan a short sequence to test in HTTP mode. Your branch must remain independent of Athul's and Adrinath's feature code.

Done: all assigned UI flows are implemented via stable shared methods, pushed to `feat/hannath-subscriptions`, and available in a PR to main; no backend, contract, or out-of-boundary changes.
