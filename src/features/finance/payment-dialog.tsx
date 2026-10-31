"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,ApiError} from '@/lib/api';
import type {PaymentInput,PaymentMethod} from '@/lib/contracts';
import {useResource} from '@/lib/use-resource';
import {formatMoney} from '@/lib/format';
import {ResourceState} from '@/components/ui';
import {Modal,Pagination,announceRefresh,failure} from './common';
import {paymentAmount} from './payment-validation';
import styles from './finance.module.css';
export function PaymentDialog({invoiceId:initialId='',onClose,onSaved}:{invoiceId?:string;onClose:()=>void;onSaved:()=>void}){
 const [invoiceId,setInvoiceId]=useState(initialId),[search,setSearch]=useState(''),[page,setPage]=useState(1),[amount,setAmount]=useState(''),[method,setMethod]=useState<PaymentMethod>('BANK_TRANSFER'),[paidAt,setPaidAt]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ambiguous,setAmbiguous]=useState(false),[success,setSuccess]=useState('');
 const attempted=useRef<PaymentInput|null>(null);
 const choices=useResource(useCallback(()=>api.invoices.list({status:'CONFIRMED',search,page,pageSize:10}),[search,page]));
 const detail=useResource(useCallback(()=>invoiceId?api.invoices.get(invoiceId):Promise.resolve(null),[invoiceId]));
 const session=useResource(useCallback(()=>api.session.get(),[]));const today=session.data?.asOf??'';
 useEffect(()=>{if(!ambiguous)return;function warn(event:BeforeUnloadEvent){event.preventDefault();}window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[ambiguous]);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;setError('');
  let input:PaymentInput;
  if(ambiguous && attempted.current){input=attempted.current;}
  else {
   const invoice=detail.data;if(!invoice)return;
   const checked=paymentAmount(amount,invoice.balance);if(checked.error){setError(checked.error);return;}
   if(!(paidAt||today)||(paidAt||today)>today){setError('Choose a payment date on or before the business date.');return;}
   const candidate:PaymentInput={invoiceId,amount:checked.amount!,method,paidAt:paidAt||today,note};
   if(!attempted.current||JSON.stringify(attempted.current)!==JSON.stringify(candidate))attempted.current=candidate;
   input=attempted.current;
  }
  setBusy(true);
  try{const result=await api.payments.create(input);setAmbiguous(false);setSuccess(`Recorded ${formatMoney(result.amount)} for ${result.invoiceNumber}. Payment reference: ${result.id}`);announceRefresh();onSaved();}
  catch(e){setError(failure(e));const uncertain=e instanceof ApiError&&(e.status===0||e.status>=500);setAmbiguous(uncertain);if(!uncertain)detail.refresh();}
  finally{setBusy(false);}
 }
 return <Modal title="Record payment" onClose={onClose} busy={busy||ambiguous}>{success?<><p role="status" className={styles.success}>{success}</p><button className="button" onClick={onClose}>Done</button></>:<><p className={styles.notice}>Record an already received payment. This does not charge a card or contact a bank. Business date: {today||'loading'}.</p>{!initialId&&<><label className={styles.form}>Find confirmed invoice<input aria-label="Find confirmed invoice" type="search" value={search} disabled={busy||ambiguous} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><ResourceState loading={choices.loading} error={choices.error}/><select aria-label="Invoice to pay" value={invoiceId} disabled={busy||ambiguous} onChange={e=>{setInvoiceId(e.target.value);attempted.current=null;}}><option value="">Choose an invoice</option>{choices.data?.items.filter(i=>i.balance>0).map(i=><option key={i.id} value={i.id}>{i.number} · {i.customerName} · {formatMoney(i.balance)}</option>)}</select>{choices.data&&<Pagination page={page} total={choices.data.total} pageSize={10} busy={choices.loading||busy||ambiguous} onPage={setPage}/>}</>}
 <ResourceState loading={detail.loading||session.loading} error={detail.error??session.error}/>{detail.error&&<button onClick={detail.refresh}>Retry invoice</button>}{detail.data&&<><div className={styles.meta}><p>Invoice<strong>{detail.data.number}</strong></p><p>Total<strong>{formatMoney(detail.data.total)}</strong></p><p>Paid<strong>{formatMoney(detail.data.paid)}</strong></p><p>Outstanding<strong>{formatMoney(detail.data.balance)}</strong></p></div>{error&&<p className={styles.error} role="alert">{error}</p>}{ambiguous&&<p role="alert" className={styles.notice}>The outcome is uncertain. Keep this form open and retry the same payment to resolve it safely. Do not record a second payment elsewhere.</p>}<form className={styles.form} onSubmit={submit}><label>Amount (₹)<input aria-label="Payment amount in rupees" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy||ambiguous} required/></label><label>Method<select value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)} disabled={busy||ambiguous}>{['BANK_TRANSFER','CARD','UPI','CASH','OTHER'].map(m=><option key={m}>{m}</option>)}</select></label><label>Paid date<input aria-label="Payment paid date" type="date" value={paidAt||today} max={today} onChange={e=>setPaidAt(e.target.value)} disabled={busy||ambiguous} required/></label><label>Note<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} disabled={busy||ambiguous}/></label><button className="button" disabled={busy||(!ambiguous&&(detail.loading||session.loading||!today||detail.data.status!=='CONFIRMED'||detail.data.balance<=0))} type="submit">{busy?'Recording…':ambiguous?'Retry same payment':'Record received payment'}</button></form></>}</>}</Modal>;
}
