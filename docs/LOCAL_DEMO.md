# Run the connected recording demo

Use the hosted HTTPS URL once the parent verifies it. This cloud workspace's localhost is not a public link. Email delivery may remain disabled; queued messages are not sent messages. Do not use mock mode for the recording.

## Clean checkout

Install Node 24 and Git. Open PowerShell 7 or a terminal:

```text
git clone https://github.com/Devadathan69/make-a-ton.git
cd make-a-ton
git fetch origin
git switch main
git pull --ff-only origin main
npm ci
```

Use the exact verified main commit supplied in the final handoff. If already checked out, preserve any uncommitted work before switching. No dependency beyond the lockfile is needed at runtime.

## Local PostgreSQL with Docker

Run the following in one PowerShell window. Passwords are read privately; do not paste them into chat, source files, video, or terminal history.

```powershell
$env:POSTGRES_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Choose private local database password' -AsSecureString)).Password
docker compose up -d db
docker compose exec db pg_isready -U loopledger -d loopledger_demo
$env:DATABASE_URL = "postgresql://loopledger:$([uri]::EscapeDataString($env:POSTGRES_PASSWORD))@127.0.0.1:5432/loopledger_demo"
$env:MIGRATION_DATABASE_URL = $env:DATABASE_URL
$env:DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Choose synthetic demo account password (minimum 9, uppercase, lowercase, special)' -AsSecureString)).Password
$env:NEXT_PUBLIC_DATA_MODE = 'http'
$env:APP_URL = 'http://localhost:3000'
$env:ENABLE_DEMO_SEED = 'true'
$env:ENABLE_DEMO_CLOCK = 'true'
$env:DEMO_DATABASE_NAME = 'loopledger_demo'
$env:EMAIL_DELIVERY_ENABLED = 'false'
npm run db:migrate
npm run db:seed
npm run build
npm start
```

Wait for PostgreSQL readiness before migrations. The Compose database binds loopback and uses its own named volume. Retain the same private DB password when reusing that volume. Repeated seed/migration commands preserve existing records and passwords. Do not delete volumes or reset data to fix a connection error. A port conflict requires a free local port and corresponding DATABASE_URL change.

For Bash, export the same environment names; use a private password prompt and percent-encode the DB password in the URL. Never print the URL. Open http://localhost:3000. Both NEXT_PUBLIC_DATA_MODE at build time and runtime must be http. The app must show Connected API and SIMULATION.

Synthetic logins all use the privately supplied DEMO_PASSWORD: admin@example.test, staff@example.test, ananya@example.test (Maple Studio), arjun@example.test (Northstar Labs). These are fictitious addresses. Business customers created in the customer screen do not automatically get login accounts.

## Without Docker

Use a PostgreSQL 17 installation already available on the teammate's machine. Create a NEW isolated database named loopledger_demo with the local PostgreSQL administrator's normal tools (`createdb` or pgAdmin). Supply its private connection URL as DATABASE_URL and MIGRATION_DATABASE_URL, then follow the environment/migrate/seed/build/start steps above. Do not run tests or seeding on a real business database.

If no PostgreSQL installation is available, use the verified hosted app; do not spend the recording window installing an unverified stack. A hosted database with a local app is also possible after parent approval, but use the guarded hosted bootstrap described below, not the loopback seed.

## Hosted setup — parent/operator only

The parent owns the approved Vercel project, isolated Neon branch/database, connection grants and private configuration. Required runtime names: DATABASE_URL, APP_URL, NEXT_PUBLIC_DATA_MODE=http. Demo names: ENABLE_DEMO_CLOCK=true, DEMO_DATABASE_NAME=loopledger_demo. Optional approved names: OUTBOX_ENCRYPTION_KEY, CRON_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, EMAIL_DELIVERY_ENABLED. Leave delivery false until actual sender/SMTP acceptance is verified. NEXT_PUBLIC names must never contain secrets.

Use a private direct/unpooled MIGRATION_DATABASE_URL for one-off migrations. Runtime DATABASE_URL may be pooled. After separate approval of synthetic account credentials and this exact isolated target, the operator can run `npm run demo:bootstrap` from the source checkout with MIGRATION_DATABASE_URL, DEMO_PASSWORD, ALLOW_REMOTE_DEMO_BOOTSTRAP=true, and CONFIRM_DEMO_HOST equal to the verified direct Neon hostname. The guarded command only accepts the named loopledger_demo database on that exact direct Neon host. It migrates and inserts fictitious seed records without resetting existing data or passwords; it does not send email. This child has not run it remotely.

If the parent applied and verified schema 001–005 directly through Neon MCP without schema_migrations history, do not rerun foundation DDL. Use db/demo_seed.template.sql instead (regenerate with node scripts/export-demo-seed.mjs). This is a pure payload generator, with no DB connection and no usable password/hash in its artifact. Parent privately computes a salted scrypt hash using scripts/password.mjs after approval, replaces the four named __APPROVED_ADMIN/STAFF/MAPLE/NORTH_SCRYPT_HASH_SQL_LITERAL__ markers with each corresponding private hash SQL literal in memory, and executes the complete BEGIN/COMMIT payload against the approved loopledger_demo database. For a Neon MCP transaction tool, db/demo_seed.transaction.json provides the ordered statements without BEGIN/COMMIT; pass them together through one transaction after substituting the four corresponding markers privately. Regenerate it with node scripts/export-demo-seed.mjs --json. Do not split SQL on semicolons inside DO blocks. The payload checks the actual database name and hash shape, takes a transaction lock, and uses ON CONFLICT DO NOTHING; repeated execution preserves existing data/passwords. Do not publish the substituted SQL. The four markers map to user_admin, user_staff, user_maple (Ananya), and user_north (Arjun). Hash format is scrypt$32-hex-salt$128-hex-digest, generated by scripts/password.mjs. This child has only tested that payload against an isolated loopback PostgreSQL database.

Do not run seed, migrations or account creation in a Vercel build. Deploy tracked source at the final verified commit. `npm run deploy:manifest` prints file paths, byte sizes and SHA256 hashes, excluding .env files, .git, dependencies and output. `vercel.example.json` is inert; scheduling is a separate approved setup step. See VERCEL_NEON.md for daily cron and catch-up limitations.

## Recording readiness

- `/api/health` returns ok and HTTP mode; `/api/ready` returns ready true.
- Sign in with each synthetic role. Staff cannot write catalog or open operations; customers see only their portal.
- Use a fresh isolated demo whose effective date is 2026-10-31 for the supplied October-discount scenario. Before recording, verify the seeded invoice is ₹9,900 total, ₹4,000 paid, ₹5,900 balance.
- Do not add the 5,000-row performance seed to the recording database. It creates an avoidable backlog. Performance tests use a separate database.
- Advancing the demo date is forward-only. Rehearse in a separate disposable database/branch. Do not run regression QA against the recording database.
- Keep a prepared admin tab and separate private customer browser session. Hide terminals, passwords and provider dashboards from the video.
- Save/print is authorized HTML opened by the browser; Save as PDF is a browser print option. Actual SMTP and hosted scheduling remain separate acceptance gates until verified.

## Verification commands

`DB_TEST_URL` must be a disposable direct PostgreSQL demo/test database, never the hosted recording DB. `npm run check` runs lint/types/domain and connected tests/build. The cloud browser scripts require an installed Playwright module and Chromium supplied via PLAYWRIGHT_MODULE_PATH and CHROMIUM_PATH; they are not app runtime dependencies. `npm run qa:integration` is loopback-only and requires a fresh 2026-10-31 seed. It intentionally creates synthetic records, records payments, injects dropped responses and advances the clock. Evidence is written under ignored output/demo-qa.
