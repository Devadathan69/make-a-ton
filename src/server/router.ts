import { authRoute, requireUser, staffRoute } from './auth';
import { errorResponse, HttpError } from './errors';
export async function handle(request:Request,parts:string[]):Promise<Response> {
  try {
    let response:Response;
    if(parts[0]==='auth' && parts.length===2) response=await authRoute(request,parts[1]);
    else if(parts[0]==='session' && parts.length===1 && request.method==='GET') response=Response.json({user:await requireUser(request),mode:'http'});
    else if(parts[0]==='staff' && parts.length===1) response=await staffRoute(request);
    else throw new HttpError(404,'NOT_FOUND','Endpoint not found');
    response.headers.set('Cache-Control','no-store');
    response.headers.set('X-Content-Type-Options','nosniff');
    return response;
  } catch(error) {return errorResponse(error);}
}
