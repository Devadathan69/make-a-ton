import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Product, Plan, TaxRule, Customer, QuoteTemplate, Subscription } from '@/lib/contracts';
import { getPool } from './db';
import { isolatedDatabase } from './test-db';
import { runDueBilling } from './billing/worker';
import { deliverOutbox } from './outbox';
import { handle } from './router';
import { digest } from './auth';

describe.skipIf(!process.env.DB_TEST_URL)('connected domain workflow',()=>{
  let fixture:Awaited<ReturnType<typeof isolatedDatabase>>;
  let product:Product,plan:Plan,tax:TaxRule,customer:Customer,template:QuoteTemplate;
  let subscription:Subscription;
  let invoiceId:string;
  const token='a'.repeat(64),cookie=`ll_session=${token}`;
  const call=async(path:string,method='GET',input?:unknown,session=cookie,headers:Record<string,string>={})=>handle(new Request(`http://localhost:3000/api/v1/${path}`,{method,headers:{origin:'http://localhost:3000','Content-Type':'application/json','X-LoopLedger-CSRF':'1',cookie:session,...headers},...(input===undefined?{}:{body:JSON.stringify(input)})}),path.split('?')[0].split('/'));
  async function create<T>(path:string,input:unknown):Promise<T>{const res=await call(path,'POST',input);expect(res.status,await res.clone().text()).toBe(201);return res.json();}
  beforeAll(async()=>{
    fixture=await isolatedDatabase();process.env.APP_URL='http://localhost:3000';process.env.ENABLE_DEMO_CLOCK='true';process.env.DEMO_DATABASE_NAME=new URL(process.env.DATABASE_URL!).pathname.slice(1);await fixture.db.query("INSERT INTO demo_clock(as_of) VALUES('2026-10-01')");
    await fixture.db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('admin','Admin','admin@example.test','unused','ADMIN')");
    await fixture.db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'admin',now()+interval '1 day')",[digest(token)]);
  });
  afterAll(async()=>fixture.close());
  it('persists catalog and validates references and pagination before returning DTOs',async()=>{
    tax=await create('taxes',{name:'Demo tax',rateBps:1000,active:true});
    product=await create('products',{name:'Workspace',type:'SOFTWARE',salesPrice:100000,costPrice:1000,notes:'Test',active:true,variants:[{name:'Odoo',priceAdjustment:56000}]});
    plan=await create('plans',{name:'Monthly',price:0,interval:'MONTHLY',minimumQuantity:1,availableFrom:'2020-01-01',availableUntil:null,autoClose:true,allowEarlyClose:true,allowPause:true,allowRenew:true,active:true,taxIds:[]});
    customer=await create('customers',{name:'Ananya',email:'a@example.test',company:'Maple',address:'Test street'});
    template=await create('templates',{name:'10 seats',planId:plan.id,validDays:14,lines:[{productId:product.id,variantId:null,quantity:10,taxIds:[tax.id]}]});
    expect(template.lines[0].quantity).toBe(10);
    expect(product.variants[0].priceAdjustment).toBe(56000);
    expect((await (await call(`products/${product.id}`)).json()).salesPrice).toBe(100000);
    const invalid=await call('templates','POST',{name:'Bad',planId:plan.id,validDays:1,lines:[{productId:product.id,variantId:'not-parented',quantity:1,taxIds:[]}]});
    expect(invalid.status).toBe(422);expect((await invalid.json()).error.fields).toHaveProperty('lines.variantId');
    expect((await call('products?pageSize=101')).status).toBe(400);
    expect((await call('templates','POST',{name:'Repeated tax',planId:plan.id,validDays:1,lines:[{productId:product.id,variantId:null,quantity:1,taxIds:[tax.id,tax.id]}]})).status).toBe(400);
    const page=await (await call('products?search=Workspace&page=2&pageSize=1')).json();expect(page.total).toBe(1);expect(page.items).toEqual([]);
    expect((await call(`discounts`,'POST',{name:'Wrong',kind:'PERCENTAGE',value:10001,scope:'SUBSCRIPTION',productIds:[],minimumPurchase:0,minimumQuantity:1,startsAt:'2026-01-01',endsAt:null,usageLimit:null,active:true})).status).toBe(400);
  });


  it('filters audit creation timestamps by Asia/Kolkata calendar boundaries',async()=>{
    const times=['2026-10-30T18:29:59Z','2026-10-30T18:30:00Z','2026-10-31T18:29:59Z','2026-10-31T18:30:00Z'];
    for(let n=0;n<times.length;n++)await fixture.db.query('INSERT INTO customers(id,name,email,company,created_at) VALUES($1,$2,$3,$2,$4)',[`zone_${n}`,'KOLKATA-DATE-BOUNDARY',`boundary-${n}@example.test`,times[n]]);
    const response=await call('customers?search=KOLKATA-DATE-BOUNDARY&from=2026-10-31&to=2026-10-31');expect(response.status).toBe(200);
    const page=await response.json();expect(page.total).toBe(2);expect(page.items.map((c:Customer)=>c.id)).toEqual(['zone_2','zone_1']);
  });
  it('rejects unsafe contract aggregates including adjusted prices and taxes with field errors',async()=>{
    const huge=await create<Product>('products',{name:'Maximum test amount',type:'SERVICE',salesPrice:Number.MAX_SAFE_INTEGER,costPrice:0,notes:'Fictitious limit test',active:true,variants:[{name:'Adjustment',priceAdjustment:1}]});
    const draft={customerId:customer.id,planId:plan.id,startDate:'2026-10-01',expiryDate:null,paymentTermsDays:14,quotationValidUntil:null};
    for(const line of [{productId:huge.id,variantId:null,quantity:1,taxIds:[tax.id]},{productId:huge.id,variantId:huge.variants[0].id,quantity:1,taxIds:[]}]) {
      const response=await call('subscriptions','POST',{...draft,lines:[line]});expect(response.status).toBe(422);expect((await response.json()).error.fields).toHaveProperty('lines');
    }
  });
  it('archives variants without deleting referenced identities and keeps customer auth ownership',async()=>{
    const original=product.variants[0].id;
    expect((await call(`products/${product.id}`,'PATCH',{variants:[]})).status).toBe(200);
    expect((await fixture.db.query('SELECT active FROM product_variants WHERE id=$1',[original])).rows[0].active).toBe(false);
    product=await (await call(`products/${product.id}`,'PATCH',{variants:[{id:original,name:'Odoo',priceAdjustment:56000}]})).json();
    await fixture.db.query("INSERT INTO users(id,name,email,password_hash,role,customer_id) VALUES('customer','Ananya','login@example.test','unused','CUSTOMER',$1)",[customer.id]);
    await call(`customers/${customer.id}`,'PATCH',{email:'business@example.test'});
    expect((await fixture.db.query("SELECT email,customer_id FROM users WHERE id='customer'")).rows[0]).toEqual({email:'login@example.test',customer_id:customer.id});
  });
  it('denies staff catalog writes and customer internal reads',async()=>{
    await fixture.db.query("UPDATE users SET role='STAFF' WHERE id='admin'");
    expect((await call(`products/${product.id}`,'PATCH',{name:'Forbidden'})).status).toBe(403);
    expect((await call('customers')).status).toBe(200);
    await fixture.db.query("UPDATE users SET role='ADMIN' WHERE id='admin'");
    await fixture.db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'customer',now()+interval '1 day')",[digest('b'.repeat(64))]);
    expect((await call('customers','GET',undefined,`ll_session=${'b'.repeat(64)}`)).status).toBe(403);
  });
  it('runs template -> quotation -> confirmed -> active, with immutable snapshots and pure preview',async()=>{
    await create('discounts',{name:'Launch',kind:'PERCENTAGE',value:1000,scope:'SUBSCRIPTION',productIds:[],minimumPurchase:0,minimumQuantity:10,startsAt:'2026-10-01',endsAt:'2026-10-31',usageLimit:100,active:true});
    subscription=await create('subscriptions',{customerId:customer.id,planId:plan.id,templateId:template.id,startDate:'2026-10-01',expiryDate:'2027-10-01',paymentTermsDays:14,quotationValidUntil:null,lines:[]});
    expect(subscription.status).toBe('DRAFT');expect(subscription.lines[0].quantity).toBe(10);expect(subscription.quotationValidUntil).toBe('2026-10-15');
    const transition=async(action:string)=>{const res=await call(`subscriptions/${subscription.id}/transition`,'POST',{action});expect(res.status,await res.clone().text()).toBe(200);subscription=await res.json();};
    await transition('quote');await transition('confirm');
    const first=await (await call(`subscriptions/${subscription.id}/preview`)).json();expect(first.total).toBe(990000);
    await call(`products/${product.id}`,'PATCH',{salesPrice:200000});await call(`taxes/${tax.id}`,'PATCH',{rateBps:2000});await call(`plans/${plan.id}`,'PATCH',{price:99999});
    const unchanged=await (await call(`subscriptions/${subscription.id}/preview`)).json();expect(unchanged.total).toBe(first.total);
    expect((await fixture.db.query('SELECT usage_count FROM discounts')).rows[0].usage_count).toBe(0);
    expect((await fixture.db.query('SELECT count(*) FROM invoices')).rows[0].count).toBe('0');
    await transition('activate');expect(subscription.nextBillingDate).toBe('2026-10-01');
    expect((await call(`subscriptions/${subscription.id}`,'PATCH',{paymentTermsDays:1})).status).toBe(409);
    await transition('pause');expect(subscription.nextBillingDate).toBe(null);await transition('resume');
    expect(subscription.status).toBe('ACTIVE');
  });
  it('serializes competing transitions and rejects expired quotations and off-cycle expiry',async()=>{
    const draft={customerId:customer.id,planId:plan.id,startDate:'2026-11-01',expiryDate:'2027-11-01',paymentTermsDays:14,quotationValidUntil:'2026-10-15',lines:template.lines};
    expect((await call('subscriptions','POST',{...draft,expiryDate:'2027-11-02'})).status).toBe(422);
    const sub:Subscription=await create('subscriptions',draft);
    const competing=await Promise.all([call(`subscriptions/${sub.id}/transition`,'POST',{action:'quote'}),call(`subscriptions/${sub.id}/transition`,'POST',{action:'quote'})]);
    expect(competing.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await call(`subscriptions/${sub.id}/transition`,'POST',{action:'confirm'})).status).toBe(200);
    expect((await call(`subscriptions/${sub.id}/transition`,'POST',{action:'activate'})).status).toBe(409);
    const expired:Subscription=await create('subscriptions',{...draft,quotationValidUntil:'2026-09-30'});
    await call(`subscriptions/${expired.id}/transition`,'POST',{action:'quote'});
    expect((await call(`subscriptions/${expired.id}/transition`,'POST',{action:'confirm'})).status).toBe(409);
    const restricted=await create<Plan>('plans',{...Object.fromEntries(Object.entries(plan).filter(([k])=>!['id','createdAt','updatedAt'].includes(k))),allowPause:false});
    const locked:Subscription=await create('subscriptions',{...draft,planId:restricted.id,startDate:'2026-10-01',expiryDate:'2027-10-01'});
    for(const action of ['quote','confirm','activate'])expect((await call(`subscriptions/${locked.id}/transition`,'POST',{action})).status).toBe(200);
    expect((await call(`subscriptions/${locked.id}/transition`,'POST',{action:'pause'})).status).toBe(409);
  });

  it('issues authorized printable snapshot documents and isolates both customers on every route',async()=>{
    expect((await runDueBilling('2026-10-01')).failed).toBe(0);
    invoiceId=(await fixture.db.query('SELECT id FROM invoices WHERE subscription_id=$1',[subscription.id])).rows[0].id;
    const invoice=await (await call(`invoices/${invoiceId}`)).json();expect(invoice.total).toBe(990000);expect(invoice.emailStatus).toBe('QUEUED');
    const original=await (await call(`invoices/${invoiceId}/document`)).text();
    await call(`products/${product.id}`,'PATCH',{name:'Changed later',salesPrice:300000});await call(`customers/${customer.id}`,'PATCH',{company:'Changed later'});
    expect(await (await call(`invoices/${invoiceId}/document`)).text()).toBe(original);
    const a=`ll_session=${'b'.repeat(64)}`;
    expect((await call(`invoices/${invoiceId}/document`,'GET',undefined,a)).status).toBe(200);
    const other=await create<Customer>('customers',{name:'Other',email:'other@example.test',company:'Other',address:'<script>alert(1)</script>'});
    await fixture.db.query("INSERT INTO users(id,name,email,password_hash,role,customer_id) VALUES('other','Other','other-login@example.test','unused','CUSTOMER',$1)",[other.id]);
    await fixture.db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'other',now()+interval '1 day')",[digest('c'.repeat(64))]);
    const b=`ll_session=${'c'.repeat(64)}`;
    for(const path of [`invoices/${invoiceId}`,`invoices/${invoiceId}/document`,`portal/invoices/${invoiceId}`,`portal/invoices/${invoiceId}/document`,`portal/subscriptions/${subscription.id}`])expect((await call(path,'GET',undefined,b)).status).toBe(404);
    expect((await call(`portal/subscriptions/${subscription.id}/transition`,'POST',{action:'pause'},b)).status).toBe(404);
    const owned=await (await call(`portal/invoices?customerId=${customer.id}`,'GET',undefined,b)).json();expect(owned.total).toBe(0);
    expect((await call(`invoices/${invoiceId}/actions`,'POST',{action:'cancel'},a)).status).toBe(403);
    expect((await call(`invoices/${invoiceId}/document`,'GET',undefined,'')).status).toBe(401);
  });
  it('deduplicates queued email, exposes retry failure, and processes accepted sends once without external SMTP',async()=>{
    for(let i=0;i<2;i++)expect((await call(`invoices/${invoiceId}/actions`,'POST',{action:'send'})).status).toBe(200);
    expect((await fixture.db.query('SELECT count(*) FROM outbox_messages WHERE dedupe_key=$1',[`invoice:${invoiceId}`])).rows[0].count).toBe('1');
    const failed=await deliverOutbox(async()=>{throw new Error('Simulated SMTP unavailable');});expect(failed.failed).toBeGreaterThan(0);
    expect((await (await call(`invoices/${invoiceId}`)).json()).emailStatus).toBe('FAILED');
    await call(`invoices/${invoiceId}/actions`,'POST',{action:'send'});
    let sent=0;const results=await Promise.all([deliverOutbox(async m=>{expect(m.to).toBe('business@example.test');expect(m.html).toContain('9,900.00');sent++;}),deliverOutbox(async()=>{sent++;})]);
    expect(results.reduce((n,r)=>n+r.sent,0)).toBe(1);expect(sent).toBe(1);
    await call(`invoices/${invoiceId}/actions`,'POST',{action:'send'});expect((await deliverOutbox(async()=>{sent++;})).sent).toBe(0);expect(sent).toBe(1);
    expect((await (await call(`invoices/${invoiceId}`)).json()).emailStatus).toBe('SENT');
  });
  it('cancels only unpaid issued invoices and releases discount usage once, preserving period history',async()=>{
    const before=(await fixture.db.query('SELECT usage_count FROM discounts')).rows[0].usage_count;
    expect((await call(`invoices/${invoiceId}/actions`,'POST',{action:'cancel'})).status).toBe(200);
    expect((await fixture.db.query('SELECT usage_count FROM discounts')).rows[0].usage_count).toBe(before-1);
    expect((await call(`invoices/${invoiceId}/actions`,'POST',{action:'cancel'})).status).toBe(409);
    expect((await fixture.db.query('SELECT usage_count FROM discounts')).rows[0].usage_count).toBe(before-1);
    expect((await fixture.db.query('SELECT count(*) FROM invoices WHERE id=$1',[invoiceId])).rows[0].count).toBe('1');
  });

  it('confirms draft invoices and marks zero-total invoices paid without a payment row',async()=>{
    for(const [id,year,zero] of [['settlement',2028,false],['zero',2029,true]] as const) {
      await fixture.db.query(`INSERT INTO invoices(id,number,subscription_id,customer_id,customer_snapshot,status,issued_at,due_at,period_start,period_end,subtotal,discount,tax,total,paid,explanation)
        SELECT $1,$1,subscription_id,customer_id,customer_snapshot,'DRAFT',issued_at,due_at,$2,$3,CASE WHEN $4 THEN 0 ELSE subtotal END,CASE WHEN $4 THEN 0 ELSE discount END,CASE WHEN $4 THEN 0 ELSE tax END,CASE WHEN $4 THEN 0 ELSE total END,0,explanation FROM invoices WHERE id=$5`,[id,`${year}-10-01`,`${year}-11-01`,zero,invoiceId]);
      await fixture.db.query(`INSERT INTO invoice_lines(id,invoice_id,description,quantity,unit_price,subtotal,discount,tax,total,pricing_snapshot)
        SELECT $1||id,$1,description,quantity,CASE WHEN $2 THEN 0 ELSE unit_price END,CASE WHEN $2 THEN 0 ELSE subtotal END,CASE WHEN $2 THEN 0 ELSE discount END,CASE WHEN $2 THEN 0 ELSE tax END,CASE WHEN $2 THEN 0 ELSE total END,pricing_snapshot FROM invoice_lines WHERE invoice_id=$3`,[id,zero,invoiceId]);
      const res=await call(`invoices/${id}/actions`,'POST',{action:'confirm'});expect(res.status).toBe(200);expect((await res.json()).status).toBe(zero?'PAID':'CONFIRMED');
    }
    expect((await fixture.db.query("SELECT count(*) FROM payments WHERE invoice_id='zero'")).rows[0].count).toBe('0');
    invoiceId='settlement';
  });

  it('records partial/final payments once and serializes duplicate, conflicting and overpayment races',async()=>{
    const data={invoiceId,amount:400000,method:'BANK_TRANSFER',paidAt:'2026-10-01',note:'First instalment'};
    const key={'Idempotency-Key':'payment-partial-0001'};
    const duplicates=await Promise.all([call('payments','POST',data,cookie,key),call('payments','POST',data,cookie,key)]);
    expect(duplicates.map(r=>r.status)).toEqual([201,201]);const first=await duplicates[0].json();expect((await duplicates[1].json()).id).toBe(first.id);
    let invoice=await (await call(`invoices/${invoiceId}`)).json();expect([invoice.paid,invoice.balance,invoice.status]).toEqual([400000,590000,'CONFIRMED']);
    expect((await call(`invoices/${invoiceId}/actions`,'POST',{action:'cancel'})).status).toBe(409);
    expect((await call('payments','POST',{...data,amount:1},cookie,key)).status).toBe(409);
    expect((await call('payments','POST',{...data,amount:600000},cookie,{'Idempotency-Key':'payment-overpay-0001'})).status).toBe(422);
    expect((await call('payments','POST',{...data,paidAt:'2099-01-01'},cookie,{'Idempotency-Key':'payment-future-0001'})).status).toBe(422);
    expect((await call('payments','POST',{...data,amount:0},cookie,{'Idempotency-Key':'payment-zero-0001'})).status).toBe(400);
    const finals=await Promise.all([call('payments','POST',{...data,amount:590000},cookie,{'Idempotency-Key':'payment-final-0001'}),call('payments','POST',{...data,amount:590000},cookie,{'Idempotency-Key':'payment-final-0002'})]);
    expect(finals.map(r=>r.status).sort()).toEqual([201,409]);
    invoice=await (await call(`invoices/${invoiceId}`)).json();expect([invoice.paid,invoice.balance,invoice.status]).toEqual([990000,0,'PAID']);
    expect((await fixture.db.query('SELECT count(*) count,sum(amount)::text total FROM payments WHERE invoice_id=$1',[invoiceId])).rows[0]).toEqual({count:'2',total:'990000'});
    expect((await call('payments','POST',data,`ll_session=${'b'.repeat(64)}`,{'Idempotency-Key':'payment-customer-0001'})).status).toBe(403);
  });
  it('reports billed and collected separately, keeps current balances outside date filters, and drops expired recurring discounts',async()=>{
    const report=await (await call('reports/summary?from=2026-09-01&to=2026-11-30')).json();
    const expected=(await fixture.db.query("SELECT sum(total)::text total FROM invoices WHERE status IN ('CONFIRMED','PAID')")).rows[0].total;
    expect(report.billed).toBe(Number(expected));expect(report.collected).toBe(990000);expect(report.mrr).toBe(2700000);
    expect(report.monthly.map((m:{month:string})=>m.month)).toEqual(['Sep 2026','Oct 2026','Nov 2026']);
    expect(report.monthly[0].billed).toBe(0);expect(report.monthly[2].collected).toBe(0);
    const emptyPeriod=await (await call('reports/summary?from=2026-09-01&to=2026-09-30')).json();
    expect(emptyPeriod.billed).toBe(0);expect(emptyPeriod.collected).toBe(0);expect(emptyPeriod.outstanding).toBe(report.outstanding);
    await fixture.db.query("UPDATE demo_clock SET as_of='2026-11-01'");
    const next=await (await call('reports/summary')).json();expect(next.mrr).toBe(3000000);expect(next.overdue).toBe(next.outstanding);expect(next.attention.some((a:{kind:string})=>a.kind==='OVERDUE')).toBe(true);
    expect((await call('reports/summary?from=2026-11-01&to=2026-10-01')).status).toBe(400);
    expect((await call('reports/summary','GET',undefined,`ll_session=${'b'.repeat(64)}`)).status).toBe(403);
    const payments=await (await call('payments?from=2026-10-01&to=2026-10-01&pageSize=1')).json();expect(payments.total).toBe(2);expect(payments.items).toHaveLength(1);
  });

  it('protects forward-only isolated demo clock and reruns the same worker without duplicate periods',async()=>{
    const customerCookie=`ll_session=${'b'.repeat(64)}`;
    expect((await call('demo/clock','POST',{to:'2026-11-02'},customerCookie)).status).toBe(403);
    expect((await call('demo/clock','POST',{to:'2026-10-31'})).status).toBe(422);
    process.env.ENABLE_DEMO_CLOCK='false';expect((await call('demo/clock','POST',{to:'2026-11-02'})).status).toBe(403);process.env.ENABLE_DEMO_CLOCK='true';
    const name=process.env.DEMO_DATABASE_NAME;process.env.DEMO_DATABASE_NAME='wrong_demo';expect((await call('demo/clock','POST',{to:'2026-11-02'})).status).toBe(503);process.env.DEMO_DATABASE_NAME=name;
    const run=await call('demo/clock','POST',{to:'2026-11-01'});expect(run.status).toBe(200);expect((await run.json()).generated).toBeGreaterThan(0);
    const next=(await fixture.db.query("SELECT total::text FROM invoices WHERE subscription_id=$1 AND period_start='2026-11-01'",[subscription.id])).rows[0];expect(next.total).toBe('1100000');
    const repeated=await (await call('billing/run','POST',{})).json();expect(repeated.generated).toBe(0);
    const session=await (await call('session')).json();expect(session.asOf).toBe('2026-11-01');expect(session.demoClock).toBe(true);
    expect((await call('system/status','GET',undefined,customerCookie)).status).toBe(403);
  });
  it('authenticates and throttles scheduler invocation independently of browser sessions',async()=>{
    process.env.CRON_SECRET='fictitious-test-credential-'.repeat(2);
    expect((await call('scheduler/run','POST',{},'',{authorization:'Bearer incorrect'})).status).toBe(401);
    const headers={authorization:`Bearer ${process.env.CRON_SECRET}`};
    expect((await call('scheduler/run','GET',undefined,'',headers)).status).toBe(200);
    expect((await call('scheduler/run','POST',{},'',headers)).status).toBe(429);
  });
  it('holds uncertain SMTP acceptance for explicit reconciliation and exposes only safe outbox metadata',async()=>{
    const pending=(await fixture.db.query("SELECT id FROM invoices WHERE status='CONFIRMED' AND subscription_id=$1 AND period_start='2026-11-01'",[subscription.id])).rows[0].id;
    await call(`invoices/${pending}/actions`,'POST',{action:'send'});
    const result=await deliverOutbox(async()=>{throw Object.assign(new Error('injected DATA ambiguity'),{command:'DATA'});});expect(result.uncertain).toBeGreaterThan(0);
    expect((await call(`invoices/${pending}/actions`,'POST',{action:'send'})).status).toBe(409);
    const outbox=await (await call('outbox')).json();expect(JSON.stringify(outbox)).not.toContain('payload');
    const entry=outbox.find((m:{status:string})=>m.status==='UNCERTAIN');
    expect((await call(`outbox/${entry.id}/retry`,'POST',{confirmUnknownDelivery:false})).status).toBe(409);
    expect((await call(`outbox/${entry.id}/retry`,'POST',{confirmUnknownDelivery:true})).status).toBe(200);
    expect((await deliverOutbox(async()=>{})).sent).toBe(1);
  });


  it('targets immediate invoice delivery after response without draining another invoice first',async()=>{
    const pending=(await fixture.db.query("SELECT id FROM invoices WHERE status='CONFIRMED' ORDER BY id LIMIT 1")).rows[0].id;
    const tasks:(()=>Promise<void>)[]=[];let sends=0;
    vi.stubEnv('EMAIL_DELIVERY_ENABLED','true');
    try {
      const path=`invoices/${pending}/actions`;
      const request=new Request(`http://localhost:3000/api/v1/${path}`,{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json','X-LoopLedger-CSRF':'1',cookie},body:JSON.stringify({action:'send'})});
      // Requeue only a known failed state for this delivery test.
      await fixture.db.query("UPDATE outbox_messages SET delivery_state='FAILED',next_attempt_at=now(),sent_at=NULL WHERE dedupe_key=$1",[`invoice:${pending}`]);
      const response=await handle(request,path.split('/'),{defer:task=>tasks.push(task),dispatch:key=>deliverOutbox(async()=>{sends++;},1,key)});
      expect(response.status).toBe(200);expect(tasks).toHaveLength(1);expect(sends).toBe(0);
      await tasks[0]();expect(sends).toBe(1);
      expect((await fixture.db.query('SELECT delivery_state FROM outbox_messages WHERE dedupe_key=$1',[`invoice:${pending}`])).rows[0].delivery_state).toBe('SENT');
    } finally {vi.unstubAllEnvs();}
  });
  it('keeps draft list reads bounded as page size grows, using joined plan policies',async()=>{
    await fixture.db.query(`INSERT INTO subscriptions(id,number,customer_id,plan_id,status,start_date,payment_terms_days)
      SELECT 'pageperf_'||n,'PAGEPERF-'||n,$1,$2,'DRAFT','2026-11-01',14 FROM generate_series(1,20) n`,[customer.id,plan.id]);
    await fixture.db.query(`INSERT INTO subscription_lines(id,subscription_id,product_id,description,quantity,unit_price)
      SELECT 'pageperf_line_'||n,'pageperf_'||n,$1,'Workspace',1,100000 FROM generate_series(1,20) n`,[product.id]);
    const queries=vi.spyOn(getPool(),'query');
    try {
      const first=await (await call('subscriptions?search=PAGEPERF&pageSize=1')).json();const singleCount=queries.mock.calls.length;queries.mockClear();
      const full=await (await call('subscriptions?search=PAGEPERF&pageSize=20')).json();
      expect(first.total).toBe(20);expect(full.items).toHaveLength(20);expect(full.items.every((s:Subscription)=>s.allowedActions.includes('quote'))).toBe(true);
      expect(queries.mock.calls.length).toBe(singleCount);expect(singleCount).toBeLessThanOrEqual(8);
    } finally {queries.mockRestore();}
  });

  it('renews a closed contract only with an explicit available future cycle',async()=>{
    const asOf=(await (await call('system/status')).json()).asOf;
    const future=new Date(`${asOf}T00:00:00Z`);future.setUTCDate(future.getUTCDate()+2);const startDate=future.toISOString().slice(0,10);
    const sub:Subscription=await create('subscriptions',{customerId:customer.id,planId:plan.id,startDate:asOf,expiryDate:null,paymentTermsDays:14,quotationValidUntil:startDate,lines:template.lines});
    for(const action of ['quote','confirm','close'])expect((await call(`subscriptions/${sub.id}/transition`,'POST',{action})).status).toBe(200);
    expect((await (await call(`subscriptions/${sub.id}`)).json()).allowedActions).toContain('renew');
    expect((await call(`subscriptions/${sub.id}/transition`,'POST',{action:'renew'})).status).toBe(422);
    expect((await call(`subscriptions/${sub.id}/transition`,'POST',{action:'renew',startDate:asOf})).status).toBe(422);
    const response=await call(`subscriptions/${sub.id}/transition`,'POST',{action:'renew',startDate});expect(response.status).toBe(200);const renewed=await response.json();expect(renewed.status).toBe('CONFIRMED');expect(renewed.startDate).toBe(startDate);expect(renewed.expiryDate>startDate).toBe(true);
  });

});
