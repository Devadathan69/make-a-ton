// Operator fallback after the deployment/credential setup has been approved.
const base=new URL(process.env.APP_URL??'http://invalid');
const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
if((!local&&base.protocol!=='https:')||process.env.CONFIRM_CATCHUP_TARGET!==base.origin)throw new Error('Set APP_URL and CONFIRM_CATCHUP_TARGET to the same approved HTTPS origin (loopback HTTP is allowed for a test).');
if(!process.env.CRON_SECRET||process.env.CRON_SECRET.length<32)throw new Error('Supply the server-only CRON_SECRET privately');
const max=Number(process.env.CATCHUP_MAX_RUNS??20);if(!Number.isInteger(max)||max<1||max>100)throw new Error('CATCHUP_MAX_RUNS must be 1–100');
for(let n=0;n<max;n++) {
  const response=await fetch(new URL('/api/v1/scheduler/run',base),{method:'POST',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(240000)});
  if(!response.ok)throw new Error(`Scheduler returned ${response.status}; inspect its status and retry safely`);
  const result=await response.json();console.log(JSON.stringify({run:n+1,runId:result.runId,generated:result.generated,skipped:result.skipped,failed:result.failed,remainingDue:result.remainingDue}));
  if(result.remainingDue===0)break;
  if(result.generated===0&&result.skipped===0)throw new Error('No progress; resolve failed periods before retrying');
  if(n===max-1)throw new Error('Catch-up budget reached; due records remain for a later invocation');
  await new Promise(resolve=>setTimeout(resolve,61000)); // Respect the one-minute rate guard.
}
