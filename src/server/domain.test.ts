import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Product, Plan, TaxRule, Customer, QuoteTemplate } from '@/lib/contracts';
import { isolatedDatabase } from './test-db';
import { handle } from './router';
import { digest } from './auth';

describe.skipIf(!process.env.DB_TEST_URL)('connected domain workflow',()=>{
  let fixture:Awaited<ReturnType<typeof isolatedDatabase>>;
  let product:Product,plan:Plan,tax:TaxRule,customer:Customer,template:QuoteTemplate;
  const token='a'.repeat(64),cookie=`ll_session=${token}`;
  const call=async(path:string,method='GET',input?:unknown,session=cookie,headers:Record<string,string>={})=>handle(new Request(`http://localhost:3000/api/v1/${path}`,{method,headers:{origin:'http://localhost:3000','Content-Type':'application/json','X-LoopLedger-CSRF':'1',cookie:session,...headers},...(input===undefined?{}:{body:JSON.stringify(input)})}),path.split('?')[0].split('/'));
  async function create<T>(path:string,input:unknown):Promise<T>{const res=await call(path,'POST',input);expect(res.status,await res.clone().text()).toBe(201);return res.json();}
  beforeAll(async()=>{
    fixture=await isolatedDatabase();process.env.APP_URL='http://localhost:3000';
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
    const page=await (await call('products?search=Workspace&page=2&pageSize=1')).json();expect(page.total).toBe(1);expect(page.items).toEqual([]);
    expect((await call(`discounts`,'POST',{name:'Wrong',kind:'PERCENTAGE',value:10001,scope:'SUBSCRIPTION',productIds:[],minimumPurchase:0,minimumQuantity:1,startsAt:'2026-01-01',endsAt:null,usageLimit:null,active:true})).status).toBe(400);
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
});
