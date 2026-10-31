import { Pool } from "pg";

let pool: Pool | undefined;
/** Server imports only. Lazy creation keeps the mock starter database-free. */
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the connected backend");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}
