import { z } from 'zod';
import type { DashboardSummary } from '@/lib/contracts';
import { one, transaction } from './db';
import { requireUser } from './auth';
import { effectiveDate } from './clock';
import { dateOnly, planSnapshot, safeInteger } from './values';
import { calculate, type BillingLine } from './billing/calculator';
import { discountRules } from './subscriptions';
import { HttpError } from './errors';
import { addDays } from './dates';

export async function reportSummary(input:{from?:string;to?:string}={}):Promise<DashboardSummary> {
  return transaction(async db=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const asOf=await effectiveDate(db),from=dateOnly.parse(input.from??`${asOf.slice(0,4)}-01-01`),to=dateOnly.parse(input.to??asOf);
    const months=(Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5,7))-Number(from.slice(5,7));
    if(from>to||months>119)throw new HttpError(400,'VALIDATION_ERROR','Select an ordered report range of at most 120 months');
    const totals=await one<{billed:string;collected:string;outstanding:string;overdue:string}>(db,`SELECT
      (SELECT COALESCE(sum(total),0)::text FROM invoices WHERE status IN ('CONFIRMED','PAID') AND issued_at BETWEEN $1::date AND $2::date) billed,
      (SELECT COALESCE(sum(amount),0)::text FROM payments WHERE paid_at BETWEEN $1::date AND $2::date) collected,
      (SELECT COALESCE(sum(total-paid),0)::text FROM invoices WHERE status='CONFIRMED') outstanding,
      (SELECT COALESCE(sum(total-paid),0)::text FROM invoices WHERE status='CONFIRMED' AND due_at<$3::date) overdue`,[from,to,asOf]);
    const monthly=(await db.query<{month:string;billed:string;collected:string}>(`WITH billed AS (SELECT date_trunc('month',issued_at)::date bucket,sum(total) amount FROM invoices WHERE status IN ('CONFIRMED','PAID') AND issued_at BETWEEN $1::date AND $2::date GROUP BY 1), collected AS (SELECT date_trunc('month',paid_at)::date bucket,sum(amount) amount FROM payments WHERE paid_at BETWEEN $1::date AND $2::date GROUP BY 1)
      SELECT to_char(m,'Mon YYYY') AS "month",COALESCE(b.amount,0)::text billed,COALESCE(c.amount,0)::text collected FROM generate_series(date_trunc('month',$1::date),date_trunc('month',$2::date),interval '1 month') m LEFT JOIN billed b ON b.bucket=m LEFT JOIN collected c ON c.bucket=m ORDER BY m`,[from,to])).rows;
    // Group identical contracts in PostgreSQL first. No browser receives subscription
    // datasets and no per-subscription query is used for the recurring-value aggregate.
    const groups=(await db.query<{plan_snapshot:unknown;lines:unknown;count:string}>(`WITH lines AS (SELECT subscription_id,jsonb_agg(jsonb_build_object('productId',product_id,'description',description,'quantity',quantity,'unitPrice',unit_price::text) ORDER BY product_id,variant_id,unit_price,quantity,description) economics FROM subscription_lines GROUP BY subscription_id),contracts AS (SELECT s.plan_snapshot,COALESCE(l.economics,'[]') lines FROM subscriptions s LEFT JOIN lines l ON l.subscription_id=s.id WHERE s.status='ACTIVE' AND s.start_date<=$1::date AND (s.expiry_date IS NULL OR s.expiry_date>$1::date)) SELECT plan_snapshot,lines,count(*)::text count FROM contracts GROUP BY plan_snapshot,lines`,[asOf])).rows;
    const rules=await discountRules(db),lineSchema=z.array(z.object({productId:z.string(),description:z.string(),quantity:z.number().int().positive(),unitPrice:z.string().regex(/^\d+$/)}));
    let normalized=0n,active=0n;
    for(const group of groups) {
      const p=planSnapshot.parse(group.plan_snapshot),count=BigInt(group.count);active+=count;
      const lines:BillingLine[]=lineSchema.parse(group.lines).map((l,i)=>({...l,id:`mrr_${i}`,unitPrice:safeInteger(l.unitPrice),taxes:[]}));
      if(p.price)lines.push({id:'mrr_base',productId:null,description:p.name,quantity:1,unitPrice:p.price,taxes:[]});
      const recurring=calculate(lines,rules,asOf).total;
      normalized+=BigInt(recurring)*count*BigInt({DAILY:365,WEEKLY:52,MONTHLY:12,YEARLY:1}[p.interval]);
    }
    const overdueItems=(await db.query<{id:string;number:string}> ("SELECT id,number FROM invoices WHERE status='CONFIRMED' AND paid<total AND due_at<$1::date ORDER BY due_at,id LIMIT 10",[asOf])).rows;
    const expiring=(await db.query<{id:string;number:string;expiry_date:string}> ("SELECT id,number,expiry_date FROM subscriptions WHERE status IN ('ACTIVE','CONFIRMED','PAUSED') AND expiry_date BETWEEN $1::date AND $2::date ORDER BY expiry_date,id LIMIT 10",[asOf,addDays(asOf,14)])).rows;
    const failures=(await db.query<{id:string;number:string}>("SELECT s.id,s.number FROM subscriptions s WHERE EXISTS(SELECT 1 FROM billing_failures f WHERE f.subscription_id=s.id AND f.resolved_at IS NULL) ORDER BY s.id LIMIT 10")).rows;
    return {activeSubscriptions:safeInteger(active),mrr:safeInteger((normalized+6n)/12n),billed:safeInteger(totals!.billed),collected:safeInteger(totals!.collected),outstanding:safeInteger(totals!.outstanding),overdue:safeInteger(totals!.overdue),asOf,monthly:monthly.map(m=>({month:m.month,billed:safeInteger(m.billed),collected:safeInteger(m.collected)})),attention:[...overdueItems.map(i=>({id:i.id,kind:'OVERDUE' as const,title:`${i.number} has an overdue balance`,href:'/invoices'})),...expiring.map(s=>({id:s.id,kind:'EXPIRING' as const,title:`${s.number} expires ${s.expiry_date}`,href:'/subscriptions'})),...failures.map(s=>({id:s.id,kind:'BILLING_FAILURE' as const,title:`${s.number} needs a billing retry`,href:'/operations'}))]};
  });
}
export async function reportsRoute(request:Request) {
  await requireUser(request,['ADMIN','STAFF']);if(request.method!=='GET')throw new HttpError(405,'METHOD_NOT_ALLOWED','Use GET');
  const query=z.object({from:dateOnly.optional(),to:dateOnly.optional()}).parse(Object.fromEntries(new URL(request.url).searchParams));
  return Response.json(await reportSummary(query));
}
