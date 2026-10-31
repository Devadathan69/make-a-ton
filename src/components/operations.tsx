'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { request } from '@/lib/api/http';
import { useResource } from '@/lib/use-resource';
import type { BillingRunResult } from '@/lib/contracts';
import { PageHeader, Panel, ResourceState } from './ui';
import styles from './operations.module.css';
interface Status {asOf:string;simulated:boolean;emailEnabled:boolean;schedulerConfigured:boolean}
interface Delivery {id:string;kind:string;status:string;attempts:number;lastError:string|null;createdAt:string}
const load=async()=>({status:await request<Status>('/system/status'),outbox:await request<Delivery[]>('/outbox')});
export function OperationsPage() {
  const {data,error,loading,refresh}=useResource(load),[busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[result,setResult]=useState<BillingRunResult|null>(null),[to,setTo]=useState(''),[delivery,setDelivery]=useState('');
  async function run(action:()=>Promise<BillingRunResult>){setBusy(true);setFailure('');try{setResult(await action());window.dispatchEvent(new Event('loopledger:refresh'));}catch(e){setFailure(e instanceof Error?e.message:'Run failed');}finally{setBusy(false);}}
  async function send(){setBusy(true);setFailure('');try{const r=await request<{sent:number;failed:number;uncertain:number}>('/outbox/run','POST',{});setDelivery(`SMTP accepted ${r.sent}; failed ${r.failed}; uncertain ${r.uncertain}.`);refresh();}catch(e){setFailure(e instanceof Error?e.message:'Delivery failed');}finally{setBusy(false);}}
  async function retry(id:string,uncertain:boolean){if(uncertain&&!window.confirm('Only continue after checking SMTP/provider records. This may resend a message already accepted. Have you reconciled delivery?'))return;setBusy(true);try{await request(`/outbox/${encodeURIComponent(id)}/retry`,'POST',{confirmUnknownDelivery:uncertain});refresh();}catch(e){setFailure(e instanceof Error?e.message:'Retry failed');}finally{setBusy(false);}}
  return <><PageHeader eyebrow="Administration" title="Billing operations" description="Run due periods, inspect delivery failures and use the isolated demo clock."/><ResourceState loading={loading} error={error}/>{failure&&<p role="alert" className={styles.error}>{failure}</p>}
    {data&&<><Panel title="Due billing"><div className={styles.body}><p><strong>{data.status.simulated?'SIMULATION · isolated demo date':'Asia/Kolkata business date'}: {data.status.asOf}</strong></p><p>Each run processes up to 100 due periods. Repeat if a backlog remains. Generated, skipped and failed counts describe this run only.</p><button className="button" disabled={busy} onClick={()=>run(()=>api.billing.run())}>Run due billing</button>{result&&<p role="status">As of {result.asOf}: generated {result.generated}, skipped {result.skipped}, failed {result.failed}. Run {result.runId}.</p>}
      {data.status.simulated&&<form onSubmit={e=>{e.preventDefault();if(to)void run(()=>api.billing.advanceClock(to));}}><label>Advance simulated date<input type="date" required min={data.status.asOf} value={to} onChange={e=>setTo(e.target.value)}/></label><p>Moves forward only and runs the same billing service. Pause/resume starts a fresh cycle without refunds; finite expiry must align to the new anchor.</p><button className="button button-secondary" disabled={busy}>Advance demo clock and bill</button></form>}
      <p>Scheduler credential: {data.status.schedulerConfigured?'configured':'not configured'}. Hosted execution must be verified in the deployment.</p></div></Panel>
      <Panel title="Email outbox"><div className={styles.body}><p>{data.status.emailEnabled?'SMTP delivery enabled. SENT means SMTP accepted; it does not prove mailbox delivery.':'SMTP delivery is disabled. Messages remain queued until an approved provider is configured.'}</p><button className="button button-secondary" disabled={busy||!data.status.emailEnabled} onClick={send}>Process email queue</button>{delivery&&<p role="status">{delivery}</p>}{data.outbox.length===0&&<p>No email messages queued.</p>}<div className={styles.scroll}><table><thead><tr><th>Type</th><th>State</th><th>Attempts</th><th>Last error</th><th>Action</th></tr></thead><tbody>{data.outbox.map(m=><tr key={m.id}><td>{m.kind}</td><td>{m.status}</td><td>{m.attempts}</td><td>{m.lastError??'—'}</td><td>{['FAILED','UNCERTAIN'].includes(m.status)&&<button disabled={busy} onClick={()=>retry(m.id,m.status==='UNCERTAIN')}>{m.status==='UNCERTAIN'?'Reconcile and retry':'Queue retry'}</button>}</td></tr>)}</tbody></table></div></div></Panel></>}
  </>;
}
