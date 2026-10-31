import { hashPassword } from './password.mjs';
export async function seedDemo(client, password, {performance=false}={}) {
  if (!password || password.length < 9 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) throw new Error('Supply a compliant private DEMO_PASSWORD');
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(809032)');
  const insert = async (table, values) => {
    const keys = Object.keys(values);
    await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT DO NOTHING`, Object.values(values));
  };
  const stamp = { created_at:'2026-10-01T00:00:00Z', updated_at:'2026-10-01T00:00:00Z' };
  for (const [id,name,email,company] of [['maple','Ananya Rao','ananya@example.test','Maple Studio'],['north','Arjun Menon','arjun@example.test','Northstar Labs']]) {
    await insert('customers',{id:`customer_${id}`,name,email,company,address:'Kochi, Kerala',...stamp});
    await insert('users',{id:`user_${id}`,name,email,password_hash:await hashPassword(password),role:'CUSTOMER',customer_id:`customer_${id}`,...stamp});
  }
  for (const role of ['ADMIN','STAFF']) await insert('users',{id:`user_${role.toLowerCase()}`,name:`Demo ${role}`,email:`${role.toLowerCase()}@example.test`,password_hash:await hashPassword(password),role,...stamp});
  await insert('products',{id:'prod_workspace',name:'Workspace Suite',type:'SOFTWARE',sales_price:100000,cost_price:35000,notes:'Per seat, per billing cycle',...stamp});
  await insert('product_variants',{id:'variant_odoo',product_id:'prod_workspace',name:'Odoo',price_adjustment:56000});
  await insert('taxes',{id:'tax_demo',name:'Demo tax (illustrative)',rate_bps:1000,...stamp});
  await insert('plans',{id:'plan_monthly',name:'Business Monthly',price:0,interval:'MONTHLY',minimum_quantity:1,available_from:'2026-01-01',allow_pause:true,allow_renew:true,...stamp});
  await insert('discounts',{id:'discount_seats',name:'Team launch offer',kind:'PERCENTAGE',value:1000,scope:'SUBSCRIPTION',minimum_quantity:10,starts_at:'2026-10-01',ends_at:'2026-10-31',usage_limit:100,...stamp});
  const lines=[{productId:'prod_workspace',variantId:null,quantity:10,taxIds:['tax_demo']}];
  await insert('quotation_templates',{id:'template_team',name:'10-seat team starter',plan_id:'plan_monthly',valid_days:14,lines:JSON.stringify(lines),...stamp});
  const plan={name:'Business Monthly',price:0,interval:'MONTHLY',autoClose:true,allowEarlyClose:true,allowPause:true,allowRenew:true,taxes:[]};
  const taxes=[{id:'tax_demo',name:'Demo tax (illustrative)',rateBps:1000}];
  await insert('subscriptions',{id:'sub_maple',number:'SUB-DEMO-0001',customer_id:'customer_maple',plan_id:'plan_monthly',status:'ACTIVE',start_date:'2026-10-01',expiry_date:'2027-10-01',next_billing_date:'2026-11-01',billing_anchor_day:1,cycle_anchor:'2026-10-01',payment_terms_days:14,plan_snapshot:plan,...stamp});
  await insert('subscription_lines',{id:'sl_1',subscription_id:'sub_maple',product_id:'prod_workspace',variant_id:null,description:'Workspace Suite',quantity:10,unit_price:100000,tax_ids:JSON.stringify(['tax_demo']),tax_snapshot:JSON.stringify(taxes)});
  await insert('invoices',{id:'inv_maple',number:'INV-DEMO-0001',subscription_id:'sub_maple',customer_id:'customer_maple',customer_snapshot:{name:'Ananya Rao',email:'ananya@example.test',company:'Maple Studio',address:'Kochi, Kerala'},status:'CONFIRMED',issued_at:'2026-10-01',due_at:'2026-10-15',period_start:'2026-10-01',period_end:'2026-11-01',subtotal:1000000,discount:100000,tax:90000,total:990000,paid:400000,explanation:JSON.stringify(['10 × 100000 paise = 1000000 paise','Team launch offer: 100000 paise discount','Illustrative tax: 90000 paise']),...stamp});
  await insert('invoice_lines',{id:'il_1',invoice_id:'inv_maple',description:'Workspace Suite',quantity:10,unit_price:100000,subtotal:1000000,discount:100000,tax:90000,total:990000,pricing_snapshot:{taxes}});
  await insert('payments',{id:'payment_maple',invoice_id:'inv_maple',amount:400000,method:'BANK_TRANSFER',paid_at:'2026-10-12',note:'Fictitious first instalment',idempotency_key:'seed-maple-payment',created_by:'user_admin',...stamp});
  await client.query("WITH added AS (INSERT INTO discount_redemptions(discount_id,invoice_id) VALUES ('discount_seats','inv_maple') ON CONFLICT DO NOTHING RETURNING discount_id) UPDATE discounts SET usage_count=usage_count+1 WHERE id IN (SELECT discount_id FROM added)");
  if (performance) {
    await client.query(`INSERT INTO subscriptions(id,number,customer_id,plan_id,status,start_date,next_billing_date,cycle_anchor,payment_terms_days,plan_snapshot)
      SELECT 'perf_'||n,'SUB-PERF-'||n,'customer_north','plan_monthly','ACTIVE','2026-10-01','2026-11-01','2026-10-01',14,$1::jsonb FROM generate_series(1,5000) n ON CONFLICT DO NOTHING`,[JSON.stringify(plan)]);
    await client.query(`INSERT INTO subscription_lines(id,subscription_id,product_id,description,quantity,unit_price,tax_ids,tax_snapshot)
      SELECT 'perf_line_'||n,'perf_'||n,'prod_workspace','Workspace Suite',1,100000,'[]','[]' FROM generate_series(1,5000) n ON CONFLICT DO NOTHING`);
  }
  await client.query('COMMIT');
  console.log('Demo seed complete. Existing records and passwords were preserved.');
} catch(error) { await client.query('ROLLBACK'); throw error; }
}

export function validateHostedDemoTarget(connectionString, env) {
  const target = new URL(connectionString);
  if (env.ALLOW_REMOTE_DEMO_BOOTSTRAP !== 'true' || env.CONFIRM_DEMO_HOST !== target.hostname || !target.hostname.endsWith('.neon.tech') || target.hostname.includes('-pooler') || decodeURIComponent(target.pathname) !== '/loopledger_demo') {
    throw new Error('Hosted bootstrap requires explicit operator approval, the exact confirmed direct Neon host, and isolated loopledger_demo database.');
  }
  return target;
}
