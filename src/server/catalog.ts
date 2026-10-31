import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Product, Plan, TaxRule, DiscountRule, Customer, QuoteTemplate, LineInput } from '@/lib/contracts';
import { getPool, one, transaction, type Db } from './db';
import { body, HttpError, missing } from './errors';
import { checkOrigin, requireUser } from './auth';
import { dateOnly, lineInput, listQuery, money, safeInteger } from './values';
const name=z.string().trim().min(1).max(200),ids=z.array(z.string().min(1)).max(100).refine(v=>new Set(v).size===v.length,'Remove duplicate references');
const schemas={
  products:z.object({name,type:z.enum(['SOFTWARE','SERVICE','ADDON']),salesPrice:money,costPrice:money,notes:z.string().max(5000),active:z.boolean(),variants:z.array(z.object({id:z.string().optional(),name,priceAdjustment:money}).strict()).max(100)}).strict(),
  plans:z.object({name,price:money,interval:z.enum(['DAILY','WEEKLY','MONTHLY','YEARLY']),minimumQuantity:z.number().int().min(1).max(1000000),availableFrom:dateOnly,availableUntil:dateOnly.nullable(),autoClose:z.boolean(),allowEarlyClose:z.boolean(),allowPause:z.boolean(),allowRenew:z.boolean(),active:z.boolean(),taxIds:ids}).strict().refine(v=>!v.availableUntil||v.availableUntil>=v.availableFrom,{path:['availableUntil'],message:'Must be on or after availability start'}),
  taxes:z.object({name,rateBps:z.number().int().min(0).max(10000),active:z.boolean()}).strict(),
  discounts:z.object({name,kind:z.enum(['FIXED','PERCENTAGE']),value:money,scope:z.enum(['PRODUCT','SUBSCRIPTION']),productIds:ids,minimumPurchase:money,minimumQuantity:z.number().int().min(1).max(1000000),startsAt:dateOnly,endsAt:dateOnly.nullable(),usageLimit:z.number().int().min(1).max(2147483647).nullable(),active:z.boolean()}).strict().refine(v=>v.kind!=='PERCENTAGE'||v.value<=10000,{path:['value'],message:'Percentage must be 0–10000 basis points'}).refine(v=>!v.endsAt||v.endsAt>=v.startsAt,{path:['endsAt'],message:'Must be on or after start'}).refine(v=>v.scope!=='PRODUCT'||v.productIds.length>0,{path:['productIds'],message:'Choose at least one product'}),
  customers:z.object({name,email:z.email().max(254),company:name,address:z.string().max(5000)}).strict(),
  templates:z.object({name,planId:z.string().min(1),validDays:z.number().int().min(1).max(3650),lines:z.array(lineInput.strict()).min(1).max(100)}).strict(),
};
export type Resource=keyof typeof schemas;
export interface ResourceTypes {products:Product;plans:Plan;taxes:TaxRule;discounts:DiscountRule;customers:Customer;templates:QuoteTemplate}
const tables:Record<Resource,string>={products:'products',plans:'plans',taxes:'taxes',discounts:'discounts',customers:'customers',templates:'quotation_templates'};
const columns:Record<Resource,string[]>={products:['name','type','salesPrice','costPrice','notes','active'],plans:['name','price','interval','minimumQuantity','availableFrom','availableUntil','autoClose','allowEarlyClose','allowPause','allowRenew','active'],taxes:['name','rateBps','active'],discounts:['name','kind','value','scope','minimumPurchase','minimumQuantity','startsAt','endsAt','usageLimit','active'],customers:['name','email','company','address'],templates:['name','planId','validDays','lines']};
const snake=(v:string)=>v.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`);
const camel=(v:string)=>v.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());
export const isResource=(v:string):v is Resource=>Object.hasOwn(tables,v);
function selection(resource:Resource) {
  const extras:Partial<Record<Resource,string>>={
    products:", COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'priceAdjustment',v.price_adjustment::text) ORDER BY v.id) FROM product_variants v WHERE v.product_id=r.id AND v.active),'[]') variants",
    plans:", COALESCE((SELECT jsonb_agg(tax_id ORDER BY tax_id) FROM plan_taxes WHERE plan_id=r.id),'[]') tax_ids",
    discounts:", COALESCE((SELECT jsonb_agg(product_id ORDER BY product_id) FROM discount_products WHERE discount_id=r.id),'[]') product_ids",
  };
  return `SELECT r.*${extras[resource]??''} FROM ${tables[resource]} r`;
}
function dto<R extends Resource>(resource:R,row:Record<string,unknown>):ResourceTypes[R] {
  const result:Record<string,unknown>={};
  const amounts=['salesPrice','costPrice','price','value','minimumPurchase'];
  for(const [key,value] of Object.entries(row)) {
    const mapped=camel(key);
    result[mapped]=amounts.includes(mapped)?safeInteger(value as string):value instanceof Date?value.toISOString():value;
  }
  if(resource==='products') result.variants=(result.variants as {id:string;name:string;priceAdjustment:string}[]).map(v=>({...v,priceAdjustment:safeInteger(v.priceAdjustment)}));
  if(resource==='templates') result.lines=z.array(lineInput).parse(result.lines);
  return result as unknown as ResourceTypes[R];
}
export async function getResource<R extends Resource>(db:Db,resource:R,id:string):Promise<ResourceTypes[R]> {
  const row=await one(db,`${selection(resource)} WHERE r.id=$1`,[id]);if(!row) throw missing();return dto(resource,row);
}
/** One bounded catalog read for a set of references; avoids per-line service queries. */
export async function getResourcesByIds<R extends Resource>(db:Db,resource:R,ids:string[]):Promise<ResourceTypes[R][]> {
  if(!ids.length)return [];
  const rows=(await db.query(`${selection(resource)} WHERE r.id=ANY($1::text[]) ORDER BY r.id`,[[...new Set(ids)]])).rows;
  return rows.map(row=>dto(resource,row));
}
export async function validateReferences(db:Db,table:'products'|'taxes'|'plans'|'customers',values:string[],field:string,active=false) {
  const unique=[...new Set(values)];if(!unique.length)return;
  const rows=(await db.query(`SELECT id${table==='customers'?'':',active'} FROM ${table} WHERE id=ANY($1::text[]) FOR SHARE`,[unique])).rows;
  if(rows.length!==unique.length || (active && rows.some(r=>!r.active))) throw new HttpError(422,'VALIDATION_ERROR','Missing or inactive reference',{[field]:'Choose existing active records'});
}
export async function validateLines(db:Db,lines:LineInput[]) {
  await validateReferences(db,'products',lines.map(l=>l.productId),'lines',true);
  await validateReferences(db,'taxes',lines.flatMap(l=>l.taxIds),'lines.taxIds',true);
  const variants=lines.filter(l=>l.variantId);
  if(variants.length) {
    const rows=(await db.query('SELECT id,product_id FROM product_variants WHERE id=ANY($1::text[]) AND active FOR SHARE',[variants.map(l=>l.variantId)])).rows;
    for(const l of variants) if(!rows.some(r=>r.id===l.variantId&&r.product_id===l.productId)) throw new HttpError(422,'VALIDATION_ERROR','Variant must belong to its selected product',{'lines.variantId':'Invalid variant'});
  }
}
export async function saveResource<R extends Resource>(resource:R,input:unknown,id?:string):Promise<ResourceTypes[R]> {
  return transaction(async db=>{
    let merged=input;
    if(id) {
      if(!input || typeof input!=='object' || Array.isArray(input)) throw new HttpError(400,'VALIDATION_ERROR','Expected an object');
      await db.query(`SELECT id FROM ${tables[resource]} WHERE id=$1 FOR UPDATE`,[id]);
      const previous=await getResource(db,resource,id);
      const {id:omitId,createdAt,updatedAt,...editable}=previous;
      void omitId;void createdAt;void updatedAt;
      if('usageCount' in editable) delete (editable as Partial<DiscountRule>).usageCount;
      merged={...editable,...input};
    }
    const data=schemas[resource].parse(merged) as Record<string,unknown>;
    const entityId=id??randomUUID();
    if(resource==='plans') await validateReferences(db,'taxes',data.taxIds as string[],'taxIds',true);
    if(resource==='discounts') {
      await validateReferences(db,'products',data.productIds as string[],'productIds',true);
      if(id) {const usage=await one<{usage_count:number}>(db,'SELECT usage_count FROM discounts WHERE id=$1',[id]);if(data.usageLimit!==null && (data.usageLimit as number)<usage!.usage_count) throw new HttpError(422,'VALIDATION_ERROR','Usage limit is below existing redemptions',{usageLimit:'Cannot reduce below usage count'});}
    }
    if(resource==='templates') {await validateReferences(db,'plans',[data.planId as string],'planId',true);await validateLines(db,data.lines as LineInput[]);}
    const keys=columns[resource],values=keys.map(k=>k==='lines'?JSON.stringify(data[k]):data[k]);
    if(id) await db.query(`UPDATE ${tables[resource]} SET ${keys.map((k,i)=>`${snake(k)}=$${i+1}`).join(',')},updated_at=now() WHERE id=$${keys.length+1}`,[...values,id]);
    else await db.query(`INSERT INTO ${tables[resource]}(id,${keys.map(snake).join(',')}) VALUES($1,${keys.map((_,i)=>`$${i+2}`).join(',')})`,[entityId,...values]);
    if(resource==='products') {
      const variants=data.variants as {id?:string;name:string;priceAdjustment:number}[];
      const supplied=variants.filter(v=>v.id).map(v=>v.id!);
      if(new Set(supplied).size!==supplied.length||new Set(variants.map(v=>v.name)).size!==variants.length) throw new HttpError(422,'VALIDATION_ERROR','Duplicate variants',{variants:'Use unique IDs and names'});
      const existing=(await db.query('SELECT id FROM product_variants WHERE product_id=$1',[entityId])).rows;
      if(supplied.some(v=>!existing.some(r=>r.id===v))) throw new HttpError(422,'VALIDATION_ERROR','Variant does not belong to product',{variants:'Invalid variant ID'});
      await db.query('UPDATE product_variants SET active=false WHERE product_id=$1',[entityId]);
      for(const v of variants) {
        if(v.id) await db.query('UPDATE product_variants SET name=$1,price_adjustment=$2,active=true WHERE id=$3 AND product_id=$4',[v.name,v.priceAdjustment,v.id,entityId]);
        else await db.query('INSERT INTO product_variants(id,product_id,name,price_adjustment) VALUES($1,$2,$3,$4)',[randomUUID(),entityId,v.name,v.priceAdjustment]);
      }
    }
    if(resource==='plans'||resource==='discounts') {
      const plan=resource==='plans',link=plan?'plan_taxes':'discount_products',parent=plan?'plan_id':'discount_id',child=plan?'tax_id':'product_id';
      await db.query(`DELETE FROM ${link} WHERE ${parent}=$1`,[entityId]);
      for(const ref of data[plan?'taxIds':'productIds'] as string[]) await db.query(`INSERT INTO ${link}(${parent},${child}) VALUES($1,$2)`,[entityId,ref]);
    }
    return getResource(db,resource,entityId);
  });
}
export async function catalogRoute(request:Request,resource:Resource,id?:string) {
  await requireUser(request,request.method==='GET'||resource==='customers'||resource==='templates'?['ADMIN','STAFF']:['ADMIN']);
  if(request.method==='GET') {
    if(id) return Response.json(await getResource(getPool(),resource,id));
    const q=listQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    const values:unknown[]=[],where:string[]=[];
    const add=(expression:string,value:unknown)=>{values.push(value);where.push(expression.replace('?',`$${values.length}`));};
    const searchFields=resource==='customers'?"r.name||' '||r.company||' '||r.email":'r.name';
    if(q.search)add(`${searchFields} ILIKE ?`,`%${q.search}%`);
    if(q.status) {if(!['ACTIVE','INACTIVE','CLOSED'].includes(q.status)||['customers','templates'].includes(resource))throw new HttpError(400,'VALIDATION_ERROR','Invalid status filter');add('r.active=?',q.status==='ACTIVE');}
    if(q.from)add("r.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Kolkata')",q.from);
    if(q.to)add("r.created_at < ((?::date + interval '1 day') AT TIME ZONE 'Asia/Kolkata')",q.to);
    const filter=where.length?` WHERE ${where.join(' AND ')}`:'';
    const total=await one<{count:string}>(getPool(),`SELECT count(*) FROM ${tables[resource]} r${filter}`,values);
    const rows=(await getPool().query(`${selection(resource)}${filter} ORDER BY r.created_at DESC,r.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.pageSize,(q.page-1)*q.pageSize])).rows;
    return Response.json({items:rows.map(r=>dto(resource,r)),total:safeInteger(total!.count),page:q.page,pageSize:q.pageSize});
  }
  checkOrigin(request);
  if(request.method==='POST'&&!id)return Response.json(await saveResource(resource,await body(request)),{status:201});
  if(request.method==='PATCH'&&id)return Response.json(await saveResource(resource,await body(request),id));
  throw new HttpError(405,'METHOD_NOT_ALLOWED','Unsupported method');
}
