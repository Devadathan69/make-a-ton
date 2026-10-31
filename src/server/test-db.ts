import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate } from '../../scripts/migrate.mjs';
import { getPool } from './db';
export async function isolatedDatabase() {
  const url=new URL(process.env.DB_TEST_URL!);
  if(!/test|demo/.test(url.pathname)) throw new Error('Connected tests require a disposable test/demo database');
  const root=new pg.Client({connectionString:url.toString()});await root.connect();
  const schema=`test_${randomUUID().replaceAll('-','')}`;
  await root.query(`CREATE SCHEMA ${schema}`);await root.query(`SET search_path TO ${schema}`);await migrate(root);
  url.searchParams.set('options',`-c search_path=${schema}`);
  process.env.DATABASE_URL=url.toString();
  return {db:root,async close(){await getPool().end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}};
}
