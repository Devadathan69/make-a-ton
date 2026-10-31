"use client";
import {useCallback,useState} from 'react';
import Link from 'next/link';
import {Badge,PageHeader,Panel,ResourceState,Table} from '@/components/ui';
import {api} from '@/lib/api';
import type {ListQuery} from '@/lib/contracts';
import {formatDate,formatMoney} from '@/lib/format';
import {useResource} from '@/lib/use-resource';
import {Filters,Pagination} from './common';
import {PaymentDialog} from './payment-dialog';
export function PaymentsPage(){
 const [query,setQuery]=useState<ListQuery>({page:1,pageSize:20}),[open,setOpen]=useState(false);
 const load=useCallback(()=>{if(query.from&&query.to&&query.from>query.to)throw new Error('From date must be on or before To date.');return api.payments.list(query);},[query]);const r=useResource(load);
 return <><PageHeader eyebrow="Finance / Payments" title="Know what came in." description="Recorded receipts with invoice references. This screen records payments already received." action={<button className="button" onClick={()=>setOpen(true)}>Record payment</button>}/><Panel title="Payment history" aside={<button className="button button-secondary" onClick={r.refresh}>Refresh payments</button>}><Filters value={query} onChange={setQuery} dateLabel="Paid date" statuses={['BANK_TRANSFER','CARD','UPI','CASH','OTHER']}/><ResourceState loading={r.loading} error={r.error} empty={r.data?.total===0}/>{r.error&&<button onClick={r.refresh}>Retry payments</button>}{r.data&&<><Table headings={['Invoice','Customer','Amount','Method','Paid date','Note']}>{r.data.items.map(p=><tr key={p.id}><td><Link href={`/invoices?invoiceId=${encodeURIComponent(p.invoiceId)}`}>{p.invoiceNumber}</Link></td><td>{p.customerName}</td><td>{formatMoney(p.amount)}</td><td><Badge value={p.method}/></td><td>{formatDate(p.paidAt)}</td><td>{p.note}</td></tr>)}</Table><Pagination page={query.page??1} total={r.data.total} busy={r.loading} onPage={page=>setQuery({...query,page})}/></>}</Panel>{open&&<PaymentDialog onClose={()=>setOpen(false)} onSaved={r.refresh}/>}</>;
}
