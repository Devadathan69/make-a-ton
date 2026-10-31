import type { BillingInterval } from '@/lib/contracts';
import { dateOnly } from './values';
const iso=(d:Date)=>d.toISOString().slice(0,10);
export function addDays(date:string,days:number){dateOnly.parse(date);const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return iso(d);}
function cycleAt(anchor:string,index:number,interval:BillingInterval) {
  dateOnly.parse(anchor);const d=new Date(`${anchor}T00:00:00Z`);
  if(interval==='DAILY'||interval==='WEEKLY')return addDays(anchor,index*(interval==='WEEKLY'?7:1));
  const year=d.getUTCFullYear(),month=d.getUTCMonth(),day=d.getUTCDate();
  const target=new Date(Date.UTC(year+(interval==='YEARLY'?index:0),month+(interval==='MONTHLY'?index:0),1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(day,last));return iso(target);
}
function indexAt(anchor:string,date:string,interval:BillingInterval) {
  dateOnly.parse(date);const a=new Date(`${anchor}T00:00:00Z`),d=new Date(`${date}T00:00:00Z`);
  if(interval==='YEARLY')return d.getUTCFullYear()-a.getUTCFullYear();
  if(interval==='MONTHLY')return (d.getUTCFullYear()-a.getUTCFullYear())*12+d.getUTCMonth()-a.getUTCMonth();
  return Math.floor((d.valueOf()-a.valueOf())/86400000/(interval==='WEEKLY'?7:1));
}
export function isBoundary(anchor:string,date:string,interval:BillingInterval){const index=indexAt(anchor,date,interval);return index>=0&&cycleAt(anchor,index,interval)===date;}
export function nextCycle(anchor:string,date:string,interval:BillingInterval){const index=indexAt(anchor,date,interval);if(index<0||cycleAt(anchor,index,interval)!==date)throw new Error('Date is not a billing boundary');return cycleAt(anchor,index+1,interval);}
