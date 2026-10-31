import { getPool } from '@/server/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  try{if(process.env.NEXT_PUBLIC_DATA_MODE==='http')await getPool().query('SELECT 1');return Response.json({ready:true},{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({ready:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
