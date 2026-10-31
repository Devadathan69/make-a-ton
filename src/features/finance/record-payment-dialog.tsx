"use client";
import type {Payment} from '@/lib/contracts';
import {PaymentDialog} from './payment-dialog';
/** One shared payment intent survives unknown outcomes and background refreshes. */
export function RecordPaymentDialog({initialInvoiceId,onClose,onPaymentRecorded}:{initialInvoiceId?:string;onClose:()=>void;onPaymentRecorded?:(payment:Payment)=>void}){
 return <PaymentDialog invoiceId={initialInvoiceId} onClose={onClose} onSaved={payment=>onPaymentRecorded?.(payment)}/>;
}
