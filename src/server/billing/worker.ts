import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BillingRunResult } from '@/lib/contracts';
import { getPool, one, transaction } from '../db';
import { audit, billingInputs, discountRules, subscriptionRow } from '../subscriptions';
import { getResource } from '../catalog';
import { addDays, nextCycle } from '../dates';
import { dateOnly } from '../values';
import { calculate } from './calculator';
import { checkOrigin, requireUser } from '../auth';
import { effectiveDate, demoEnabled } from '../clock';
import { body, HttpError } from '../errors';

/** Each period is one transaction; an error leaves that period due for retry. */
export async function runDueBilling(asOf:string,limit=100):Promise<BillingRunResult> {
  dateOnly.parse(asOf);z.number().int().min(1).max(500).parse(limit);
  const runId=randomUUID(),result:BillingRunResult={runId,generated:0,skipped:0,failed:0,asOf},failedIds:string[]=[];
  await getPool().query("INSERT INTO billing_runs(id,as_of,status) VALUES($1,$2,'RUNNING')",[runId,asOf]);
  try {
    for(let step=0;step<limit;step++) {
      let candidate:{id:string;period:string}|undefined;
      try {
        const outcome=await transaction(async db=>{
          const claimed=await one<{id:string}>(db,`SELECT id FROM subscriptions WHERE NOT(id=ANY($2::text[])) AND ((status='ACTIVE' AND next_billing_date<=$1::date) OR (status='CONFIRMED' AND start_date<=$1::date)) ORDER BY COALESCE(next_billing_date,start_date),id LIMIT 1 FOR UPDATE SKIP LOCKED`,[asOf,failedIds]);
          if(!claimed)return 'empty';
          const row=await subscriptionRow(db,claimed.id);
          candidate={id:row.id,period:row.next_billing_date??row.start_date};
          if(row.status==='CONFIRMED') {
            row.next_billing_date=row.start_date;
            await db.query("UPDATE subscriptions SET status='ACTIVE',next_billing_date=start_date,updated_at=now() WHERE id=$1",[row.id]);
            await audit(db,null,'subscription',row.id,'scheduled_activate',{asOf});
          }
          const {plan,lines}=await billingInputs(db,row),period=row.next_billing_date!;
          if(row.expiry_date&&period>=row.expiry_date) {
            await db.query('UPDATE subscriptions SET status=$1,next_billing_date=NULL,closed_at=CASE WHEN $2 THEN $3::date ELSE closed_at END,paused_at=CASE WHEN NOT $2 THEN $3::date ELSE paused_at END,updated_at=now() WHERE id=$4',[plan.autoClose?'CLOSED':'PAUSED',plan.autoClose,row.expiry_date,row.id]);
            await audit(db,null,'subscription',row.id,'expiry',{asOf,status:plan.autoClose?'CLOSED':'PAUSED'});return 'skipped';
          }
          const end=nextCycle(row.cycle_anchor??row.start_date,period,plan.interval);
          if(row.expiry_date&&end>row.expiry_date)throw new HttpError(422,'OFF_CYCLE_EXPIRY','Expiry is not aligned with this billing cycle');
          const existing=await one(db,'SELECT id FROM invoices WHERE subscription_id=$1 AND period_start=$2 AND period_end=$3',[row.id,period,end]);
          if(existing){await db.query('UPDATE subscriptions SET next_billing_date=$1,updated_at=now() WHERE id=$2',[end,row.id]);return 'skipped';}
          // Stable ordered row locks serialize global rule caps across every worker.
          const rules=await discountRules(db,true),calculation=calculate(lines,rules,period),invoiceId=randomUUID();
          const customer=await getResource(db,'customers',row.customer_id);
          const {id:customerId,createdAt,updatedAt,...customerSnapshot}=customer;void customerId;void createdAt;void updatedAt;
          await db.query(`INSERT INTO invoices(id,number,subscription_id,customer_id,customer_snapshot,status,issued_at,due_at,period_start,period_end,subtotal,discount,tax,total,explanation,calculation_snapshot)
            VALUES($1,'INV-'||$2||'-'||lpad(nextval('invoice_number_seq')::text,6,'0'),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[invoiceId,asOf.slice(0,4),row.id,row.customer_id,customerSnapshot,calculation.total===0?'PAID':'CONFIRMED',asOf,addDays(asOf,row.payment_terms_days),period,end,calculation.subtotal,calculation.discount,calculation.tax,calculation.total,JSON.stringify(calculation.explanation),{plan,lines,rules:rules.filter(r=>calculation.ruleIds.includes(r.id)),periodStart:period}]);
          for(const line of calculation.lines) {
            await db.query('INSERT INTO invoice_lines(id,invoice_id,description,quantity,unit_price,subtotal,discount,tax,total,pricing_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),invoiceId,line.description,line.quantity,line.unitPrice,line.subtotal,line.discount,line.tax,line.total,{input:lines.find(l=>l.id===line.id),ruleIds:calculation.ruleIds}]);
          }
          for(const ruleId of calculation.ruleIds) {
            const reserved=await db.query('UPDATE discounts SET usage_count=usage_count+1,updated_at=now() WHERE id=$1 AND (usage_limit IS NULL OR usage_count<usage_limit) RETURNING id',[ruleId]);
            if(!reserved.rowCount)throw new HttpError(409,'DISCOUNT_EXHAUSTED','Discount cap was reached');
            await db.query('INSERT INTO discount_redemptions(discount_id,invoice_id) VALUES($1,$2)',[ruleId,invoiceId]);
          }
          // Persist the outbox with the invoice; SMTP processing happens after commit.
          await db.query("INSERT INTO outbox_messages(id,dedupe_key,kind,payload) VALUES($1,$2,'INVOICE',$3)",[randomUUID(),`invoice:${invoiceId}`,{invoiceId,to:customerSnapshot.email}]);
          await audit(db,null,'invoice',invoiceId,'issued',{runId,periodStart:period,periodEnd:end});
          await db.query('UPDATE subscriptions SET next_billing_date=$1,updated_at=now() WHERE id=$2',[end,row.id]);
          await db.query('UPDATE billing_failures SET resolved_at=now() WHERE subscription_id=$1 AND period_start=$2 AND resolved_at IS NULL',[row.id,period]);
          return 'generated';
        });
        if(outcome==='empty')break;
        if(outcome==='generated')result.generated++;else result.skipped++;
      } catch(error) {
        if(!candidate)throw error;
        result.failed++;failedIds.push(candidate.id);
        await getPool().query('INSERT INTO billing_failures(id,run_id,subscription_id,period_start,message) VALUES($1,$2,$3,$4,$5)',[randomUUID(),runId,candidate.id,candidate.period,'Period failed and remains due. Retry after resolving validation or storage failure.']);
      }
    }
    await getPool().query("UPDATE billing_runs SET status=$1,generated=$2,skipped=$3,failed=$4,completed_at=now() WHERE id=$5",[result.failed?'FAILED':'COMPLETED',result.generated,result.skipped,result.failed,runId]);
    return result;
  } catch(error) {
    await getPool().query("UPDATE billing_runs SET status='FAILED',generated=$1,skipped=$2,failed=$3,completed_at=now() WHERE id=$4",[result.generated,result.skipped,result.failed+1,runId]);throw error;
  }
}
export async function billingRoute(request:Request,clock=false) {
  await requireUser(request,['ADMIN']);checkOrigin(request);
  if(request.method!=='POST')throw new HttpError(405,'METHOD_NOT_ALLOWED','Use POST');
  if(clock) {
    if(!demoEnabled())throw new HttpError(403,'DEMO_DISABLED','Demo clock is disabled');
    const {to}=z.object({to:dateOnly}).strict().parse(await body(request));
    await transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(809033)');
      const current=await effectiveDate(db);
      if(to<current)throw new HttpError(422,'CLOCK_BACKWARDS','Demo clock can only move forwards');
      await db.query('INSERT INTO demo_clock(singleton,as_of) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET as_of=EXCLUDED.as_of',[to]);
    });
  }
  return Response.json(await runDueBilling(await effectiveDate()));
}
export async function schedulerRoute(request:Request) {
  if(request.method!=='POST')throw new HttpError(405,'METHOD_NOT_ALLOWED','Use POST');
  const secret=process.env.CRON_SECRET;
  if(!secret||secret.length<32)throw new HttpError(503,'SCHEDULER_NOT_CONFIGURED','Scheduler is not configured');
  const supplied=request.headers.get('authorization')??'',expected=`Bearer ${secret}`;
  if(supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new HttpError(401,'UNAUTHENTICATED','Invalid scheduler credential');
  const throttle=await one<{attempts:number}>(getPool(),`INSERT INTO auth_throttles(bucket,attempts,resets_at) VALUES('scheduler',1,now()+interval '1 minute') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN auth_throttles.resets_at<now() THEN 1 ELSE auth_throttles.attempts+1 END,resets_at=CASE WHEN auth_throttles.resets_at<now() THEN now()+interval '1 minute' ELSE auth_throttles.resets_at END RETURNING attempts`);
  if(throttle!.attempts>1)throw new HttpError(429,'THROTTLED','Retry after one minute');
  return Response.json(await runDueBilling(await effectiveDate()));
}
