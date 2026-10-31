import {describe,expect,it} from 'vitest';
import {paymentAmount,paidLabel} from './payment-validation';
describe('record-payment input boundary',()=>{
 it('converts exact positive rupee amounts without overpaying',()=>{expect(paymentAmount('4000',990000)).toEqual({amount:400000});expect(paymentAmount('5900.00',590000)).toEqual({amount:590000});});
 it('rejects zero, negative, fractional paise, unsafe and excessive receipts',()=>{for(const value of ['0','-1','1.001','9007199254740992','5900.01'])expect(paymentAmount(value,590000).error).toBeTruthy();});
 it('distinguishes partial receipts from settlement',()=>{expect(paidLabel(0,990000)).toBe('Unpaid');expect(paidLabel(400000,990000)).toBe('Partially paid');expect(paidLabel(990000,990000)).toBe('Settled');});
});
