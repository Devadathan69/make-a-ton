import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { migrate } from '../../scripts/migrate.mjs';

const url = process.env.DB_TEST_URL;
if (url && !/test|demo/.test(new URL(url).pathname)) throw new Error("Migration tests require a disposable demo/test database");
// This suite creates an isolated schema, never drops an existing application schema.
describe.skipIf(!url)('connected PostgreSQL migrations', () => {
  const schema=`test_${crypto.randomUUID().replaceAll('-','')}`;
  const client=new pg.Client({connectionString:url});
  beforeAll(async()=>{await client.connect();await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);});
  afterAll(async()=>{await client.query(`DROP SCHEMA ${schema} CASCADE`);await client.end();});
  it('migrates, safely reruns, and detects changed applied files',async()=>{
    await migrate(client);await migrate(client);
    expect((await client.query('SELECT count(*) FROM schema_migrations')).rows[0].count).toBe(String((await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).length));
    const dir=await mkdtemp(`${tmpdir()}/loopledger-migration-`);
    try {
      await writeFile(`${dir}/001_foundation.sql`,(await readFile('db/migrations/001_foundation.sql','utf8'))+'\n-- changed');
      await expect(migrate(client,dir)).rejects.toThrow('Applied migration changed');
    } finally {await rm(dir,{recursive:true});}
  });
  it('rolls back the complete failing migration, and allows a corrected retry',async()=>{
    const dir=await mkdtemp(`${tmpdir()}/loopledger-migration-`);
    try {
      await writeFile(`${dir}/999_test.sql`,'CREATE TABLE rollback_probe(id int); SELECT missing_column;');
      await expect(migrate(client,dir)).rejects.toThrow();
      expect((await client.query("SELECT to_regclass('rollback_probe') name")).rows[0].name).toBe(null);
      await writeFile(`${dir}/999_test.sql`,'CREATE TABLE rollback_probe(id int);');
      await migrate(client,dir);
      expect((await client.query("SELECT to_regclass('rollback_probe') name")).rows[0].name).toBe('rollback_probe');
    } finally {await rm(dir,{recursive:true});}
  });
});
