"use client";
import type {ReactNode} from 'react';
import {useDialog} from '@/components/use-dialog';
import {ApiError} from '@/lib/api';
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
