import { attachDatabasePool } from "@vercel/functions";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// pg's default DATE parser uses the machine timezone. Business dates must not.
types.setTypeParser(1082, (value) => value);

let pool: Pool | undefined;
/** Server imports only. Lazy creation keeps the mock starter database-free. */
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the connected backend");
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 5000 });
    // Prevent idle connection loss (for example compute suspension) crashing the process.
    pool.on("error", () => {});
    if (process.env.VERCEL) attachDatabasePool(pool);
  }
  return pool;
}

export type Db = Pick<PoolClient, "query">;
export async function transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    // Transaction-local settings work through transaction-pooling endpoints.
    await db.query("SET LOCAL statement_timeout = '15s'; SET LOCAL lock_timeout = '5s'");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
}
export async function one<T extends QueryResultRow>(db: Db, sql: string, values: unknown[] = []): Promise<T | undefined> {
  return (await db.query<T>(sql, values)).rows[0];
}
