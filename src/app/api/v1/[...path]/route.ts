import { handle } from '@/server/router';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function route(request:Request,context:{params:Promise<{path:string[]}>}) {return handle(request,(await context.params).path);}
export {route as GET,route as POST,route as PATCH};
