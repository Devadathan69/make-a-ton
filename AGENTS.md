# LoopLedger agent instructions

Read `docs/IMPLEMENTATION_PLAN.md` and the assigned member's document before editing.
This repository is a runnable starter, not a finished subscription system.

## Ownership and boundaries

- Devadathan: `src/server/**`, `src/features/auth/**`, `src/app/**`, `src/components/**`, `src/lib/**`, `db/**`, `scripts/**`, root config, deployment, integration.
- Athul: `src/features/catalog/**` only.
- Hannath: `src/features/subscriptions/**` and `src/features/portal/**` only.
- Adrinath: `src/features/finance/**` only.
- Tests and CSS Modules go inside the owner's feature directory.
- Existing route wrapper exports are fixed. Keep their exported feature component names.
- Import types from `src/lib/contracts.ts` and data methods from `src/lib/api/index.ts`.
- Do not add a second API client, a second source of business truth, or direct fixture imports to feature UI.
- Shared-file changes require coordination with Devadathan. Continue independent feature work while that change is integrated.
- No new dependency or lockfile changes by the three feature owners; use existing React, CSS Modules, shared primitives, and browser APIs.
- Do not spawn subagents unless the human explicitly requests delegation in that task.

## Contribution workflow

- Start your documented branch from the latest `origin/main`.
- Set your own Git author identity locally; never impersonate a teammate.
- Commit and push after each finished feature and at least once per hour while working.
- Open a PR to `main` after the first feature; later feature pushes update the open PR.
- Leave PRs open for Devadathan's review. Do not merge your own work unless explicitly authorized.
- If a PR has been merged, update the same member branch from `origin/main`, add the next feature, and open a new PR.
- Devadathan reviews and merges tested work frequently so latest integrated code reaches `main` within each hourly checkpoint.
- Never force-push `main`, fabricate contribution commits, or commit secrets, PDFs, videos, build outputs, or private data.

## Quality and integration

- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before marking a feature ready.
- Add focused tests for business invariants or meaningful interactive behavior; avoid tests that merely mirror static markup.
- Money uses integer paise, rates use basis points, date-only fields use `YYYY-MM-DD`.
- Real permissions, pricing, tax/discount rules, payment balances, and lifecycle validation belong on the server.
- The mock adapter is tab-local, not authenticated, and intentionally returns `NOT_IMPLEMENTED` for billing/payment/transition actions.
- Catch and display these errors; do not fake a successful charge or persist real business data in browser storage.
- HTTP mode must fail visibly on backend errors; never silently fall back to fixtures.
- Use accessible labels, keyboard controls, responsive layouts, and visible loading/empty/error states.
- For Next.js APIs, consult the installed version's documentation. Use App Router conventions and do not add Pages Router files.
