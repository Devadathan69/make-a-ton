import { getPool, one, type Db } from './db';
import { HttpError } from './errors';
export function realDate() {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function demoEnabled() {
  if(process.env.ENABLE_DEMO_CLOCK!=='true')return false;
  const url=new URL(process.env.DATABASE_URL!);
  if(process.env.DEMO_DATABASE_NAME!==url.pathname.slice(1)||!/demo|test/.test(url.pathname)) throw new HttpError(503,'DEMO_NOT_ISOLATED','Demo clock requires an explicitly named isolated demo/test database');
  return true;
}
export async function effectiveDate(db:Db=getPool()) {
  if(demoEnabled())return (await one<{as_of:string}>(db,'SELECT as_of FROM demo_clock WHERE singleton=true'))?.as_of??realDate();
  return realDate();
}
