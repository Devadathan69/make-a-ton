"use client";
export function Pagination({page,total,size=10,busy,onPage}:{page:number;total:number;size?:number;busy:boolean;onPage:(page:number)=>void}){
 const pages=Math.max(1,Math.ceil(total/size));return <div style={{display:'flex',flexWrap:'wrap',gap:12,justifyContent:'space-between',alignItems:'center',padding:16}}><small>{total} records · Page {page} of {pages}</small><div style={{display:'flex',gap:8}}><button type="button" className="button button-secondary" disabled={busy||page<=1} onClick={()=>onPage(page-1)}>Previous</button><button type="button" className="button button-secondary" disabled={busy||page>=pages} onClick={()=>onPage(page+1)}>Next</button></div></div>;
}
