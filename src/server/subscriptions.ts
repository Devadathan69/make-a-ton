import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Subscription, SubscriptionAction, SubscriptionInput, User, Invoice, DiscountRule, BillingInterval } from '@/lib/contracts';
import { getPool, one, transaction, type Db } from './db';
import { getResource, getResourcesByIds, validateLines, validateReferences } from './catalog';
import { checkOrigin, requireUser } from './auth';
import { body, HttpError, missing } from './errors';
import { dateOnly, lineInput, listQuery, planSnapshot, safeInteger, taxSnapshot, timestamps } from './values';
import { effectiveDate } from './clock';
import { addDays, isBoundary, nextCycle } from './dates';
import { calculate, type BillingLine } from './billing/calculator';
const inputSchema=z.object({customerId:z.string().min(1),planId:z.string().min(1),templateId:z.string().optional(),startDate:dateOnly,expiryDate:dateOnly.nullable(),paymentTermsDays:z.number().int().min(0).max(3650),quotationValidUntil:dateOnly.nullable(),lines:z.array(lineInput.strict()).max(100)}).strict();
export interface SubscriptionRow {
  id:string;number:string;customer_id:string;plan_id:string;template_id:string|null;status:Subscription['status'];start_date:string;expiry_date:string|null;next_billing_date:string|null;payment_terms_days:number;quotation_valid_until:string|null;plan_snapshot:unknown;cycle_anchor:string|null;created_at:Date;updated_at:Date;customer_name:string;plan_name:string;plan_price:string;plan_interval:BillingInterval;plan_auto_close:boolean;plan_allow_early_close:boolean;plan_allow_pause:boolean;plan_allow_renew:boolean;
}
interface LineRow {id:string;product_id:string;variant_id:string|null;description:string;quantity:number;unit_price:string;tax_ids:string[];tax_snapshot:unknown;pricing_snapshot:unknown}
export const subscriptionSelect=`SELECT s.*,c.company customer_name,p.name plan_name,p.price plan_price,p.interval plan_interval,p.auto_close plan_auto_close,p.allow_early_close plan_allow_early_close,p.allow_pause plan_allow_pause,p.allow_renew plan_allow_renew FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id`;
export async function subscriptionRow(db:Db,id:string,user?:User,lock=false) {
  const row=await one<SubscriptionRow>(db,`${subscriptionSelect} WHERE s.id=$1${user?.role==='CUSTOMER'?' AND s.customer_id=$2':''}${lock?' FOR UPDATE OF s':''}`,[id,...(user?.role==='CUSTOMER'?[user.customerId]:[])]);
  if(!row)throw missing();return row;
}
export async function subscriptionLines(db:Db,id:string){return (await db.query<LineRow>('SELECT * FROM subscription_lines WHERE subscription_id=$1 ORDER BY id',[id])).rows;}
function policy(row:SubscriptionRow) {
  if(row.plan_snapshot)return planSnapshot.parse(row.plan_snapshot);
  return {name:row.plan_name,price:safeInteger(row.plan_price),interval:row.plan_interval,autoClose:row.plan_auto_close,allowEarlyClose:row.plan_allow_early_close,allowPause:row.plan_allow_pause,allowRenew:row.plan_allow_renew,taxes:[]};
}
export async function allowedActions(db:Db,row:SubscriptionRow,user:User,asOf:string):Promise<SubscriptionAction[]> {
  const p=policy(row),internal=user.role!=='CUSTOMER';
  if(row.status==='DRAFT')return internal?['quote']:[];
  if(row.status==='QUOTATION')return internal&&!!row.quotation_valid_until&&row.quotation_valid_until>=asOf?['confirm']:[];
  const actions:SubscriptionAction[]=[];
  const inWindow=!row.expiry_date||row.expiry_date>asOf;
  if(row.status==='CONFIRMED'&&internal&&row.start_date<=asOf&&inWindow)actions.push('activate');
  if(row.status==='ACTIVE'&&p.allowPause&&inWindow)actions.push('pause');
  if(row.status==='PAUSED'&&inWindow&&(!row.expiry_date||isBoundary(asOf,row.expiry_date,p.interval)))actions.push('resume');
  if(['CONFIRMED','ACTIVE','PAUSED'].includes(row.status)&&p.allowRenew&&row.expiry_date)actions.push('renew');
  if(['CONFIRMED','ACTIVE','PAUSED'].includes(row.status)&&p.allowEarlyClose)actions.push('close');
  return actions;
}
export async function subscriptionDto(db:Db,row:SubscriptionRow,user:User,asOf:string,lines?:LineRow[]):Promise<Subscription> {
  const p=policy(row);
  return {id:row.id,...timestamps(row),number:row.number,customerId:row.customer_id,customerName:row.customer_name,planId:row.plan_id,planName:p.name,status:row.status,startDate:row.start_date,expiryDate:row.expiry_date,nextBillingDate:row.next_billing_date,paymentTermsDays:row.payment_terms_days,quotationValidUntil:row.quotation_valid_until,allowedActions:await allowedActions(db,row,user,asOf),lines:(lines??await subscriptionLines(db,row.id)).map(l=>({id:l.id,productId:l.product_id,variantId:l.variant_id,quantity:l.quantity,taxIds:z.array(z.string()).parse(l.tax_ids),description:l.description,unitPrice:safeInteger(l.unit_price),subtotal:safeInteger(BigInt(l.unit_price)*BigInt(l.quantity))}))};
}
export async function resolveEconomics(db:Db,input:SubscriptionInput) {
  const bounded=(value:bigint)=>{try{return safeInteger(value);}catch{throw new HttpError(422,'AMOUNT_RANGE','Contract economics exceed supported safe amounts',{'lines':'Reduce price or quantity'});}};
  await validateReferences(db,'customers',[input.customerId],'customerId');
  await validateReferences(db,'plans',[input.planId],'planId',true);
  if(!input.lines.length)throw new HttpError(422,'VALIDATION_ERROR','Add at least one product',{'lines':'Required'});
  await validateLines(db,input.lines);
  const p=await getResource(db,'plans',input.planId);
  if(input.startDate<p.availableFrom||(p.availableUntil&&input.startDate>p.availableUntil))throw new HttpError(422,'VALIDATION_ERROR','Start date is outside plan availability',{startDate:'Choose an available date'});
  if(input.lines.reduce((n,l)=>n+l.quantity,0)<p.minimumQuantity)throw new HttpError(422,'VALIDATION_ERROR','Minimum quantity is not met',{'lines':'Increase quantity'});
  if(input.expiryDate&&(input.expiryDate<=input.startDate||!isBoundary(input.startDate,input.expiryDate,p.interval)))throw new HttpError(422,'OFF_CYCLE_EXPIRY','MVP expiry must fall on a billing boundary; proration is not supported',{expiryDate:'Choose a billing boundary'});
  await validateReferences(db,'taxes',p.taxIds,'taxIds',true);
  const referencedTaxes=await getResourcesByIds(db,'taxes',[...p.taxIds,...input.lines.flatMap(l=>l.taxIds)]);
  const taxMap=new Map(referencedTaxes.map(t=>[t.id,{id:t.id,name:t.name,rateBps:t.rateBps}]));
  const taxes=(ids:string[])=>ids.map(id=>taxMap.get(id)!);
  const products=new Map((await getResourcesByIds(db,'products',input.lines.map(l=>l.productId))).map(product=>[product.id,product]));
  const plan={name:p.name,price:p.price,interval:p.interval,autoClose:p.autoClose,allowEarlyClose:p.allowEarlyClose,allowPause:p.allowPause,allowRenew:p.allowRenew,taxes:taxes(p.taxIds)};
  const lines=[];
  for(const l of input.lines) {
    const product=products.get(l.productId)!,variant=product.variants.find(v=>v.id===l.variantId);
    const unitPrice=bounded(BigInt(product.salesPrice)+BigInt(variant?.priceAdjustment??0));bounded(BigInt(unitPrice)*BigInt(l.quantity));
    lines.push({...l,description:product.name+(variant?` / ${variant.name}`:''),unitPrice,taxes:taxes(l.taxIds),pricing:{product:{id:product.id,name:product.name,notes:product.notes,salesPrice:product.salesPrice},variant:variant??null}});
  }
  bounded(lines.reduce((n,l)=>n+BigInt(l.unitPrice)*BigInt(l.quantity),BigInt(plan.price)));
  try {
    const billing:BillingLine[]=lines.map((l,i)=>({...l,id:`validate_${i}`}));
    if(plan.price||plan.taxes.length)billing.push({id:'validate_base',productId:null,description:plan.name,quantity:1,unitPrice:plan.price,taxes:plan.taxes});
    calculate(billing,[],input.startDate);
  } catch { throw new HttpError(422,'AMOUNT_RANGE','Contract totals including taxes exceed supported safe amounts',{'lines':'Reduce price or quantity'}); }
  return {plan,lines};
}
async function replaceLines(db:Db,id:string,economics:Awaited<ReturnType<typeof resolveEconomics>>) {
  await db.query('DELETE FROM subscription_lines WHERE subscription_id=$1',[id]);
  for(const l of economics.lines)await db.query('INSERT INTO subscription_lines(id,subscription_id,product_id,variant_id,description,quantity,unit_price,tax_ids,tax_snapshot,pricing_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),id,l.productId,l.variantId,l.description,l.quantity,l.unitPrice,JSON.stringify(l.taxIds),JSON.stringify(l.taxes),l.pricing]);
}
export async function audit(db:Db,actor:string|null,entity:string,id:string,action:string,details:unknown={}){await db.query('INSERT INTO audit_events(id,actor_id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,entity,id,action,details]);}
export async function saveSubscription(user:User,input:unknown,id?:string) {
  return transaction(async db=>{
    let merged=input;
    const asOf=await effectiveDate(db);
    if(id) {
      const row=await subscriptionRow(db,id,user,true);
      if(!['DRAFT','QUOTATION'].includes(row.status))throw new HttpError(409,'ECONOMICS_LOCKED','Confirmed contract economics cannot be edited');
      const old=await subscriptionDto(db,row,user,asOf);
      merged={customerId:old.customerId,planId:old.planId,...(row.template_id?{templateId:row.template_id}:{}),startDate:old.startDate,expiryDate:old.expiryDate,paymentTermsDays:old.paymentTermsDays,quotationValidUntil:old.quotationValidUntil,lines:old.lines.map(({productId,variantId,quantity,taxIds})=>({productId,variantId,quantity,taxIds})),...(input as object)};
    }
    const data=inputSchema.parse(merged);
    if(data.templateId) {
      const template=await getResource(db,'templates',data.templateId);
      if(template.planId!==data.planId)throw new HttpError(422,'VALIDATION_ERROR','Template belongs to another plan',{planId:'Match template plan'});
      if(!data.lines.length)data.lines=template.lines;
      data.quotationValidUntil??=addDays(asOf,template.validDays);
    }
    const economics=await resolveEconomics(db,data),entityId=id??randomUUID();
    if(id)await db.query('UPDATE subscriptions SET customer_id=$1,plan_id=$2,template_id=$3,start_date=$4,expiry_date=$5,payment_terms_days=$6,quotation_valid_until=$7,updated_at=now() WHERE id=$8',[data.customerId,data.planId,data.templateId??null,data.startDate,data.expiryDate,data.paymentTermsDays,data.quotationValidUntil,entityId]);
    else await db.query("INSERT INTO subscriptions(id,number,customer_id,plan_id,template_id,status,start_date,expiry_date,payment_terms_days,quotation_valid_until,cycle_anchor) VALUES($1,'SUB-'||$2||'-'||lpad(nextval('subscription_number_seq')::text,6,'0'),$3,$4,$5,'DRAFT',$6,$7,$8,$9,$6)",[entityId,asOf.slice(0,4),data.customerId,data.planId,data.templateId??null,data.startDate,data.expiryDate,data.paymentTermsDays,data.quotationValidUntil]);
    await replaceLines(db,entityId,economics);await audit(db,user.id,'subscription',entityId,id?'updated':'created');
    return subscriptionDto(db,await subscriptionRow(db,entityId),user,asOf);
  });
}
export async function transition(user:User,id:string,action:SubscriptionAction,startDate?:string) {
  return transaction(async db=>{
    const row=await subscriptionRow(db,id,user,true),asOf=await effectiveDate(db),p=policy(row);
    const closedRenew=row.status==='CLOSED'&&action==='renew'&&p.allowRenew&&startDate&&startDate>asOf;
    if(!(await allowedActions(db,row,user,asOf)).includes(action)&&!closedRenew)throw new HttpError(409,'INVALID_TRANSITION','This action is not available for this status, date or policy');
    if(['pause','close','resume'].includes(action)&&row.next_billing_date&&row.next_billing_date<asOf)throw new HttpError(422,'BILLING_CATCH_UP_REQUIRED','Run due billing before changing this subscription');
    if(action==='quote')await db.query("UPDATE subscriptions SET status='QUOTATION',quotation_valid_until=COALESCE(quotation_valid_until,$1::date+14),updated_at=now() WHERE id=$2",[asOf,id]);
    if(action==='confirm') {
      const dto=await subscriptionDto(db,row,user,asOf);
      const economics=await resolveEconomics(db,{customerId:row.customer_id,planId:row.plan_id,startDate:row.start_date,expiryDate:row.expiry_date,paymentTermsDays:row.payment_terms_days,quotationValidUntil:row.quotation_valid_until,lines:dto.lines});
      await replaceLines(db,id,economics);
      await db.query("UPDATE subscriptions SET status='CONFIRMED',plan_snapshot=$1,cycle_anchor=start_date,billing_anchor_day=extract(day from start_date),updated_at=now() WHERE id=$2",[economics.plan,id]);
    }
    if(action==='activate')await db.query("UPDATE subscriptions SET status='ACTIVE',next_billing_date=start_date,updated_at=now() WHERE id=$1",[id]);
    if(action==='pause')await db.query("UPDATE subscriptions SET status='PAUSED',paused_at=$1,next_billing_date=NULL,updated_at=now() WHERE id=$2",[asOf,id]);
    if(action==='resume')await db.query("UPDATE subscriptions SET status='ACTIVE',paused_at=NULL,cycle_anchor=$1,next_billing_date=$1,updated_at=now() WHERE id=$2",[asOf,id]);
    if(action==='close')await db.query("UPDATE subscriptions SET status='CLOSED',closed_at=$1,next_billing_date=NULL,updated_at=now() WHERE id=$2",[asOf,id]);
    if(action==='renew') {
      const anchor=row.cycle_anchor??row.start_date;
      const expiry=closedRenew?nextCycle(startDate!,startDate!,p.interval):row.expiry_date?nextCycle(anchor,row.expiry_date,p.interval):null;
      if(!expiry||expiry<=asOf)throw new HttpError(422,'INVALID_RENEWAL','Renewal must extend expiry into a future billing cycle');
      if(closedRenew)await db.query("UPDATE subscriptions SET status='CONFIRMED',start_date=$1,cycle_anchor=$1,expiry_date=$2,closed_at=NULL,next_billing_date=NULL,updated_at=now() WHERE id=$3",[startDate,expiry,id]);
      else await db.query('UPDATE subscriptions SET expiry_date=$1,updated_at=now() WHERE id=$2',[expiry,id]);
    }
    await audit(db,user.id,'subscription',id,action,{from:row.status,asOf,...(startDate?{startDate}:{})});
    return subscriptionDto(db,await subscriptionRow(db,id),user,asOf);
  });
}
export async function billingInputs(db:Db,row:SubscriptionRow) {
  const p=policy(row),stored=await subscriptionLines(db,row.id);
  let lines:BillingLine[]=stored.map(l=>({id:l.id,productId:l.product_id,description:l.description,quantity:l.quantity,unitPrice:safeInteger(l.unit_price),taxes:taxSnapshot.parse(l.tax_snapshot)}));
  if(!row.plan_snapshot){const dto=await resolveEconomics(db,{customerId:row.customer_id,planId:row.plan_id,startDate:row.start_date,expiryDate:row.expiry_date,paymentTermsDays:row.payment_terms_days,quotationValidUntil:row.quotation_valid_until,lines:stored.map(l=>({productId:l.product_id,variantId:l.variant_id,quantity:l.quantity,taxIds:l.tax_ids}))});lines=dto.lines.map((l,i)=>({id:stored[i].id,productId:l.productId,description:l.description,quantity:l.quantity,unitPrice:l.unitPrice,taxes:l.taxes}));p.taxes=dto.plan.taxes;}
  if(p.price||p.taxes.length)lines.push({id:`base_${row.id}`,productId:null,description:`${p.name} base fee`,quantity:1,unitPrice:p.price,taxes:p.taxes});
  return {plan:p,lines};
}
export async function discountRules(db:Db,lock=false):Promise<DiscountRule[]> {
  const rows=(await db.query(`SELECT id FROM discounts ORDER BY id${lock?' FOR UPDATE':''}`)).rows;
  return getResourcesByIds(db,'discounts',rows.map(r=>r.id));
}
export async function preview(user:User,id:string):Promise<Invoice> {
  const db=getPool(),row=await subscriptionRow(db,id,user),asOf=await effectiveDate(db),input=await billingInputs(db,row),period=row.next_billing_date??row.start_date;
  const result=calculate(input.lines,await discountRules(db),period),{ruleIds,...calculation}=result;void ruleIds;
  return {id:`preview_${id}`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),number:'PREVIEW',subscriptionId:id,customerId:row.customer_id,customerName:row.customer_name,status:'DRAFT',issuedAt:asOf,dueAt:addDays(asOf,row.payment_terms_days),periodStart:period,periodEnd:nextCycle(row.cycle_anchor??row.start_date,period,input.plan.interval),paid:0,balance:result.total,overdue:false,...calculation};
}
export async function subscriptionsRoute(request:Request,parts:string[],portal=false) {
  const user=await requireUser(request,portal?['CUSTOMER']:['ADMIN','STAFF']);
  const id=parts[1],db=getPool(),asOf=await effectiveDate(db);
  if(request.method==='GET') {
    if(parts.length===3&&parts[2]==='preview'&&!portal)return Response.json(await preview(user,id));
    if(parts.length===2)return Response.json(await subscriptionDto(db,await subscriptionRow(db,id,user),user,asOf));
    if(parts.length!==1)throw missing();
    const q=listQuery.parse(Object.fromEntries(new URL(request.url).searchParams)),values:unknown[]=[],where:string[]=[];
    const add=(sql:string,value:unknown)=>{values.push(value);where.push(sql.replace('?',`$${values.length}`));};
    if(portal)add('s.customer_id=?',user.customerId);else if(q.customerId)add('s.customer_id=?',q.customerId);
    if(q.status)add('s.status=?',z.enum(['DRAFT','QUOTATION','CONFIRMED','ACTIVE','PAUSED','CLOSED']).parse(q.status));
    if(q.search)add("s.number||' '||c.company||' '||p.name ILIKE ?",`%${q.search}%`);
    if(q.from)add('s.start_date>=?::date',q.from);if(q.to)add('s.start_date<=?::date',q.to);
    const filter=where.length?` WHERE ${where.join(' AND ')}`:'';
    const count=await one<{count:string}>(db,`SELECT count(*) FROM (${subscriptionSelect}${filter}) counted`,values);
    const rows=(await db.query<SubscriptionRow>(`${subscriptionSelect}${filter} ORDER BY s.created_at DESC,s.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.pageSize,(q.page-1)*q.pageSize])).rows;
    const lines=(await db.query<LineRow&{subscription_id:string}>('SELECT * FROM subscription_lines WHERE subscription_id=ANY($1::text[]) ORDER BY id',[rows.map(r=>r.id)])).rows;
    return Response.json({items:await Promise.all(rows.map(r=>subscriptionDto(db,r,user,asOf,lines.filter(l=>l.subscription_id===r.id)))),total:safeInteger(count!.count),page:q.page,pageSize:q.pageSize});
  }
  checkOrigin(request);
  if(parts.length===3&&parts[2]==='transition'&&request.method==='POST') {
    const data=z.object({action:z.enum(['quote','confirm','activate','pause','resume','renew','close']),startDate:dateOnly.optional()}).strict().parse(await body(request));
    return Response.json(await transition(user,id,data.action,data.startDate));
  }
  if(!portal&&parts.length===1&&request.method==='POST')return Response.json(await saveSubscription(user,await body(request)),{status:201});
  if(!portal&&parts.length===2&&request.method==='PATCH')return Response.json(await saveSubscription(user,await body(request),id));
  throw new HttpError(405,'METHOD_NOT_ALLOWED','Unsupported method');
}
