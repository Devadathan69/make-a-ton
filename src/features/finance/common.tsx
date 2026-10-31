"use client";
import type {ReactNode} from 'react';
import {useCallback} from 'react';
import {useDialog} from '@/components/use-dialog';
import {api, ApiError} from '@/lib/api';
import {useResource} from '@/lib/use-resource';
import type {ListQuery} from '@/lib/contracts';
import styles from './finance.module.css';
export function failure(error:unknown){return error instanceof ApiError ? [error.message,...Object.values(error.fields??{})].join(' · ') : error instanceof Error?error.message:'Request failed';}
export function announceRefresh(){window.dispatchEvent(new Event('loopledger:refresh'));}
export function Modal({title,onClose,busy=false,children}:{title:string;onClose:()=>void;busy?:boolean;children:ReactNode}){
 const id=useDialog(true,onClose,busy);
 return <div className={styles.overlay} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section data-dialog-root={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className={styles.modal}><header className={styles.header}><h2 id={`${id}-title`}>{title}</h2><button className={styles.close} disabled={busy} onClick={onClose} aria-label={`Close ${title}`}>×</button></header><div className={styles.body}>{children}</div></section></div>;
}
export function Pagination({page,total,pageSize=20,busy,onPage}:{page:number;total:number;pageSize?:number;busy:boolean;onPage:(n:number)=>void}){
 const pages=Math.max(1,Math.ceil(total/pageSize));return <div className={styles.pagination}><span>{total} records · Page {page} of {pages}</span><div className={styles.actions}><button className="button button-secondary" disabled={busy||page<=1} onClick={()=>onPage(page-1)}>Previous page</button><button className="button button-secondary" disabled={busy||page>=pages} onClick={()=>onPage(page+1)}>Next page</button></div></div>;
}
export function Filters({value,onChange,statuses=[],customers=false,dateLabel='Date'}:{value:ListQuery;onChange:(q:ListQuery)=>void;statuses?:string[];customers?:boolean;dateLabel?:string}){
 const load=useCallback(()=>customers?api.customers.list({pageSize:100}):Promise.resolve({items:[],total:0,page:1,pageSize:100}),[customers]);const refs=useResource(load);
 return <><div className={styles.toolbar}><label>Search<input type="search" aria-label="Search records" value={value.search??''} onChange={e=>onChange({...value,search:e.target.value,page:1})}/></label>{statuses.length>0&&<label>Status<select value={value.status??''} onChange={e=>onChange({...value,status:e.target.value,page:1})}><option value="">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>}{customers&&<label>Customer<select value={value.customerId??''} onChange={e=>onChange({...value,customerId:e.target.value,page:1})}><option value="">All customers</option>{refs.data?.items.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</select></label>}<label>{dateLabel} from<input aria-label={`${dateLabel} from`} type="date" value={value.from??''} onChange={e=>onChange({...value,from:e.target.value,page:1})}/></label><label>{dateLabel} to<input aria-label={`${dateLabel} to`} type="date" value={value.to??''} onChange={e=>onChange({...value,to:e.target.value,page:1})}/></label><button className="button button-secondary" onClick={()=>onChange({page:1,pageSize:20})}>Clear filters</button></div>{value.from&&value.to&&value.from>value.to&&<p className={styles.error} role="alert">From date must be on or before To date.</p>}{refs.error&&<p className={styles.error} role="alert">Customer choices unavailable: {refs.error} <button onClick={refs.refresh}>Retry customers</button></p>}</>;
}
