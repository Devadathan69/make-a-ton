import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Payment, User } from '@/lib/contracts';
import { getPool, one, transaction, type Db } from './db';
import { body, HttpError, missing } from './errors';
import { checkOrigin, digest, requireUser } from './auth';
import { effectiveDate } from './clock';
import { dateOnly, listQuery, money, safeInteger, timestamps } from './values';
import { audit } from './subscriptions';
import { invoiceRow } from './invoices';
const methods=z.enum(['BANK_TRANSFER','CARD','UPI','CASH','OTHER']);
const paymentInput=z.object({invoiceId:z.string().min(1),amount:money.refine(v=>v>0,'Amount must be positive'),method:methods,paidAt:dateOnly,note:z.string().max(2000)}).strict();
interface PaymentRow {id:string;invoice_id:string;invoice_number:string;customer_name:string;amount:string;method:Payment['method'];paid_at:string;note:string;request_hash:string;created_by:string;created_at:Date;updated_at:Date}
const select=`SELECT p.*,i.number invoice_number,i.customer_snapshot->>'company' customer_name FROM payments p JOIN invoices i ON i.id=p.invoice_id`;
function paymentDto(row:PaymentRow):Payment{return {id:row.id,...timestamps(row),invoiceId:row.invoice_id,invoiceNumber:row.invoice_number,customerName:row.customer_name,amount:safeInteger(row.amount),method:row.method,paidAt:row.paid_at,note:row.note};}
async function paymentById(db:Db,id:string){const row=await one<PaymentRow>(db,`${select} WHERE p.id=$1`,[id]);if(!row)throw missing();return paymentDto(row);}
export async function recordPayment(user:User,input:unknown,key:string) {
  z.string().min(16).max(200).regex(/^[A-Za-z0-9_-]+$/).parse(key);
  const data=paymentInput.parse(input),requestHash=digest(JSON.stringify([user.id,data.invoiceId,data.amount,data.method,data.paidAt,data.note]));
  return transaction(async db=>{
    // Serializes one retry key even when two requests name different invoices.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const previous=await one<{id:string;request_hash:string|null}>(db,'SELECT id,request_hash FROM payments WHERE idempotency_key=$1',[key]);
    if(previous){if(previous.request_hash!==requestHash)throw new HttpError(409,'IDEMPOTENCY_CONFLICT','This payment key was used for a different request');return paymentById(db,previous.id);}
    if(data.paidAt>await effectiveDate(db))throw new HttpError(422,'VALIDATION_ERROR','Payment date cannot be in the future',{paidAt:'Choose today or an earlier date'});
    const invoice=await invoiceRow(db,data.invoiceId,undefined,true);
    if(invoice.status!=='CONFIRMED')throw new HttpError(409,'INVALID_INVOICE_STATUS','Payments require a confirmed invoice with a balance');
    const balance=BigInt(invoice.total)-BigInt(invoice.paid);
    if(BigInt(data.amount)>balance)throw new HttpError(422,'OVERPAYMENT','Amount exceeds the remaining balance',{amount:'Exceeds balance'});
    const id=randomUUID(),paid=BigInt(invoice.paid)+BigInt(data.amount);
    await db.query('INSERT INTO payments(id,invoice_id,amount,method,paid_at,note,idempotency_key,created_by,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,data.invoiceId,data.amount,data.method,data.paidAt,data.note,key,user.id,requestHash]);
    await db.query('UPDATE invoices SET paid=$1,status=$2,updated_at=now() WHERE id=$3',[paid.toString(),paid===BigInt(invoice.total)?'PAID':'CONFIRMED',data.invoiceId]);
    await audit(db,user.id,'payment',id,'recorded',{invoiceId:data.invoiceId,amount:data.amount});
    return paymentById(db,id);
  });
}
export async function paymentsRoute(request:Request,parts:string[]) {
  const user=await requireUser(request,['ADMIN','STAFF']);
  if(parts.length!==1)throw missing();
  if(request.method==='POST'){checkOrigin(request);return Response.json(await recordPayment(user,await body(request),request.headers.get('Idempotency-Key')??''),{status:201});}
  if(request.method!=='GET')throw new HttpError(405,'METHOD_NOT_ALLOWED','Use GET or POST');
  const q=listQuery.parse(Object.fromEntries(new URL(request.url).searchParams)),values:unknown[]=[],where:string[]=[];
  const add=(sql:string,value:unknown)=>{values.push(value);where.push(sql.replace('?',`$${values.length}`));};
  if(q.customerId)add('i.customer_id=?',q.customerId);if(q.status)add('p.method=?',methods.parse(q.status));
  if(q.from)add('p.paid_at>=?::date',q.from);if(q.to)add('p.paid_at<=?::date',q.to);
  if(q.search)add("i.number||' '||(i.customer_snapshot->>'company')||' '||p.note ILIKE ?",`%${q.search}%`);
  const filter=where.length?` WHERE ${where.join(' AND ')}`:'';
  const total=await one<{count:string}>(getPool(),`SELECT count(*) FROM payments p JOIN invoices i ON i.id=p.invoice_id${filter}`,values);
  const rows=(await getPool().query<PaymentRow>(`${select}${filter} ORDER BY p.paid_at DESC,p.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.pageSize,(q.page-1)*q.pageSize])).rows;
  return Response.json({items:rows.map(paymentDto),total:safeInteger(total!.count),page:q.page,pageSize:q.pageSize});
}
