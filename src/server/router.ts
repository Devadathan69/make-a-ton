import { getPool } from './db';
import { demoEnabled, effectiveDate } from './clock';
import { paymentsRoute } from './payments';
import { reportsRoute } from './reports';
import { deliverOutbox, outboxRoute } from './outbox';
import { invoicesRoute } from './invoices';
import { billingRoute, schedulerRoute } from './billing/worker';
import { subscriptionsRoute } from './subscriptions';
import { catalogRoute, isResource } from './catalog';
import { authRoute, requireUser, staffRoute } from './auth';
import { errorResponse, HttpError } from './errors';
export interface RequestEffects {
  defer(task:()=>Promise<void>):void;
  dispatch?:(dedupeKey:string)=>Promise<unknown>;
}
export async function handle(request:Request,parts:string[],effects?:RequestEffects):Promise<Response> {
  const onQueued=(key:string|null)=>effects?.defer(async()=>{
    if(!key||process.env.EMAIL_DELIVERY_ENABLED!=='true')return;
    try {await (effects.dispatch?effects.dispatch(key):deliverOutbox(undefined,1,key));}
    catch(error) {
      // Configuration failure proves no send started. Any other unpersisted outcome
      // may have reached SMTP, so require reconciliation before retrying.
      const notSent=error instanceof HttpError&&error.code==='EMAIL_NOT_CONFIGURED';
      await getPool().query("UPDATE outbox_messages SET delivery_state=$2,last_error=$3,next_attempt_at=CASE WHEN $4 THEN now()+interval '5 minutes' ELSE NULL END WHERE dedupe_key=$1 AND sent_at IS NULL",[key,notSent?'FAILED':'UNCERTAIN',notSent?'Immediate delivery is not configured; retry after setup':'Immediate delivery outcome could not be persisted; reconcile before retrying',notSent]);
    }
  });
  try {
    let response:Response;
    if(parts[0]==='auth' && parts.length===2) response=await authRoute(request,parts[1],onQueued);
    else if(parts[0]==='session' && parts.length===1 && request.method==='GET') response=Response.json({user:await requireUser(request),mode:'http',asOf:await effectiveDate(),demoClock:demoEnabled()});
    else if(parts[0]==='staff' && parts.length===1) response=await staffRoute(request);
    else if(parts.join('/')==='billing/run') response=await billingRoute(request);
    else if(parts.join('/')==='demo/clock') response=await billingRoute(request,true);
    else if(parts.join('/')==='scheduler/run') response=await schedulerRoute(request);
    else if(parts.join('/')==='system/status'&&request.method==='GET') {await requireUser(request,['ADMIN']);response=Response.json({asOf:await effectiveDate(),simulated:demoEnabled(),emailEnabled:process.env.EMAIL_DELIVERY_ENABLED==='true',schedulerConfigured:!!process.env.CRON_SECRET&&process.env.CRON_SECRET.length>=32});}
    else if(parts[0]==='payments') response=await paymentsRoute(request,parts);
    else if(parts.join('/')==='reports/summary') response=await reportsRoute(request);
    else if(parts[0]==='outbox') response=await outboxRoute(request,parts);
    else if(parts[0]==='invoices') response=await invoicesRoute(request,parts,false,onQueued);
    else if(parts[0]==='portal'&&parts[1]==='invoices') response=await invoicesRoute(request,parts.slice(1),true);
    else if(parts[0]==='subscriptions') response=await subscriptionsRoute(request,parts);
    else if(parts[0]==='portal'&&parts[1]==='subscriptions') response=await subscriptionsRoute(request,parts.slice(1),true);
    else if(isResource(parts[0]) && parts.length<=2) response=await catalogRoute(request,parts[0],parts[1]);
    else throw new HttpError(404,'NOT_FOUND','Endpoint not found');
    response.headers.set('Cache-Control','no-store');
    response.headers.set('X-Content-Type-Options','nosniff');
    return response;
  } catch(error) {return errorResponse(error);}
}
