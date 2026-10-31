import type { DiscountRule, InvoiceLine } from '@/lib/contracts';
import { safeInteger } from '../values';
export interface BillingTax {id:string;name:string;rateBps:number}
export interface BillingLine {id:string;productId:string|null;description:string;quantity:number;unitPrice:number;taxes:BillingTax[]}
export interface Calculation {lines:InvoiceLine[];subtotal:number;discount:number;tax:number;total:number;ruleIds:string[];explanation:string[]}
const sum=(values:bigint[])=>values.reduce((a,b)=>a+b,0n);
export const halfUp=(base:bigint,bps:bigint)=>(base*bps+5000n)/10000n;
function allocate(amount:bigint,weights:bigint[],ids:string[]):bigint[] {
  const total=sum(weights);if(!total)return weights.map(()=>0n);
  const result=weights.map(w=>amount*w/total);
  let remainder=amount-sum(result);
  const order=weights.map((w,i)=>({i,r:amount*w%total,id:ids[i]})).sort((a,b)=>a.r===b.r?(a.id<b.id?-1:a.id>b.id?1:0):a.r>b.r?-1:1);
  for(const {i} of order) {if(!remainder)break;result[i]++;remainder--;}
  return result;
}
function discountValue(rule:DiscountRule,base:bigint) {const value=rule.kind==='FIXED'?BigInt(rule.value):halfUp(base,BigInt(rule.value));return value>base?base:value;}
function best(rules:DiscountRule[],original:bigint,quantity:number,base:bigint) {
  return rules.filter(r=>original>=BigInt(r.minimumPurchase)&&quantity>=r.minimumQuantity).map(rule=>({rule,value:discountValue(rule,base)})).filter(r=>r.value>0n).sort((a,b)=>a.value===b.value?(a.rule.id<b.rule.id?-1:a.rule.id>b.rule.id?1:0):a.value>b.value?-1:1)[0];
}
export function calculate(lines:BillingLine[],rules:DiscountRule[],periodStart:string):Calculation {
  if(new Set(lines.map(l=>l.id)).size!==lines.length)throw new Error('Billing line IDs must be unique');
  for(const l of lines) {
    if(!Number.isSafeInteger(l.unitPrice)||l.unitPrice<0||!Number.isSafeInteger(l.quantity)||l.quantity<1)throw new Error('Invalid line economics');
    for(const t of l.taxes) if(!Number.isInteger(t.rateBps)||t.rateBps<0||t.rateBps>10000)throw new Error('Invalid snapshotted tax');
  }
  const eligible=rules.filter(r=>r.active&&r.startsAt<=periodStart&&(!r.endsAt||r.endsAt>=periodStart)&&(r.usageLimit===null||r.usageCount<r.usageLimit));
  const subtotals=lines.map(l=>BigInt(l.unitPrice)*BigInt(l.quantity)),discounts=lines.map(()=>0n);
  const selected=new Set<string>(),explanation:string[]=[];
  const groups=[...new Set(lines.map(l=>l.productId).filter((p):p is string=>p!==null))].sort();
  for(const group of groups) {
    const indices=lines.map((l,i)=>l.productId===group?i:-1).filter(i=>i>=0);
    const weights=indices.map(i=>subtotals[i]);
    const winner=best(eligible.filter(r=>r.scope==='PRODUCT'&&r.productIds.includes(group)),sum(weights),indices.reduce((n,i)=>n+lines[i].quantity,0),sum(weights));
    if(winner){const portions=allocate(winner.value,weights,indices.map(i=>lines[i].id));indices.forEach((i,j)=>discounts[i]+=portions[j]);selected.add(winner.rule.id);explanation.push(`${winner.rule.name}: ${winner.value} paise off product ${group}.`);}
  }
  const remaining=subtotals.map((s,i)=>s-discounts[i]);
  const winner=best(eligible.filter(r=>r.scope==='SUBSCRIPTION'),sum(subtotals),lines.filter(l=>l.productId!==null).reduce((n,l)=>n+l.quantity,0),sum(remaining));
  if(winner){const portions=allocate(winner.value,remaining,lines.map(l=>l.id));portions.forEach((p,i)=>discounts[i]+=p);selected.add(winner.rule.id);explanation.push(`${winner.rule.name}: ${winner.value} paise off subscription.`);}
  const invoiceLines=lines.map((l,i)=>{
    const base=subtotals[i]-discounts[i],tax=sum(l.taxes.map(t=>halfUp(base,BigInt(t.rateBps))));
    explanation.push(`${l.description}: ${l.quantity} × ${l.unitPrice} paise; discount ${discounts[i]}; tax ${tax} (${l.taxes.map(t=>`${t.name} ${t.rateBps} bps`).join(', ')||'no tax'}).`);
    return {id:l.id,description:l.description,quantity:l.quantity,unitPrice:l.unitPrice,subtotal:safeInteger(subtotals[i]),discount:safeInteger(discounts[i]),tax:safeInteger(tax),total:safeInteger(base+tax)};
  });
  const subtotal=safeInteger(sum(subtotals)),discount=safeInteger(sum(discounts)),tax=safeInteger(sum(invoiceLines.map(l=>BigInt(l.tax)))),total=safeInteger(BigInt(subtotal)-BigInt(discount)+BigInt(tax));
  return {lines:invoiceLines,subtotal,discount,tax,total,ruleIds:[...selected].sort(),explanation};
}
