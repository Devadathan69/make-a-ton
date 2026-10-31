import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env.local or the environment first");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(809031)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const sql = await readFile(`db/migrations/${name}`, "utf8");
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
} finally {
  await client.query("SELECT pg_advisory_unlock(809031)").catch(() => {});
  await client.end();
}
