import { mkdir, writeFile } from 'node:fs/promises';
const base=new URL(process.env.BENCHMARK_BASE_URL??'http://localhost:3000');
if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('This benchmark is restricted to an authorized loopback demo. Deployed measurements require a separately approved target.');
if(!process.env.DEMO_PASSWORD)throw new Error('Supply the local fictitious DEMO_PASSWORD privately');
const login=await fetch(new URL('/api/v1/auth/login',base),{method:'POST',headers:{origin:base.origin,'Content-Type':'application/json','X-LoopLedger-CSRF':'1'},body:JSON.stringify({email:'admin@example.test',password:process.env.DEMO_PASSWORD})});
if(!login.ok)throw new Error(`Demo login failed: ${login.status}`);
const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('No demo session');
const results={environment:'local loopback HTTP production build; not deployed p95',samples:50,warmups:5,measuredAt:new Date().toISOString(),routes:[]};
try {
  for(const path of ['/api/v1/subscriptions?pageSize=20','/api/v1/reports/summary','/api/v1/invoices?pageSize=20']) {
    const samples=[];let total;
    for(let i=0;i<55;i++) {
      const start=performance.now(),response=await fetch(new URL(path,base),{headers:{cookie},cache:'no-store'});
      if(!response.ok)throw new Error(`${path}: ${response.status}`);
      const payload=await response.json();total=payload.total??payload.activeSubscriptions;
      if(i>=5)samples.push(performance.now()-start);
    }
    samples.sort((a,b)=>a-b);
    results.routes.push({path,records:total,p50Ms:Math.round(samples[24]*100)/100,p95Ms:Math.round(samples[47]*100)/100,maxMs:Math.round(samples[49]*100)/100});
  }
  if(results.routes[0].records<5000)throw new Error('Run the isolated 5000-subscription performance seed first');
  await mkdir('output',{recursive:true});await writeFile('output/local-benchmark.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
} finally {await fetch(new URL('/api/v1/auth/logout',base),{method:'POST',headers:{origin:base.origin,'Content-Type':'application/json','X-LoopLedger-CSRF':'1',cookie},body:'{}'});}
