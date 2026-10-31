import { createHash, randomBytes, randomUUID, createCipheriv } from 'node:crypto';
import { z } from 'zod';
import type { Role, User } from '@/lib/contracts';
import { hashPassword, verifyPassword } from '../../scripts/password.mjs';
import { getPool, one, transaction, type Db } from './db';
import { findUserByEmail, publicUser, type UserRow } from './users';
import { body, HttpError } from './errors';

export const passwordPolicy = z.string().min(9,'Use at least nine characters').max(200).refine(v=>/[A-Z]/.test(v)&&/[a-z]/.test(v)&&/[^A-Za-z0-9]/.test(v),'Include uppercase, lowercase and a special character');
const email = z.email().max(254).transform(v=>v.trim().toLowerCase());
const registration=z.object({name:z.string().trim().min(1).max(100),email,password:passwordPolicy}).strict();
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const sessionCookie='ll_session';
export function checkOrigin(request:Request) {
  const configured=process.env.APP_URL;
  if(!configured) throw new HttpError(503,'CONFIGURATION_REQUIRED','Application origin is not configured');
  if(request.headers.get('origin')!==new URL(configured).origin || request.headers.get('X-LoopLedger-CSRF')!=='1') throw new HttpError(403,'CSRF_REJECTED','Request origin could not be verified');
}
function cookie(token:string,maxAge=60*60*24*7) {
  const secure=new URL(process.env.APP_URL!).protocol==='https:';
  return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;
}
function tokenFromRequest(request:Request) {return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length+1);}
export async function sessionUser(request:Request):Promise<User|null> {
  const token=tokenFromRequest(request);
  if(!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row=await one<UserRow>(getPool(),`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()`,[digest(token)]);
  return row?publicUser(row):null;
}
export async function requireUser(request:Request, roles:Role[]=['ADMIN','STAFF','CUSTOMER']):Promise<User> {
  const user=await sessionUser(request);
  if(!user) throw new HttpError(401,'UNAUTHENTICATED','Please sign in');
  if(!roles.includes(user.role)) throw new HttpError(403,'FORBIDDEN','You do not have permission');
  return user;
}
async function throttle(bucket:string,limit:number) {
  const row=await one<{attempts:number}>(getPool(),`INSERT INTO auth_throttles(bucket,attempts,resets_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN auth_throttles.resets_at<now() THEN 1 ELSE auth_throttles.attempts+1 END,resets_at=CASE WHEN auth_throttles.resets_at<now() THEN now()+interval '15 minutes' ELSE auth_throttles.resets_at END RETURNING attempts`,[bucket]);
  if(row!.attempts>limit) throw new HttpError(429,'THROTTLED','Please wait before trying again');
}
async function newSession(db:Db,user:User) {
  const token=randomBytes(32).toString('hex');
  await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[digest(token),user.id]);
  return token;
}
export function encryptResetPayload(payload:unknown) {
  const key=process.env.OUTBOX_ENCRYPTION_KEY;
  if(!key || !/^[a-f0-9]{64}$/.test(key)) throw new HttpError(503,'EMAIL_NOT_CONFIGURED','Password reset delivery is not configured');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);
  return {iv:iv.toString('hex'),data:data.toString('hex'),tag:cipher.getAuthTag().toString('hex')};
}
const dummyHash=hashPassword('Dummy!Comparison');
export async function authRoute(request:Request,action:string):Promise<Response> {
  if(request.method!=='POST') throw new HttpError(405,'METHOD_NOT_ALLOWED','Use POST');
  checkOrigin(request);
  if(action==='logout') {
    const token=tokenFromRequest(request);
    if(token) await getPool().query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);
    return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0)}});
  }
  const input=await body(request);
  await throttle('auth:global',1000);
  if(action==='register') {
    const data=registration.parse(input);
    await throttle(`register:${digest(data.email)}`,10);
    const passwordHash=await hashPassword(data.password);
    const result=await transaction(async db=>{
      const customerId=randomUUID(),id=randomUUID();
      await db.query('INSERT INTO customers(id,name,email,company) VALUES($1,$2,$3,$2)',[customerId,data.name,data.email]);
      await db.query("INSERT INTO users(id,name,email,password_hash,role,customer_id) VALUES($1,$2,$3,$4,'CUSTOMER',$5)",[id,data.name,data.email,passwordHash,customerId]);
      const user:User={id,name:data.name,email:data.email,role:'CUSTOMER',customerId};
      return {user,token:await newSession(db,user)};
    });
    return Response.json({user:result.user,mode:'http'},{status:201,headers:{'Set-Cookie':cookie(result.token)}});
  }
  if(action==='login') {
    const data=z.object({email,password:z.string().min(1).max(200)}).strict().parse(input);
    await throttle(`login:${digest(data.email)}`,20);
    const row=await findUserByEmail(getPool(),data.email);
    const valid=await verifyPassword(data.password,row?.password_hash??await dummyHash);
    if(!row||!valid) throw new HttpError(401,'INVALID_CREDENTIALS','Email or password is incorrect');
    const user=publicUser(row),token=await newSession(getPool(),user);
    return Response.json({user,mode:'http'},{headers:{'Set-Cookie':cookie(token)}});
  }
  if(action==='forgot-password') {
    const data=z.object({email}).strict().parse(input);
    await throttle(`reset:${digest(data.email)}`,5);
    // Check configuration before lookup so availability does not reveal account existence.
    encryptResetPayload({});
    await transaction(async db=>{
      const row=await findUserByEmail(db,data.email);
      if(!row) return;
      const token=randomBytes(32).toString('hex'),hash=digest(token);
      await db.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[hash,row.id]);
      const payload=encryptResetPayload({to:row.email,url:`${new URL('/reset-password',process.env.APP_URL).href}#token=${token}`});
      await db.query("INSERT INTO outbox_messages(id,dedupe_key,kind,payload) VALUES($1,$2,'PASSWORD_RESET',$3)",[randomUUID(),`reset:${hash}`,payload]);
    });
    return Response.json({message:'If that account exists, a reset email has been queued.'},{status:202});
  }
  if(action==='reset-password') {
    const data=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:passwordPolicy}).strict().parse(input);
    await throttle(`reset-token:${digest(data.token)}`,10);
    const passwordHash=await hashPassword(data.password);
    await transaction(async db=>{
      const reset=await one<{user_id:string}>(db,'SELECT user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()',[digest(data.token)]);
      if(!reset) throw new HttpError(422,'INVALID_RESET','Reset link is invalid or expired');
      // Serialize against other reset tokens for this user, then invalidate every token/session.
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[reset.user_id]);
      const valid=await one(db,'SELECT token_hash FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[digest(data.token)]);
      if(!valid) throw new HttpError(422,'INVALID_RESET','Reset link is invalid or expired');
      await db.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[passwordHash,reset.user_id]);
      await db.query('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[reset.user_id]);
      await db.query('DELETE FROM sessions WHERE user_id=$1',[reset.user_id]);
    });
    return Response.json({message:'Password updated. Sign in again.'},{headers:{'Set-Cookie':cookie('',0)}});
  }
  throw new HttpError(404,'NOT_FOUND','Endpoint not found');
}
export async function staffRoute(request:Request) {
  await requireUser(request,['ADMIN']);
  if(request.method==='GET') {
    const rows=(await getPool().query<UserRow>("SELECT * FROM users WHERE role IN ('ADMIN','STAFF') ORDER BY email LIMIT 100")).rows;
    return Response.json(rows.map(publicUser));
  }
  if(request.method!=='POST') throw new HttpError(405,'METHOD_NOT_ALLOWED','Use GET or POST');
  checkOrigin(request);
  const data=registration.parse(await body(request));
  const row=await one<UserRow>(getPool(),"INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'STAFF') RETURNING *",[randomUUID(),data.name,data.email,await hashPassword(data.password)]);
  return Response.json(publicUser(row!),{status:201});
}
