# Athul: independent catalog and rule configuration UI

## Assignment and boundary

You own the comparatively simpler catalog interface. Devadathan owns persistence, security, calculations, and rule execution. Read `AGENTS.md` and `docs/IMPLEMENTATION_PLAN.md` first, then this document and `src/lib/contracts.ts`.

Branch: **`feat/athul-catalog`**, created from latest `main`.

Allowed edits: **`src/features/catalog/**` only**, including CSS Modules, local components, and tests. Preserve these exports/files: `ProductsPage` in `products-page.tsx`, `PlansPage` in `plans-page.tsx`, `RulesPage` in `rules-page.tsx`. Route wrappers already exist. Do not modify `src/app`, shared types/client/fixtures/primitives, root CSS, dependencies, lockfile, database, or another member's files.

Your work depends only on the starter API contract, so start immediately. Never wait for Hannath or Adrinath, import their components, or implement your own API/backend. If a shared contract truly needs extension, give Devadathan the exact request and continue unrelated UI work.

## Setup, push after each feature, and PR workflow

```powershell
git clone https://github.com/Devadathan69/make-a-ton.git
cd make-a-ton
git config user.name "YOUR REAL NAME"
git config user.email "YOUR GITHUB-LINKED EMAIL"
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/athul-catalog
npm ci
Copy-Item .env.example .env.local
npm run dev
```

If branch already exists, switch to the local branch or `git switch --track origin/feat/athul-catalog`; do not recreate/reset it. Work uses `NEXT_PUBLIC_DATA_MODE=mock`; no DB is required.

After EVERY feature below, run `npm run check`, then:

```powershell
git add src/features/catalog
git commit -m "feat(catalog): add product editor with variants"
git push -u origin feat/athul-catalog
gh pr list --base main --head feat/athul-catalog --state open
Copy-Item .github/pull_request_template.md .git/pr-body.md
# Fill the body with this feature's behavior, checks, screenshots, and limitations.
gh pr create --base main --head feat/athul-catalog --title "Catalog: product editor and variants" --body-file .git/pr-body.md
```

If a PR already exists, update it with `gh pr edit PR_NUMBER --body-file .git/pr-body.md`; pushing updates its code. Leave it open for Devadathan. After every later feature, push again and update/open the PR. If merged, fetch and merge `origin/main` into your same member branch before the next feature, then open a new PR. Use the GitHub website if CLI is unavailable.

Push your own commits at least once per hour, even if a draft checkpoint is needed. Devadathan merges reviewed work frequently so main stays current. Do not merge your PR or impersonate another member. Stage only owned files.

## Shared tools and data

```typescript
import { api, ApiError } from "@/lib/api";
import type { ProductInput, PlanInput, TaxInput, DiscountInput } from "@/lib/contracts";
import { formatMoney, parseMoney } from "@/lib/format";
```

Use shared `PageHeader`, `Panel`, `Table`, `Badge`, and `ResourceState` where useful. Add local dialogs/form controls in your own directory. `useResource` is available; parameterized loaders must be stable via `useCallback`, and mutations should trigger a refreshed list.

- Catalog APIs: `products`, `plans`, `taxes`, `discounts`, each `.list(query)`, `.get(id)`, `.create(input)`, `.update(id, patch)`.
- `api.session.get()` supplies role. Show write controls only for ADMIN; backend still enforces permissions. Loading/error session state must not expose admin forms.
- Mock CRUD supports browser-memory development, resets on reload, and is not security or final backend evidence. Mock report values do not update from your edits.
- UI input rupees -> integer paise through `parseMoney`; never send a formatted currency string. Rates entered as percentages -> integer basis points (10% = 1000).
- Display field errors from `ApiError.fields` and clear success/failure feedback. Preserve entered values when a request fails; disable submit while pending.

## Feature A1: product catalog and variant editor

Route: `/catalog/products`.

1. Add search and paginated table with name/type/sales price/cost price/variant count/active state. Filtering resets page to 1; total and navigation reflect the API result.
2. Add create/edit dialog with name, SOFTWARE/SERVICE/ADDON, sales price, cost price, notes, active flag.
3. Add/remove variant rows within a new/edit form: name and nonnegative price adjustment. Preserve IDs of existing variants. Do not silently replace all variant IDs on edit.
4. Validate required name/type, nonnegative safe amounts, distinct nonempty variant names. Initial product can have zero variants. Do not require sales price >= cost price; the brief does not mandate that constraint.
5. Explain an adjustment as added to product unit price. Example: Odoo +₹560 means payload `priceAdjustment: 56000`.
6. Editing/deactivation uses update; no hard delete controls. Persist through API and refresh on success; close/cancel dialog must not modify records.

Acceptance: create product, edit fields, add a variant, display adjusted-price context, search, next/previous page, empty/error/retry states, keyboard-accessible dialog. Commit/push/PR this feature before starting A2.

## Feature A2: plan editor and policy controls

Route: `/catalog/plans`.

- Table: name, base fee/cycle, interval, minimum quantity, availability, active state, policy summary.
- Form: name, nonnegative base fee, DAILY/WEEKLY/MONTHLY/YEARLY, minimumQuantity >=1, availableFrom, optional availableUntil, base-fee tax selection, active flag.
- Switches: autoClose, allowEarlyClose, allowPause, allowRenew. Use labels explaining the customer action each permits.
- Base fee is charged once per cycle IN ADDITION TO product lines. It can be zero. Do not multiply the base fee by seat quantity.
- Validate date order; optional end date submits null. Tax IDs come from `api.taxes.list()`; keep selected existing IDs, show unavailable/inactive references clearly on edit.
- Plan availability controls new signups, not the expiry of existing subscriptions. Do not conflate the two dates or implement lifecycle logic here.

Acceptance: all four intervals selectable, zero fee accepted, reversed dates/zero quantity rejected, policies survive round-trip through adapter, STAFF sees read-only controls. Commit/push/update or open PR.

## Feature A3: tax-rule form

Route: `/catalog/rules`, tax section.

- Show name, percentage, active state. Add create/edit dialog for name, percentage 0..100, active flag.
- Convert 10.25% to 1025 basis points exactly, with at most two decimal places. Reject invalid or overprecise input rather than float-round silently.
- Preserve distinction between configured tax and legal tax advice. Sample rule name explicitly says illustrative.
- Admin-only controls; STAFF read-only. Do not implement tax calculation or statutory lookup.

Acceptance: 0%, 10.25%, and 100% accepted; negative/100.01% rejected; errors/success states visible. Commit/push/update or open PR.

## Feature A4: discount-rule form

Same route, separate discount section.

- Fields: name, FIXED/PERCENTAGE kind, amount/percentage, PRODUCT/SUBSCRIPTION scope, selected product IDs for PRODUCT, minimum purchase, minimum quantity, start, optional end, optional usage limit, active flag.
- Fixed amounts and minimum purchase use paise; percentage uses basis points. Changing kind resets/revalidates the value so rupees cannot be misread as a percentage.
- PRODUCT requires at least one product; SUBSCRIPTION submits empty productIds. Load options from `api.products`, not Athul-specific state or another feature.
- Minimum purchase >=0; minimum quantity >=1; end >= start; usage limit null for unlimited, otherwise positive integer. Display usageCount read-only; never send it as editable input.
- Show eligibility/date/remaining-use information in the list or detail. Explain that application on a future invoice is automatic; do not apply discounts or mutate usage in the UI.

Acceptance: fixed/percent modes, scope switching, selected products, optional dates/cap, thresholds, validation, and read-only usage all work through the typed adapter. Commit/push/update or open PR.

## Feature A5: polish and verification

- Search/filters/pagination, loading/empty/error/retry, pending submit, inline field errors, and confirmation feedback across all three screens.
- Accessible field labels, error associations, keyboard dialog close/focus return, and usable layouts at 390px and 1440px widths. Prefer a drawer/dialog over new routes.
- Add focused tests for amount/percentage conversion and nontrivial form validation inside `src/features/catalog`. Do not add tests that merely assert static headings.
- Keep backend amounts/rules authoritative. Do not add localStorage business persistence or pretend an unavailable backend operation succeeded.
- Preserve starter notes until your assigned UI is implemented; replace with accurate help text. Devadathan removes global starter mode after integration.

## Ready-for-review evidence

Run `npm run check`. Include desktop/mobile screenshots, feature list, tested invalid inputs, fixture-mode limitations, and any needed shared changes in the PR. Later verify the same screens in HTTP mode when Devadathan supplies endpoints; do not change your client calls to work around a broken backend contract.

Done: product/variant, plan, tax, and discount UIs operate via the shared facade; all work is pushed to `feat/athul-catalog`; a PR to main remains available for review; no out-of-boundary files changed.
