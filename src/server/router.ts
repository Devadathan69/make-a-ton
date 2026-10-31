import { demoEnabled, effectiveDate } from './clock';
import { paymentsRoute } from './payments';
import { reportsRoute } from './reports';
import { outboxRoute } from './outbox';
import { invoicesRoute } from './invoices';
import { billingRoute, schedulerRoute } from './billing/worker';
import { subscriptionsRoute } from './subscriptions';
import { catalogRoute, isResource } from './catalog';
import { authRoute, requireUser, staffRoute } from './auth';
import { errorResponse, HttpError } from './errors';
export async function handle(request:Request,parts:string[]):Promise<Response> {
  try {
    let response:Response;
    if(parts[0]==='auth' && parts.length===2) response=await authRoute(request,parts[1]);
    else if(parts[0]==='session' && parts.length===1 && request.method==='GET') response=Response.json({user:await requireUser(request),mode:'http',asOf:await effectiveDate(),demoClock:demoEnabled()});
    else if(parts[0]==='staff' && parts.length===1) response=await staffRoute(request);
    else if(parts.join('/')==='billing/run') response=await billingRoute(request);
    else if(parts.join('/')==='demo/clock') response=await billingRoute(request,true);
    else if(parts.join('/')==='scheduler/run') response=await schedulerRoute(request);
    else if(parts.join('/')==='system/status'&&request.method==='GET') {await requireUser(request,['ADMIN']);response=Response.json({asOf:await effectiveDate(),simulated:demoEnabled(),emailEnabled:process.env.EMAIL_DELIVERY_ENABLED==='true',schedulerConfigured:!!process.env.CRON_SECRET&&process.env.CRON_SECRET.length>=32});}
    else if(parts[0]==='payments') response=await paymentsRoute(request,parts);
    else if(parts.join('/')==='reports/summary') response=await reportsRoute(request);
    else if(parts[0]==='outbox') response=await outboxRoute(request,parts);
    else if(parts[0]==='invoices') response=await invoicesRoute(request,parts);
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
