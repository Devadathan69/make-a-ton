"use client";
import {InvoiceDetail} from './invoice-detail';
/** Keep the feature route contract while consolidating state and delivery controls. */
export function InvoiceDetailDrawer({invoiceId,onClose}:{invoiceId:string;onClose:()=>void;onInvoiceUpdated?:()=>void}){
 return <InvoiceDetail key={invoiceId} id={invoiceId} onClose={onClose}/>;
}
