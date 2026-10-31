# Adrinath: independent finance dashboard, invoices, and payment UI

## Assignment and boundary

You own finance presentation and forms. Devadathan owns calculations, invoice generation, payment settlement, reports, email/documents, permissions, scheduling, and clock simulation. Read `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md`, and `src/lib/contracts.ts` before coding.

Branch: **`feat/adrinath-finance`**, created from latest `main`.

Allowed edits: **`src/features/finance/**` only**, including CSS Modules, local components, and tests. Preserve `DashboardPage`, `InvoicesPage`, and `PaymentsPage` exports in their existing files. Their routes already exist. Do not edit routing, shared types/client/fixtures/primitives, root CSS, dependencies/lockfile, backend, or another member's features.

Your APIs and fixtures exist from the starter. You do not need Athul or Hannath's screens to work. Never import their components or implement backend calculations to unblock yourself.

## Setup and mandatory branch/PR workflow

```powershell
git clone https://github.com/Devadathan69/make-a-ton.git
cd make-a-ton
git config user.name "YOUR REAL NAME"
git config user.email "YOUR GITHUB-LINKED EMAIL"
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/adrinath-finance
npm ci
Copy-Item .env.example .env.local
npm run dev
```

If branch exists, switch to it or `git switch --track origin/feat/adrinath-finance`; never recreate/reset existing work. Default mock mode needs no DB.

After EACH feature F1-F5, run `npm run check`, then:

```powershell
git add src/features/finance
git commit -m "feat(finance): add dashboard date filters and drill-downs"
git push -u origin feat/adrinath-finance
gh pr list --base main --head feat/adrinath-finance --state open
Copy-Item .github/pull_request_template.md .git/pr-body.md
# Fill result/checks/screenshots/limitations for this increment.
gh pr create --base main --head feat/adrinath-finance --title "Finance: dashboard filters and drill-downs" --body-file .git/pr-body.md
```

For an existing open PR use `gh pr edit PR_NUMBER --body-file .git/pr-body.md`; later pushes update its code. Leave the PR open for Devadathan's review. After it merges, fetch and merge `origin/main` into your same member branch, implement the next feature, then open a new PR. Use GitHub web UI if CLI unavailable.

Commit as yourself and push at least once per hour, and immediately after each completed feature. Use a draft checkpoint if unfinished. Devadathan reviews/merges often enough to keep integrated main current; do not merge your own PR unless authorized.

## Shared interfaces and mock limitations

Use `api` and `ApiError` from `@/lib/api`, DTOs from `@/lib/contracts`, formatting from `@/lib/format`, and shared UI primitives. Add your own dialogs/panels within this directory.

- `api.reports.summary({from?,to?})` returns all dashboard values.
- `api.invoices.list(query)`, `.get(id)`, `.action(id,"confirm"|"cancel"|"send")`, `.documentUrl(id)`.
- `api.payments.list(query)`, `.create({invoiceId,amount,method,paidAt,note})`.
- `api.session.get()` returns actor role for controls; backend enforces all actual permissions.
- Amounts are integer paise. Display `formatMoney`; convert typed rupees using `parseMoney` and reject null/zero as appropriate.
- Starter reports are fixed example values. Invoice actions/payment creation intentionally return `NOT_IMPLEMENTED` until backend exists; show that failure clearly. Do not alter shared mock/fixtures, add localStorage settlement, or fabricate successful payment state.
- For focused UI tests, use a locally injected typed fake or a mocked facade within your owned tests. Real money correctness/concurrency belongs to backend integration tests.

## Feature F1: dashboard filters and meaningful summaries

Route `/dashboard`.

1. Add from/to date controls (inclusive), validate order, loading/pending state, refresh/retry, and empty result view. Use `.summary()`; never aggregate a paginated invoice list in the browser.
2. Show active subscriptions, billed in selected period, payments collected in selected period, current outstanding, current overdue, and normalized monthly recurring value.
3. Keep labels precise: billed is invoice total, collected is payment cash, outstanding/overdue are CURRENT balances independent of selected invoice period. MRR is normalized contract value before tax, not cash or recognized revenue.
4. Chart billed/collected by month using returned `monthly`. CSS/SVG is sufficient; no chart dependency. Use a common scale across displayed months, actual legend, accessible text summary, and no invented growth percentages.
5. Attention list uses backend OVERDUE/EXPIRING/BILLING_FAILURE records and supplied hrefs. Show zero-action state. Support drill-down into invoice views with meaningful query filters where practical inside your owned screens.
6. Do not implement clock or billing admin controls here; Devadathan owns shared/admin components for these complex operations.

Acceptance: filters call the API, invalid dates blocked, zero vs loading distinguished, chart data honest, current balances correctly labelled, links usable. Commit/push/PR before F2.

## Feature F2: invoice list and detail

Route `/invoices`.

- Add search/status/date/customer filters, API pagination, and an overdue filter presentation. `InvoiceStatus` has DRAFT/CONFIRMED/PAID/CANCELLED only. OVERDUE and PARTIALLY PAID are derived presentation labels, not new API status values.
- Show invoice number, customer, period, issued/due date, total, paid, remaining balance, lifecycle status, overdue indicator. From/to list filter targets issuedAt. If implementing an overdue-only filter requires a shared contract addition, ask Devadathan; do not filter only one page and claim a complete result.
- Detail drawer calls `.get(id)`: customer, subscription reference, billing period, lines quantity/unit price/subtotal/discount/tax/total, header totals, paid/balance, and explanation array.
- Use server totals verbatim. UI may format and present a reconciliation display, but never generate taxes/discounts or overwrite balances.
- Explain draft vs issued status. Preview/estimate data from subscriptions is not an issued invoice.
- A query such as `/invoices?invoiceId=...` can open a drawer after fetch, using search params inside a Suspense-safe client boundary if needed. Keep existing route wrapper/export stable.

Acceptance: fixture invoice shows ₹9,900 total, ₹4,000 paid, ₹5,900 remaining; details/explanation align; filters/page reset and loading/error/empty states work. Commit/push/update or open PR.

## Feature F3: invoice actions and document controls

- Confirm on DRAFT only. Cancel on unpaid DRAFT/CONFIRMED only, with an explicit confirmation dialog. No cancel on partially/fully paid invoices; backend still validates.
- Send only on appropriate confirmed/paid invoices; prevent repeated pending submits. Report queued/sent status accurately according to server result, never claim an email was delivered merely because a button was clicked.
- Download/print opens `.documentUrl(id)` in a new tab with safe link attributes. The server provides authorized printable HTML; users can save to PDF. Do not create a separate client-computed invoice document with possibly different totals.
- Mock mode has no document implementation: disable document action with clear helper text until HTTP mode. Do not link the mock fallback as a real download.
- On any action failure, preserve details and display `ApiError.message`/fields. On success, refresh detail/list; closing/cancelling a UI dialog must not call the server.

Acceptance: status-aware controls, keyboard dialog/focus, pending protection, meaningful backend-not-ready errors, successful real document/send checks after integration. Commit/push/update or open PR.

## Feature F4: record payments and payment history

Route `/payments`, plus an optional local "Record payment" dialog accessible from your invoice detail.

- History table: invoice, customer, method, amount, paid date, note. Add API search/date pagination. From/to targets paidAt.
- Form selects a confirmed invoice with positive balance, then shows its total/paid/outstanding read-only. Fetch invoice details on selection instead of trusting an old list row.
- Fields: amount in rupees, BANK_TRANSFER/CARD/UPI/CASH/OTHER, paidAt date, note. Convert through `parseMoney`, require positive amount <= currently displayed balance; server is authoritative if concurrent changes occur.
- Submit `.payments.create()` once per user intent; disable pending submission; retain fields on error. Devadathan owns idempotency in the shared transport, not a locally duplicated payment client.
- After success show returned payment reference, refresh payment history and affected invoice detail/list. Refresh dashboard when it next loads or through existing shared refresh support. Do not manually subtract money and invent a new invoice state.
- Partial payment remains CONFIRMED; exact settlement becomes PAID as returned by backend. On overpayment/conflict, explain the new balance and let user correct/retry.
- No card details collection, banking credentials, automatic charge gateway, or payment deletion/editing in MVP.

Acceptance: ₹4,000 then ₹5,900 against ₹9,900 demonstrably settles once in connected mode; zero/negative/overprecision/overbalance inputs blocked; duplicate clicks prevented; backend conflict displayed; no fake mock payment success. Commit/push/update or open PR.

## Feature F5: final polish and verification

- Date/money labels, consistent state badges, accessible validation, keyboard dialogs, mobile tables/cards, empty/error/retry states, and pending states throughout.
- Use common chart scales and clearly label units. Avoid decorative graphs with fictional history.
- Add focused tests for payment amount validation, partial-vs-paid presentation, and pending/error behaviors where meaningful. Keep tests in your own directory and do not test static table headings alone.
- Preserve API contracts. If an endpoint is unfinished, list it in PR limitations and keep the UI truthful instead of substituting local business behavior.
- Remove your completed screens' starter notes; global starter banner is Devadathan's integration responsibility.

## Handoff

Run `npm run check`. Include screenshots for dashboard, invoice explanation, payment form, and 390px layout; list mock limitations and the connected test sequence. Coordinate a real HTTP-mode verification with Devadathan after endpoints land, without depending on another feature branch.

Done: finance interface completed using shared DTOs/methods, no browser financial authority or out-of-boundary edits, code pushed to `feat/adrinath-finance`, and PR to main available for review.
