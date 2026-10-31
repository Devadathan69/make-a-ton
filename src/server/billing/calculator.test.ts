import { describe, expect, it } from 'vitest';
import type { DiscountRule } from '@/lib/contracts';
import { calculate, type BillingLine } from './calculator';
const line=(id='a',quantity=10,unitPrice=100000,productId='p'):BillingLine=>({id,quantity,unitPrice,productId,description:'Workspace',taxes:[{id:'t',name:'Illustrative',rateBps:1000}]});
const rule=(overrides:Partial<DiscountRule>={}):DiscountRule=>({id:'d',name:'Offer',kind:'PERCENTAGE',value:1000,scope:'SUBSCRIPTION',productIds:[],minimumPurchase:0,minimumQuantity:10,startsAt:'2026-10-01',endsAt:'2026-10-31',usageLimit:100,usageCount:0,active:true,createdAt:'',updatedAt:'',...overrides});
function reconciles(result:ReturnType<typeof calculate>) {
  for(const key of ['subtotal','discount','tax','total'] as const)expect(result.lines.reduce((n,l)=>n+l[key],0)).toBe(result[key]);
  for(const l of result.lines){expect(l.total).toBe(l.subtotal-l.discount+l.tax);expect(l.discount).toBeLessThanOrEqual(l.subtotal);}
}
describe('exact deterministic billing',()=>{
  it('matches the agreed fixture and taxes after discounts',()=>{
    const r=calculate([line()],[rule()],'2026-10-01');expect([r.subtotal,r.discount,r.tax,r.total]).toEqual([1000000,100000,90000,990000]);reconciles(r);
  });
  it('includes Odoo +560 and charges the base fee only once',()=>{
    const r=calculate([line('odoo',2,100000+56000),{...line('plan',1,500000),productId:null,taxes:[]}],[],'2026-10-01');expect(r.subtotal).toBe(812000);expect(r.tax).toBe(31200);reconciles(r);
    expect(calculate([line('free',1,0)],[],'2026-10-01').total).toBe(0);
  });
  it('caps fixed values and groups same-product lines once',()=>{
    const d=rule({kind:'FIXED',value:150,scope:'PRODUCT',productIds:['p'],minimumQuantity:1});
    const r=calculate([line('a',1,100),line('b',1,100)],[d],'2026-10-01');expect(r.discount).toBe(150);expect(r.ruleIds).toEqual(['d']);reconciles(r);
    expect(calculate([line('a',1,100)],[{...d,value:500}],'2026-10-01').total).toBe(0);
  });
  it('uses original thresholds, best value and ID ties deterministically',()=>{
    const a=rule({id:'a',minimumPurchase:1000000}),b=rule({id:'b'});
    expect(calculate([line()],[b,a],'2026-10-01').ruleIds).toEqual(['a']);
    expect(calculate([line('a',9)],[a],'2026-10-01').discount).toBe(0);
    expect(calculate([line()],[rule({value:2000}),a],'2026-10-01').discount).toBe(200000);
  });
  it('includes endpoints and excludes expired, exhausted or inactive offers without mutation',()=>{
    const d=rule();expect(calculate([line()],[d],'2026-10-31').discount).toBe(100000);expect(d.usageCount).toBe(0);
    for(const [date,offer] of [['2026-09-30',d],['2026-11-01',d],['2026-10-01',{...d,usageCount:100}],['2026-10-01',{...d,active:false}]] as const)expect(calculate([line()],[offer],date).discount).toBe(0);
  });
  it('allocates largest remainders by stable line ID and rounds tax per line per tax',()=>{
    const d=rule({kind:'FIXED',value:1,minimumQuantity:1});
    const r=calculate([line('b',1,5),line('a',1,5)],[d],'2026-10-01');expect(r.lines.map(l=>l.discount)).toEqual([0,1]);expect(r.lines.map(l=>l.tax)).toEqual([1,0]);reconciles(r);
  });
  it('applies product then subscription offers and rejects unsafe aggregates',()=>{
    const r=calculate([line()],[rule({id:'product',scope:'PRODUCT',productIds:['p']}),rule({id:'subscription'})],'2026-10-01');expect(r.discount).toBe(190000);reconciles(r);
    expect(()=>calculate([line('a',1000000,Number.MAX_SAFE_INTEGER)],[],'2026-10-01')).toThrow('safe integer');
  });
});
