import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDecipheriv, randomBytes } from 'node:crypto';
import { deliverOutbox } from './outbox';
import { handle } from './router';
import { isolatedDatabase } from './test-db';
import { digest } from './auth';

describe.skipIf(!process.env.DB_TEST_URL)('connected authentication and permissions',()=>{
  let fixture:Awaited<ReturnType<typeof isolatedDatabase>>;
  let cookie='';
  const key=randomBytes(32).toString('hex');
  const send=(path:string,input:unknown,cookieValue=cookie,origin='http://localhost:3000')=>handle(new Request(`http://localhost:3000/api/v1/${path}`,{method:'POST',headers:{origin,'Content-Type':'application/json','X-LoopLedger-CSRF':'1',cookie:cookieValue},body:JSON.stringify(input)}),path.split('/'));
  const get=(path:string,cookieValue=cookie)=>handle(new Request(`http://localhost:3000/api/v1/${path}`,{headers:{cookie:cookieValue}}),path.split('/'));
  beforeAll(async()=>{fixture=await isolatedDatabase();process.env.APP_URL='http://localhost:3000';process.env.OUTBOX_ENCRYPTION_KEY=key;});
  afterAll(async()=>fixture.close());
  it('requires nine compliant characters and rejects role injection',async()=>{
    expect((await send('auth/register',{name:'Test',email:'test@example.test',password:'Abcdefg!'})).status).toBe(400);
    expect((await send('auth/register',{name:'Test',email:'test@example.test',password:'Abcdefgh!',role:'ADMIN'})).status).toBe(400);
    const res=await send('auth/register',{name:'Test',email:'test@example.test',password:'Abcdefgh!'});
    expect(res.status).toBe(201);cookie=res.headers.get('set-cookie')!.split(';')[0];
    const text=await res.text();expect(text).toContain('CUSTOMER');expect(text).not.toContain('password');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    expect((await get('session')).status).toBe(200);
  });
  it('enforces case-insensitive uniqueness transactionally',async()=>{
    expect((await send('auth/register',{name:'Other',email:'TEST@EXAMPLE.TEST',password:'Abcdefgh!'})).status).toBe(409);
    expect((await fixture.db.query('SELECT count(*) FROM customers')).rows[0].count).toBe('1');
  });
  it('denies logged-out/admin-only calls and forged origins',async()=>{
    expect((await get('session','')).status).toBe(401);
    expect((await get('staff')).status).toBe(403);
    expect((await send('staff',{name:'Bad',email:'staff@example.test',password:'Abcdefgh!'})).status).toBe(403);
    expect((await send('auth/logout',{},cookie,'http://evil.test')).status).toBe(403);
    expect((await send('auth/login',{email:'test@example.test',password:'wrong'})).status).toBe(401);
  });
  it('stores only hashed reset/session tokens and consumes reset once, revoking sessions',async()=>{
    expect((await send('auth/forgot-password',{email:'test@example.test'})).status).toBe(202);
    expect((await send('auth/forgot-password',{email:'unknown@example.test'})).status).toBe(202);
    const payload=(await fixture.db.query('SELECT payload FROM outbox_messages')).rows[0].payload;
    const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(payload.iv,'hex'));decipher.setAuthTag(Buffer.from(payload.tag,'hex'));
    const email=JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data,'hex')),decipher.final()]).toString());
    const token=new URLSearchParams(new URL(email.url).hash.slice(1)).get('token')!;
    const stored=(await fixture.db.query('SELECT token_hash FROM password_resets')).rows[0].token_hash;
    expect(stored).toBe(digest(token));expect(JSON.stringify(payload)).not.toContain(token);
    let resetMessage='';expect((await deliverOutbox(async m=>{resetMessage=m.text;})).sent).toBe(1);expect(resetMessage).toContain(`#token=${token}`);
    expect((await fixture.db.query('SELECT payload FROM outbox_messages')).rows[0].payload).toEqual({});
    expect((await send('auth/reset-password',{token:'0'.repeat(64),password:'Newpassw!'})).status).toBe(422);
    expect((await send('auth/reset-password',{token,password:'Newpassw!'})).status).toBe(200);
    expect((await send('auth/reset-password',{token,password:'Anotherp!'})).status).toBe(422);
    expect((await get('session')).status).toBe(401);
    const login=await send('auth/login',{email:'TEST@example.test',password:'Newpassw!'});expect(login.status).toBe(200);cookie=login.headers.get('set-cookie')!.split(';')[0];
    await send('auth/logout',{});expect((await get('session')).status).toBe(401);
  });
  it('allows only admin provisioning and always provisions STAFF',async()=>{
    await fixture.db.query("UPDATE users SET role='ADMIN',customer_id=NULL WHERE email='test@example.test'");
    const login=await send('auth/login',{email:'test@example.test',password:'Newpassw!'});cookie=login.headers.get('set-cookie')!.split(';')[0];
    const res=await send('staff',{name:'Staff',email:'staff@example.test',password:'Staffpass!'});expect(res.status).toBe(201);
    expect((await res.json()).role).toBe('STAFF');expect((await get('staff')).status).toBe(200);
    const staff=await send('auth/login',{email:'staff@example.test',password:'Staffpass!'});
    expect((await get('staff',staff.headers.get('set-cookie')!.split(';')[0])).status).toBe(403);
  });
  it('rejects expired resets and sessions' ,async()=>{
    await fixture.db.query("INSERT INTO password_resets(token_hash,user_id,expires_at) SELECT $1,id,now()-interval '1 second' FROM users WHERE email='test@example.test'",[digest('1'.repeat(64))]);
    expect((await send('auth/reset-password',{token:'1'.repeat(64),password:'Newpassw!'})).status).toBe(422);
    const login=await send('auth/login',{email:'test@example.test',password:'Newpassw!'});cookie=login.headers.get('set-cookie')!.split(';')[0];
    await fixture.db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");expect((await get('session')).status).toBe(401);
  });
  it('serializes old-password login with reset so no revoked credential creates a surviving session',async()=>{
    const token='2'.repeat(64);
    await fixture.db.query("INSERT INTO password_resets(token_hash,user_id,expires_at) SELECT $1,id,now()+interval '10 minutes' FROM users WHERE email='test@example.test'",[digest(token)]);
    const [login,reset]=await Promise.all([send('auth/login',{email:'test@example.test',password:'Newpassw!'}),send('auth/reset-password',{token,password:'Racepass!'})]);
    expect(reset.status).toBe(200);expect([200,401]).toContain(login.status);
    if(login.status===200)expect((await get('session',login.headers.get('set-cookie')!.split(';')[0])).status).toBe(401);
    expect((await fixture.db.query("SELECT count(*) FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.email='test@example.test'")).rows[0].count).toBe('0');
  });

  it('registers bounded reset delivery after response and keeps unknown accounts generic',async()=>{
    const schedule=async(email:string)=>{
      const tasks:(()=>Promise<void>)[]=[],sent:string[]=[];
      const request=new Request('http://localhost:3000/api/v1/auth/forgot-password',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json','X-LoopLedger-CSRF':'1'},body:JSON.stringify({email})});
      const response=await handle(request,['auth','forgot-password'],{defer:task=>tasks.push(task),dispatch:key=>deliverOutbox(async m=>{sent.push(m.to);},1,key)});
      return {tasks,sent,response};
    };
    vi.stubEnv('EMAIL_DELIVERY_ENABLED','true');
    try {
      const known=await schedule('test@example.test'),unknown=await schedule('not-present@example.test');
      expect(known.response.status).toBe(202);expect(await known.response.json()).toEqual(await unknown.response.json());
      expect(known.sent).toEqual([]);expect(known.tasks).toHaveLength(1);expect(unknown.tasks).toHaveLength(1);
      await known.tasks[0]();await unknown.tasks[0]();expect(known.sent).toEqual(['test@example.test']);expect(unknown.sent).toEqual([]);
      const uncertainTasks:(()=>Promise<void>)[]=[];
      const request=new Request('http://localhost:3000/api/v1/auth/forgot-password',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json','X-LoopLedger-CSRF':'1'},body:JSON.stringify({email:'test@example.test'})});
      expect((await handle(request,['auth','forgot-password'],{defer:task=>uncertainTasks.push(task),dispatch:async()=>{throw new Error('Unpersisted send outcome');}})).status).toBe(202);
      await uncertainTasks[0]();
      expect((await fixture.db.query("SELECT delivery_state,next_attempt_at FROM outbox_messages WHERE kind='PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1")).rows[0]).toEqual({delivery_state:'UNCERTAIN',next_attempt_at:null});
    } finally {vi.unstubAllEnvs();}
  });

});
