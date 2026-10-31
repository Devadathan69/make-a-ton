import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { BillingInterval } from '@/lib/contracts';
import { isolatedDatabase } from '../test-db';
import { reportSummary } from '../reports';
import { runDueBilling } from './worker';

describe.skipIf(!process.env.DB_TEST_URL)('transactional recurring billing',()=>{
  let fixture:Awaited<ReturnType<typeof isolatedDatabase>>;
  const p={name:'Monthly',price:0,interval:'MONTHLY',autoClose:true,allowEarlyClose:true,allowPause:true,allowRenew:true,taxes:[]};
  beforeAll(async()=>{fixture=await isolatedDatabase();});afterAll(async()=>fixture.close());
  beforeEach(async()=>{
    await fixture.db.query('TRUNCATE outbox_messages,customers,products,plans,discounts,subscriptions,invoices,billing_runs CASCADE');
    await fixture.db.query("INSERT INTO customers(id,name,email,company) VALUES('c','Demo','demo@example.test','Demo'); INSERT INTO products(id,name,type,sales_price,cost_price) VALUES('p','Workspace','SOFTWARE',100000,0); INSERT INTO plans(id,name,price,interval,minimum_quantity,available_from) VALUES('plan','Monthly',0,'MONTHLY',1,'2020-01-01')");
  });
  async function subscription(id:string,interval:BillingInterval='MONTHLY',start='2026-01-31',expiry:string|null=null,status='ACTIVE',autoClose=true) {
    await fixture.db.query('INSERT INTO subscriptions(id,number,customer_id,plan_id,status,start_date,cycle_anchor,next_billing_date,expiry_date,payment_terms_days,plan_snapshot) VALUES($1,$1,\'c\',\'plan\',$2,$3,$3,$4,$5,14,$6)',[id,status,start,status==='ACTIVE'?start:null,expiry,{...p,interval,autoClose}]);
    await fixture.db.query("INSERT INTO subscription_lines(id,subscription_id,product_id,description,quantity,unit_price,tax_ids,tax_snapshot) VALUES($1,$2,'p','Workspace',1,100000,'[]','[]')",[`line_${id}`,id]);
  }
  async function discount(){await fixture.db.query("INSERT INTO discounts(id,name,kind,value,scope,minimum_quantity,starts_at,usage_limit) VALUES('limited','One use','FIXED',1000,'SUBSCRIPTION',1,'2020-01-01',1)");}
  it('catches up missed monthly periods and repeated/concurrent workers do not duplicate',async()=>{
    await subscription('s');const results=await Promise.all([runDueBilling('2026-03-31'),runDueBilling('2026-03-31')]);
    expect(results.reduce((n,r)=>n+r.generated,0)).toBe(3);
    expect((await fixture.db.query('SELECT period_start::text,period_end::text FROM invoices ORDER BY period_start')).rows).toEqual([{period_start:'2026-01-31',period_end:'2026-02-28'},{period_start:'2026-02-28',period_end:'2026-03-31'},{period_start:'2026-03-31',period_end:'2026-04-30'}]);
    expect((await runDueBilling('2026-03-31')).generated).toBe(0);
    await fixture.db.query("UPDATE invoices SET status='CANCELLED'; UPDATE subscriptions SET next_billing_date='2026-01-31'");
    expect((await runDueBilling('2026-01-31')).skipped).toBe(1);expect((await fixture.db.query('SELECT count(*) FROM invoices')).rows[0].count).toBe('3');
  });
  it('globally reserves the last discount use exactly once across concurrent subscriptions',async()=>{
    await subscription('a');await subscription('b');await discount();
    const results=await Promise.all([runDueBilling('2026-01-31'),runDueBilling('2026-01-31')]);expect(results.reduce((n,r)=>n+r.generated,0)).toBe(2);
    expect((await fixture.db.query('SELECT usage_count FROM discounts')).rows[0].usage_count).toBe(1);
    expect((await fixture.db.query('SELECT discount::text FROM invoices ORDER BY discount')).rows.map(r=>r.discount)).toEqual(['0','1000']);
    expect((await fixture.db.query('SELECT count(*) FROM discount_redemptions')).rows[0].count).toBe('1');
  });
  it('rolls back invoice, usage and due date after failure, then retries successfully',async()=>{
    await subscription('s');await discount();
    await fixture.db.query("CREATE FUNCTION fail_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER inject_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_line()");
    const failed=await runDueBilling('2026-01-31');expect(failed.failed).toBe(1);expect(failed.generated).toBe(0);
    expect((await fixture.db.query('SELECT count(*) FROM invoices')).rows[0].count).toBe('0');expect((await fixture.db.query('SELECT usage_count FROM discounts')).rows[0].usage_count).toBe(0);
    expect((await fixture.db.query('SELECT next_billing_date::text FROM subscriptions')).rows[0].next_billing_date).toBe('2026-01-31');
    await fixture.db.query('DROP TRIGGER inject_failure ON audit_events; DROP FUNCTION fail_line()');
    expect((await runDueBilling('2026-01-31')).generated).toBe(1);expect((await fixture.db.query('SELECT resolved_at FROM billing_failures')).rows[0].resolved_at).not.toBe(null);
  });
  it('activates future confirmed contracts only when due, then closes or pauses at expiry without skipping catch-up',async()=>{
    await subscription('future','MONTHLY','2026-01-31','2026-03-31','CONFIRMED');
    expect((await runDueBilling('2026-01-30')).generated).toBe(0);
    expect((await runDueBilling('2026-04-30')).generated).toBe(2);expect((await fixture.db.query("SELECT status FROM subscriptions WHERE id='future'")).rows[0].status).toBe('CLOSED');
    await subscription('pause_at_expiry','MONTHLY','2026-01-31','2026-02-28','ACTIVE',false);
    expect((await runDueBilling('2026-03-31')).generated).toBe(1);expect((await fixture.db.query("SELECT status FROM subscriptions WHERE id='pause_at_expiry'")).rows[0].status).toBe('PAUSED');
    await subscription('paused','DAILY','2026-01-01',null,'PAUSED');await subscription('closed','DAILY','2026-01-01',null,'CLOSED');expect((await runDueBilling('2026-03-31')).generated).toBe(0);
  });
  it('supports all four intervals and keeps oversized catch-up due for the next bounded batch',async()=>{
    for(const interval of ['DAILY','WEEKLY','MONTHLY','YEARLY'] as const)await subscription(interval,interval);
    expect((await runDueBilling('2026-01-31')).generated).toBe(4);
    const rows=(await fixture.db.query('SELECT id,next_billing_date::text FROM subscriptions ORDER BY id')).rows;
    expect(rows).toEqual([{id:'DAILY',next_billing_date:'2026-02-01'},{id:'MONTHLY',next_billing_date:'2026-02-28'},{id:'WEEKLY',next_billing_date:'2026-02-07'},{id:'YEARLY',next_billing_date:'2027-01-31'}]);
    expect((await runDueBilling('2026-05-31',2)).generated).toBe(2);
    expect((await fixture.db.query("SELECT count(*) FROM subscriptions WHERE next_billing_date<='2026-05-31'")).rows[0].count).not.toBe('0');
  });
  it('rounds normalized recurring value once across all four interval aggregates',async()=>{
    for(const interval of ['DAILY','WEEKLY','MONTHLY','YEARLY'] as const)await subscription(interval,interval);
    await fixture.db.query('UPDATE subscription_lines SET unit_price=1');
    const report=await reportSummary();expect(report.activeSubscriptions).toBe(4);expect(report.mrr).toBe(36);
  });

});
