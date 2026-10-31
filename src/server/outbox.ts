import { createDecipheriv } from 'node:crypto';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { getPool, one, transaction } from './db';
import { HttpError, body } from './errors';
import { checkOrigin, requireUser } from './auth';
import { effectiveDate } from './clock';
import { invoiceDocument, invoiceRow } from './invoices';
import { safeInteger } from './values';
import { formatMoney } from '@/lib/format';
interface Message {to:string;subject:string;text:string;html?:string;messageId:string}
export type EmailSender=(message:Message)=>Promise<void>;
export function smtpSender():EmailSender {
  if(process.env.EMAIL_DELIVERY_ENABLED!=='true'||!process.env.SMTP_HOST||!process.env.SMTP_FROM)throw new HttpError(503,'EMAIL_NOT_CONFIGURED','SMTP delivery is not enabled and configured');
  const port=Number(process.env.SMTP_PORT??587);
  if(!Number.isInteger(port)||port<1||port>65535)throw new HttpError(503,'EMAIL_NOT_CONFIGURED','SMTP port is invalid');
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:true,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
  return async message=>{const result=await transport.sendMail({...message,from:process.env.SMTP_FROM});if(!result.accepted?.length||result.rejected?.length)throw new Error('SMTP recipient was not accepted');};
}
function decryptPayload(payload:unknown) {
  const p=z.object({iv:z.string(),data:z.string(),tag:z.string()}).parse(payload),key=process.env.OUTBOX_ENCRYPTION_KEY;
  if(!key||!/^[a-f0-9]{64}$/.test(key))throw new HttpError(503,'EMAIL_NOT_CONFIGURED','Reset email encryption key is not configured');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(p.iv,'hex'));decipher.setAuthTag(Buffer.from(p.tag,'hex'));
  return z.object({to:z.email(),url:z.url()}).parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(p.data,'hex')),decipher.final()]).toString()));
}
/** Serialized per message. SMTP may have an ambiguous acceptance outcome; never auto-retry DATA errors. */
export async function deliverOutbox(sender?:EmailSender,limit=10,onlyDedupeKey?:string) {
  const send=sender??smtpSender();z.number().int().min(1).max(50).parse(limit);
  const candidates=(await getPool().query<{id:string;kind:string;payload:unknown}>("SELECT id,kind,payload FROM outbox_messages WHERE sent_at IS NULL AND delivery_state IN ('QUEUED','FAILED') AND next_attempt_at<=now() AND attempts<5 AND ($2::text IS NULL OR dedupe_key=$2) ORDER BY created_at,id LIMIT $1",[limit,onlyDedupeKey??null])).rows;
  const result={sent:0,failed:0,uncertain:0,skipped:0};
  for(const candidate of candidates) {
    let outcome: "sent"|"failed"|"uncertain"|"skipped";
    let sendStarted=false;
    try { outcome=await transaction(async db=>{
      let invoice;
      if(candidate.kind==='INVOICE') {
        const p=z.object({invoiceId:z.string(),to:z.email()}).parse(candidate.payload);
        // Same lock order as cancellation: invoice before outbox.
        invoice=await invoiceRow(db,p.invoiceId,undefined,true);
      }
      const row=await one<{id:string;kind:string;payload:unknown;dedupe_key:string;attempts:number}>(db,"SELECT * FROM outbox_messages WHERE id=$1 AND sent_at IS NULL AND delivery_state IN ('QUEUED','FAILED') AND next_attempt_at<=now() AND attempts<5 FOR UPDATE SKIP LOCKED",[candidate.id]);
      if(!row)return 'skipped';
      let message:Message;
      const messageId=`<${row.id}@${new URL(process.env.APP_URL??'http://localhost:3000').hostname}>`;
      if(row.kind==='INVOICE'&&invoice) {
        if(!['CONFIRMED','PAID'].includes(invoice.status)){await db.query("UPDATE outbox_messages SET delivery_state='FAILED',last_error='Invoice is not issued',next_attempt_at=NULL WHERE id=$1",[row.id]);return 'failed';}
        const payload=z.object({to:z.email()}).parse(row.payload);
        message={to:payload.to,messageId,subject:`Invoice ${invoice.number}`,text:`Invoice ${invoice.number}: ${formatMoney(safeInteger(invoice.total))}. Due ${invoice.due_at}. Sign in to view or print: ${new URL(`/api/v1/invoices/${invoice.id}/document`,process.env.APP_URL).href}`,html:await invoiceDocument(db,invoice,await effectiveDate(db))};
      } else if(row.kind==='PASSWORD_RESET') {
        const valid=await one(db,'SELECT token_hash FROM password_resets WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL',[row.dedupe_key.slice('reset:'.length)]);
        if(!valid){await db.query("UPDATE outbox_messages SET delivery_state='FAILED',last_error='Reset expired; request a new link',next_attempt_at=NULL WHERE id=$1",[row.id]);return 'failed';}
        const payload=decryptPayload(row.payload);
        message={to:payload.to,messageId,subject:'Reset your LoopLedger password',text:`Use this single-use link within 30 minutes: ${payload.url}`};
      } else {throw new Error('Unknown outbox message kind');}
      let accepted=false;
      try {
        sendStarted=true;await send(message);accepted=true;
        await db.query("UPDATE outbox_messages SET sent_at=now(),attempts=attempts+1,delivery_state='SENT',last_error=NULL,next_attempt_at=NULL,payload=CASE WHEN kind='PASSWORD_RESET' THEN '{}'::jsonb ELSE payload END WHERE id=$1",[row.id]);
        return 'sent';
      } catch(error) {
        const uncertain=accepted||(!!error&&typeof error==='object'&&'command' in error&&error.command==='DATA');
        await db.query("UPDATE outbox_messages SET attempts=attempts+1,delivery_state=$2,last_error=$3,next_attempt_at=CASE WHEN $4 THEN NULL ELSE now()+interval '5 minutes' END WHERE id=$1",[row.id,uncertain?'UNCERTAIN':'FAILED',uncertain?'SMTP acceptance is uncertain; reconcile before retrying':'SMTP attempt failed; retry is available',uncertain]);
        return uncertain?'uncertain':'failed';
      }
    }); } catch {
      // A malformed payload must not poison the rest of the queue. If SMTP began,
      // a database/process failure may leave acceptance unknown.
      outcome=sendStarted?'uncertain':'failed';
      await getPool().query("UPDATE outbox_messages SET delivery_state=$2,attempts=attempts+1,last_error=$3,next_attempt_at=NULL WHERE id=$1 AND sent_at IS NULL",[candidate.id,sendStarted?'UNCERTAIN':'FAILED',sendStarted?'SMTP outcome could not be persisted; reconcile before retrying':'Message configuration or snapshot invalid; resolve before retrying']);
    }
    result[outcome]++;
  }
  return result;
}
export async function outboxRoute(request:Request,parts:string[]) {
  await requireUser(request,['ADMIN']);
  if(request.method==='GET'&&parts.length===1) {
    return Response.json((await getPool().query('SELECT id,kind,delivery_state AS status,attempts,last_error AS "lastError",created_at AS "createdAt",sent_at AS "sentAt" FROM outbox_messages ORDER BY created_at DESC,id LIMIT 100')).rows);
  }
  checkOrigin(request);
  if(request.method==='POST'&&parts.join('/')==='outbox/run')return Response.json(await deliverOutbox());
  if(request.method==='POST'&&parts.length===3&&parts[2]==='retry') {
    const {confirmUnknownDelivery}=z.object({confirmUnknownDelivery:z.boolean().default(false)}).strict().parse(await body(request));
    await transaction(async db=>{
      const row=await one<{delivery_state:string;sent_at:Date|null}>(db,'SELECT * FROM outbox_messages WHERE id=$1 FOR UPDATE',[parts[1]]);
      if(!row)throw new HttpError(404,'NOT_FOUND','Outbox record not found');
      if(row.sent_at)throw new HttpError(409,'ALREADY_SENT','SMTP already accepted this message');
      if(row.delivery_state==='UNCERTAIN'&&!confirmUnknownDelivery)throw new HttpError(409,'DELIVERY_UNCERTAIN','Confirm delivery reconciliation before retrying an uncertain send');
      await db.query("UPDATE outbox_messages SET delivery_state='QUEUED',next_attempt_at=now(),attempts=0,last_error=NULL WHERE id=$1",[parts[1]]);
    });
    return Response.json({queued:true});
  }
  throw new HttpError(405,'METHOD_NOT_ALLOWED','Unsupported method');
}
