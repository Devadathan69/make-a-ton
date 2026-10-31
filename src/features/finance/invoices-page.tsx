"use client";
import {Suspense,useCallback,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Badge,PageHeader,Panel,ResourceState,Table} from '@/components/ui';
import {api} from '@/lib/api';
import type {ListQuery} from '@/lib/contracts';
import {formatDate,formatMoney} from '@/lib/format';
import {useResource} from '@/lib/use-resource';
import {Filters,Pagination} from './common';
import {InvoiceDetail} from './invoice-detail';
import {paidLabel} from './payment-validation';
function Workspace(){
 const params=useSearchParams();const [query,setQuery]=useState<ListQuery>({page:1,pageSize:20,status:params.get('status')??'',from:params.get('from')??'',to:params.get('to')??'',customerId:params.get('customerId')??''});const [selected,setSelected]=useState(params.get('invoiceId'));
 const load=useCallback(()=>{if(query.from&&query.to&&query.from>query.to)throw new Error('From date must be on or before To date.');return api.invoices.list(query);},[query]);const r=useResource(load);
 return <><PageHeader eyebrow="Finance / Invoices" title="Every invoice, accounted for." description="Issued charges, exact calculations, payment balances and delivery state."/><Panel title="Invoices" aside={<button className="button button-secondary" onClick={r.refresh}>Refresh invoices</button>}><Filters value={query} onChange={setQuery} statuses={['DRAFT','CONFIRMED','PAID','CANCELLED','OVERDUE']} customers dateLabel="Issued date"/><ResourceState loading={r.loading} error={r.error} empty={r.data?.total===0}/>{r.error&&<button className="button" onClick={r.refresh}>Retry invoices</button>}{r.data&&<><Table headings={['Invoice','Customer','Period / due','Total','Paid','Outstanding','Status','Details']}>{r.data.items.map(i=><tr key={i.id}><td><strong>{i.number}</strong><small>Issued {formatDate(i.issuedAt)}</small></td><td>{i.customerName}</td><td>{formatDate(i.periodStart)} – {formatDate(i.periodEnd)}<small>Due {formatDate(i.dueAt)}</small></td><td>{formatMoney(i.total)}</td><td>{formatMoney(i.paid)}</td><td>{formatMoney(i.balance)}{i.overdue&&<small>Overdue</small>}</td><td><Badge value={i.status}/><small>{paidLabel(i.paid,i.total)}</small></td><td><button className="button button-secondary" aria-label={`Inspect ${i.number}`} onClick={()=>setSelected(i.id)}>Details</button></td></tr>)}</Table><Pagination page={query.page??1} total={r.data.total} busy={r.loading} onPage={page=>setQuery({...query,page})}/></>}</Panel>{selected&&<InvoiceDetail key={selected} id={selected} onClose={()=>setSelected(null)}/>}</>;
}
export function InvoicesPage(){return <Suspense fallback={<p className="state">Loading invoices…</p>}><Workspace/></Suspense>;}
