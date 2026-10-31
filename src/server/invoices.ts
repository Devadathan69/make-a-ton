import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Invoice, InvoiceStatus, User } from '@/lib/contracts';
import { getPool, one, transaction, type Db } from './db';
import { body, HttpError, missing } from './errors';
import { checkOrigin, requireUser } from './auth';
import { effectiveDate } from './clock';
import { listQuery, safeInteger, timestamps } from './values';
import { audit } from './subscriptions';
import { formatMoney } from '@/lib/format';
export const customerSnapshot=z.object({name:z.string(),email:z.email(),company:z.string(),address:z.string()});
export interface InvoiceRow {id:string;number:string;subscription_id:string;customer_id:string;customer_snapshot:unknown;status:InvoiceStatus;issued_at:string;due_at:string;period_start:string;period_end:string;subtotal:string;discount:string;tax:string;total:string;paid:string;explanation:unknown;created_at:Date;updated_at:Date;email_status?:Invoice['emailStatus'];email_error?:string|null}
export interface InvoiceLineRow {id:string;invoice_id:string;description:string;quantity:number;unit_price:string;subtotal:string;discount:string;tax:string;total:string}
export const invoiceSelect=`SELECT i.*,(SELECT delivery_state FROM outbox_messages WHERE dedupe_key='invoice:'||i.id) email_status,(SELECT last_error FROM outbox_messages WHERE dedupe_key='invoice:'||i.id) email_error FROM invoices i`;
export async function invoiceRow(db:Db,id:string,user?:User,lock=false) {
  const row=await one<InvoiceRow>(db,`${invoiceSelect} WHERE i.id=$1${user?.role==='CUSTOMER'?' AND i.customer_id=$2':''}${lock?' FOR UPDATE OF i':''}`,[id,...(user?.role==='CUSTOMER'?[user.customerId]:[])]);if(!row)throw missing();return row;
}
export async function invoiceDto(db:Db,row:InvoiceRow,asOf:string,storedLines?:InvoiceLineRow[]):Promise<Invoice> {
  const customer=customerSnapshot.parse(row.customer_snapshot),total=safeInteger(row.total),paid=safeInteger(row.paid),balance=row.status==='CANCELLED'?0:total-paid;
  const lines=(storedLines??(await db.query<InvoiceLineRow>('SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY id',[row.id])).rows).map(l=>({id:l.id,description:l.description,quantity:l.quantity,unitPrice:safeInteger(l.unit_price),subtotal:safeInteger(l.subtotal),discount:safeInteger(l.discount),tax:safeInteger(l.tax),total:safeInteger(l.total)}));
  for(const field of ['subtotal','discount','tax','total'] as const)if(lines.reduce((n,l)=>n+BigInt(l[field]),0n)!==BigInt(row[field]))throw new Error('Invoice lines do not reconcile');
  return {id:row.id,...timestamps(row),number:row.number,subscriptionId:row.subscription_id,customerId:row.customer_id,customerName:customer.company,status:row.status,issuedAt:row.issued_at,dueAt:row.due_at,periodStart:row.period_start,periodEnd:row.period_end,subtotal:safeInteger(row.subtotal),discount:safeInteger(row.discount),tax:safeInteger(row.tax),total,paid,balance,overdue:row.status==='CONFIRMED'&&balance>0&&asOf>row.due_at,lines,explanation:z.array(z.string()).parse(row.explanation),...(row.email_status?{emailStatus:row.email_status,emailError:row.email_error}:{} )};
}
export const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function invoiceDocument(db:Db,row:InvoiceRow,asOf:string) {
  const i=await invoiceDto(db,row,asOf),c=customerSnapshot.parse(row.customer_snapshot),e=escapeHtml,m=(n:number)=>e(formatMoney(n));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(i.number)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;max-width:960px;margin:3rem auto;padding:1rem;color:#172420}table{width:100%;border-collapse:collapse}th,td{padding:.75rem;border-bottom:1px solid #bbb;text-align:right}th:first-child,td:first-child{text-align:left}dl{display:grid;grid-template-columns:1fr 1fr}dt,dd{padding:.3rem}@media print{body{margin:0} .print-help{display:none}}</style></head><body><h1>LoopLedger · Invoice ${e(i.number)}</h1><p>${e(i.status)}</p><h2>${e(c.company)}</h2><p>${e(c.name)} · ${e(c.email)}<br>${e(c.address)}</p><dl><dt>Issued</dt><dd>${e(i.issuedAt)}</dd><dt>Due</dt><dd>${e(i.dueAt)}</dd><dt>Billing period (end exclusive)</dt><dd>${e(i.periodStart)} to ${e(i.periodEnd)}</dd><dt>Payment terms</dt><dd>${Math.round((Date.parse(i.dueAt)-Date.parse(i.issuedAt))/86400000)} days from issue</dd></dl><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Subtotal</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>${i.lines.map(l=>`<tr><td>${e(l.description)}</td><td>${l.quantity}</td><td>${m(l.unitPrice)}</td><td>${m(l.subtotal)}</td><td>${m(l.discount)}</td><td>${m(l.tax)}</td><td>${m(l.total)}</td></tr>`).join('')}</tbody></table><dl><dt>Subtotal</dt><dd>${m(i.subtotal)}</dd><dt>Discount</dt><dd>${m(i.discount)}</dd><dt>Illustrative configured taxes</dt><dd>${m(i.tax)}</dd><dt>Total</dt><dd>${m(i.total)}</dd><dt>Paid</dt><dd>${m(i.paid)}</dd><dt>Balance</dt><dd>${m(i.balance)}</dd></dl><h2>Calculation</h2><ul>${i.explanation.map(s=>`<li>${e(s)}</li>`).join('')}</ul><p class="print-help">Use your browser’s Print command to print or save as PDF.</p></body></html>`;
}
export async function invoiceAction(user:User,id:string,action:'confirm'|'cancel'|'send') {
  return transaction(async db=>{
    const row=await invoiceRow(db,id,user,true);
    if(action==='confirm') {
      if(row.status!=='DRAFT')throw new HttpError(409,'INVALID_TRANSITION','Only draft invoices can be confirmed');
      await db.query('UPDATE invoices SET status=$1,updated_at=now() WHERE id=$2',[BigInt(row.total)===0n?'PAID':'CONFIRMED',id]);
    }
    if(action==='cancel') {
      if(!['DRAFT','CONFIRMED'].includes(row.status)||BigInt(row.paid)!==0n)throw new HttpError(409,'INVALID_TRANSITION','Only unpaid draft or confirmed invoices can be cancelled');
      await db.query("SELECT d.id FROM discounts d JOIN discount_redemptions r ON r.discount_id=d.id WHERE r.invoice_id=$1 AND r.released_at IS NULL ORDER BY d.id FOR UPDATE OF d",[id]);
      const released=(await db.query('UPDATE discount_redemptions SET released_at=now() WHERE invoice_id=$1 AND released_at IS NULL RETURNING discount_id',[id])).rows;
      for(const r of released) {
        const changed=await db.query('UPDATE discounts SET usage_count=usage_count-1,updated_at=now() WHERE id=$1 AND usage_count>0 RETURNING id',[r.discount_id]);if(!changed.rowCount)throw new HttpError(409,'INVALID_REDEMPTION','Redemption usage could not be released');
      }
      await db.query("UPDATE invoices SET status='CANCELLED',updated_at=now() WHERE id=$1",[id]);
      await db.query("UPDATE outbox_messages SET delivery_state='FAILED',last_error='Invoice cancelled',next_attempt_at=NULL WHERE dedupe_key=$1 AND sent_at IS NULL",[`invoice:${id}`]);
    }
    if(action==='send') {
      if(!['CONFIRMED','PAID'].includes(row.status))throw new HttpError(409,'INVALID_TRANSITION','Only issued invoices can be sent');
      const customer=customerSnapshot.parse(row.customer_snapshot);
      const existing=await one<{delivery_state:string}>(db,'SELECT delivery_state FROM outbox_messages WHERE dedupe_key=$1',[`invoice:${id}`]);
      if(existing?.delivery_state==='UNCERTAIN')throw new HttpError(409,'DELIVERY_UNCERTAIN','SMTP outcome is uncertain. Reconcile delivery in the outbox before retrying.');
      await db.query("INSERT INTO outbox_messages(id,dedupe_key,kind,payload) VALUES($1,$2,'INVOICE',$3) ON CONFLICT(dedupe_key) DO UPDATE SET delivery_state=CASE WHEN outbox_messages.sent_at IS NULL THEN 'QUEUED' ELSE outbox_messages.delivery_state END,next_attempt_at=CASE WHEN outbox_messages.sent_at IS NULL THEN now() ELSE outbox_messages.next_attempt_at END,last_error=CASE WHEN outbox_messages.sent_at IS NULL THEN NULL ELSE outbox_messages.last_error END",[randomUUID(),`invoice:${id}`,{invoiceId:id,to:customer.email}]);
    }
    await audit(db,user.id,'invoice',id,action);
    return invoiceDto(db,await invoiceRow(db,id),await effectiveDate(db));
  });
}
export async function invoicesRoute(request:Request,parts:string[],portal=false) {
  const id=parts[1],user=await requireUser(request,portal?['CUSTOMER']:request.method==='GET'&&id?['ADMIN','STAFF','CUSTOMER']:['ADMIN','STAFF']),db=getPool(),asOf=await effectiveDate(db);
  if(request.method==='GET') {
    if(parts.length===3&&parts[2]==='document') {
      const row=await invoiceRow(db,id,user);
      return new Response(await invoiceDocument(db,row,asOf),{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`inline; filename="${row.number.replace(/[^A-Za-z0-9-]/g,'')}.html"`,'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'}});
    }
    if(parts.length===2)return Response.json(await invoiceDto(db,await invoiceRow(db,id,user),asOf));
    if(parts.length!==1)throw missing();
    const q=listQuery.parse(Object.fromEntries(new URL(request.url).searchParams)),values:unknown[]=[],where:string[]=[];
    const add=(sql:string,value:unknown)=>{values.push(value);where.push(sql.replace('?',`$${values.length}`));};
    if(portal)add('i.customer_id=?',user.customerId);else if(q.customerId)add('i.customer_id=?',q.customerId);
    if(q.status==='OVERDUE'){where.push("i.status='CONFIRMED' AND i.paid<i.total");add('i.due_at<?::date',asOf);}else if(q.status)add('i.status=?',z.enum(['DRAFT','CONFIRMED','PAID','CANCELLED']).parse(q.status));
    if(q.search)add("i.number||' '||(i.customer_snapshot->>'company') ILIKE ?",`%${q.search}%`);
    if(q.from)add('i.issued_at>=?::date',q.from);if(q.to)add('i.issued_at<=?::date',q.to);
    const filter=where.length?` WHERE ${where.join(' AND ')}`:'';
    const count=await one<{count:string}>(db,`SELECT count(*) FROM invoices i${filter}`,values);
    const rows=(await db.query<InvoiceRow>(`${invoiceSelect}${filter} ORDER BY i.issued_at DESC,i.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.pageSize,(q.page-1)*q.pageSize])).rows;
    const lines=(await db.query<InvoiceLineRow>('SELECT * FROM invoice_lines WHERE invoice_id=ANY($1::text[]) ORDER BY id',[rows.map(r=>r.id)])).rows;
    return Response.json({items:await Promise.all(rows.map(r=>invoiceDto(db,r,asOf,lines.filter(l=>l.invoice_id===r.id)))),total:safeInteger(count!.count),page:q.page,pageSize:q.pageSize});
  }
  if(portal)throw new HttpError(403,'FORBIDDEN','Invoices are read-only in the portal');
  checkOrigin(request);
  if(request.method==='POST'&&parts.length===3&&parts[2]==='actions') {
    const {action}=z.object({action:z.enum(['confirm','cancel','send'])}).strict().parse(await body(request));
    return Response.json(await invoiceAction(user,id,action));
  }
  throw new HttpError(405,'METHOD_NOT_ALLOWED','Unsupported method');
}
