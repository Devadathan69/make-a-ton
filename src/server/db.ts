import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// pg's default DATE parser uses the machine timezone. Business dates must not.
types.setTypeParser(1082, (value) => value);

let pool: Pool | undefined;
/** Server imports only. Lazy creation keeps the mock starter database-free. */
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the connected backend");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}

export type Db = Pick<PoolClient, "query">;
export async function transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
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
