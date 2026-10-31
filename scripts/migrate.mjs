import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

/** @param {Record<string, string | undefined>} [env] */
export function migrationConnectionString(env = process.env) {
  const value = env.MIGRATION_DATABASE_URL || env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!value) throw new Error('Set MIGRATION_DATABASE_URL (direct/unpooled) first');
  if (new URL(value).hostname.includes('-pooler')) throw new Error('Migrations use session advisory locks. Supply a direct/unpooled MIGRATION_DATABASE_URL; a pooler URL is not supported.');
  return value;
}
export async function migrate(client, directory = "db/migrations") {
try {
  await client.query("SELECT pg_advisory_lock(809031)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const sql = await readFile(`${directory}/${name}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query("SELECT checksum FROM schema_migrations WHERE name=$1", [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}. Add a new migration instead.`);
      console.log(`Already applied: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)", [name, checksum]);
      await client.query("COMMIT");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally { await client.query("SELECT pg_advisory_unlock(809031)").catch(() => {}); }
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const client = new pg.Client({ connectionString: migrationConnectionString() });
  await client.connect();
  try { await migrate(client); } finally { await client.end(); }
}
