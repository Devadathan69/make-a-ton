import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(public status:number, public code:string, message:string, public fields?:Record<string,string>) { super(message); }
}
export const missing = () => new HttpError(404,'NOT_FOUND','Record not found');
export function errorResponse(error:unknown):Response {
  if(error instanceof HttpError) return Response.json({error:{code:error.code,message:error.message,...(error.fields?{fields:error.fields}:{})}},{status:error.status,headers:{'Cache-Control':'no-store'}});
  if(error instanceof ZodError) return errorResponse(new HttpError(400,'VALIDATION_ERROR','Check the highlighted fields',Object.fromEntries(error.issues.map(i=>[i.path.join('.'),i.message]))));
  if(typeof error==='object' && error && 'code' in error) {
    if(error.code==='23505') return errorResponse(new HttpError(409,'CONFLICT','A record with these unique details already exists'));
    if(error.code==='23503' || error.code==='23514') return errorResponse(new HttpError(422,'VALIDATION_ERROR','A reference or value is invalid'));
  }
  // Avoid request bodies, SQL values, credentials or tokens in logs or responses.
  return errorResponse(new HttpError(500,'INTERNAL_ERROR','The operation could not be completed'));
}
export async function body(request:Request):Promise<unknown> {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(400,'INVALID_JSON','Send application/json');
  const raw=await request.text();
  if(raw.length>100000) throw new HttpError(413,'BODY_TOO_LARGE','Request is too large');
  try{return JSON.parse(raw);}catch{throw new HttpError(400,'INVALID_JSON','Invalid JSON');}
}
