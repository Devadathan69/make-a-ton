const base=new URL(process.env.SMOKE_BASE_URL??'http://localhost:3000');
const mode=process.env.SMOKE_DATA_MODE??'http';
for(const path of ['/login','/register','/forgot-password','/reset-password','/api/health','/api/ready']){const r=await fetch(new URL(path,base));if(!r.ok)throw new Error(`${path}: ${r.status}`);console.log(`OK ${path}`);}
const routes=['/dashboard','/catalog/products','/catalog/plans','/catalog/rules','/customers','/quotes','/subscriptions','/invoices','/payments'];
if(mode==='http') {
  const session=await fetch(new URL('/api/v1/session',base));if(session.status!==401)throw new Error('Anonymous session must be denied');
  for(const path of [...routes,'/portal','/operations']){const r=await fetch(new URL(path,base),{redirect:'manual'});if(![302,303,307,308].includes(r.status)||!r.headers.get('location')?.endsWith('/login'))throw new Error(`${path}: anonymous access was not redirected`);}
  console.log('OK anonymous API/session and protected-page denial');
  if(process.env.DEMO_PASSWORD) {
    if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Fictitious credential smoke is restricted to loopback');
    const login=await fetch(new URL('/api/v1/auth/login',base),{method:'POST',headers:{origin:base.origin,'Content-Type':'application/json','X-LoopLedger-CSRF':'1'},body:JSON.stringify({email:'admin@example.test',password:process.env.DEMO_PASSWORD})});if(!login.ok)throw new Error(`Login: ${login.status}`);
    const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('No session');
    try{for(const path of [...routes,'/operations','/settings/staff','/api/v1/reports/summary','/api/v1/subscriptions']){const r=await fetch(new URL(path,base),{redirect:'manual',headers:{cookie}});if(r.status!==200)throw new Error(`${path}: ${r.status}`);console.log(`OK authenticated ${path}`);}}
    finally{await fetch(new URL('/api/v1/auth/logout',base),{method:'POST',headers:{origin:base.origin,'Content-Type':'application/json','X-LoopLedger-CSRF':'1',cookie},body:'{}'});}
  }
}else{for(const path of [...routes,'/portal']){const r=await fetch(new URL(path,base));if(!r.ok)throw new Error(`${path}: ${r.status}`);console.log(`OK mock ${path}`);}}
