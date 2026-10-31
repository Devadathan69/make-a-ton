import { existsSync } from 'node:fs';
import pg from 'pg';
import { seedDemo } from './seed-data.mjs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (process.env.ENABLE_DEMO_SEED !== 'true' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !/demo|test/.test(url.pathname)) {
  throw new Error('Seed requires ENABLE_DEMO_SEED=true and a loopback demo/test database. No reset is performed.');
}
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 9 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) throw new Error('Supply a compliant DEMO_PASSWORD through the environment');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await seedDemo(client, password, {performance:process.argv.includes('--performance')});
} finally { await client.end(); }
