'use client';
import styles from './auth.module.css';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@/lib/contracts';
import { request, ApiError } from '@/lib/api/http';
export function StaffPage() {
  const [users,setUsers]=useState<User[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{request<User[]>('/staff').then(setUsers).catch(e=>setError(e.message));},[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');const form=event.currentTarget;
    try {const user=await request<User>('/staff','POST',Object.fromEntries(new FormData(form)));setUsers(old=>[...old,user]);form.reset();}catch(e){setError(e instanceof ApiError&&e.fields?Object.values(e.fields).join(' '):e instanceof Error?e.message:'Failed');}finally{setBusy(false);}
  }
  return <section className={styles.card}><h1>Staff accounts</h1>{error&&<p role="alert">{error}</p>}<ul>{users.map(u=><li key={u.id}>{u.name} · {u.email} · {u.role}</li>)}</ul><h2>Create staff account</h2><form onSubmit={submit}><p><label>Name<input name="name" required/></label></p><p><label>Email<input name="email" type="email" required/></label></p><p><label>Initial password<input name="password" type="password" required minLength={9} maxLength={200} autoComplete="new-password"/></label></p><p>At least nine characters with uppercase, lowercase and a special character.</p><button disabled={busy}>Create staff</button></form></section>;
}
