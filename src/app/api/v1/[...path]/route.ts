import { after } from 'next/server';
import { handle } from '@/server/router';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Vercel Hobby with Fluid Compute supports 300 seconds, including after callbacks.
export const maxDuration=300;
async function route(request:Request,context:{params:Promise<{path:string[]}>}) {return handle(request,(await context.params).path,{defer:task=>after(task)});}
export {route as GET,route as POST,route as PATCH};
