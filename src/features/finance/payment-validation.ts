import {parseMoney} from '@/lib/format';
export function paymentAmount(value:string,balance:number):{amount?:number;error?:string}{
 const amount=parseMoney(value);if(amount===null||amount<=0)return {error:'Enter a positive rupee amount with at most two decimal places.'};
 if(amount>balance)return {error:'Amount exceeds the current outstanding balance.'};return {amount};
}
export function paidLabel(paid:number,total:number){return paid===total?'Settled':paid>0?'Partially paid':'Unpaid';}
