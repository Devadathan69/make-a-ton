'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { request } from '@/lib/api/http';
import type { Session } from '@/lib/contracts';
type Mode='login'|'register'|'forgot-password'|'reset-password';
const titles:Record<Mode,string>={login:'Sign in',register:'Create customer account','forgot-password':'Reset your password','reset-password':'Choose a new password'};
export function AuthForm({mode}:{mode:Mode}) {
  const router=useRouter();
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');setMessage('');
    const values=Object.fromEntries(new FormData(event.currentTarget));
    if(mode==='reset-password') values.token=new URLSearchParams(window.location.hash.slice(1)).get('token')??'';
    try {
      const result=await request<Session&{message?:string}>(`/auth/${mode}`,'POST',values);
      if(result.user) {router.replace(result.user.role==='CUSTOMER'?'/portal':'/dashboard');router.refresh();}
      else {setMessage(result.message??'Completed');if(mode==='reset-password') window.history.replaceState(null,'','/reset-password');}
    } catch(err) {setError(err instanceof Error?err.message:'Request failed');}finally{setBusy(false);}
  }
  return <section className="panel" style={{maxWidth:520,margin:'3rem auto',padding:'2rem'}}><h1>{titles[mode]}</h1><form onSubmit={submit}>
    {mode==='register'&&<p><label>Name<input required name="name" autoComplete="name" maxLength={100}/></label></p>}
    {mode!=='reset-password'&&<p><label>Email<input required type="email" name="email" autoComplete="email" maxLength={254}/></label></p>}
    {mode!=='forgot-password'&&<p><label>Password<input required type="password" name="password" minLength={mode==='login'?1:9} maxLength={200} autoComplete={mode==='login'?'current-password':'new-password'}/></label></p>}
    {(mode==='register'||mode==='reset-password')&&<p>Use at least nine characters, including uppercase, lowercase and a special character.</p>}
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <button type="submit" disabled={busy}>{busy?'Please wait…':titles[mode]}</button>
  </form><p><Link href="/login">Sign in</Link> · <Link href="/register">Register</Link> · <Link href="/forgot-password">Forgot password</Link></p></section>;
}
