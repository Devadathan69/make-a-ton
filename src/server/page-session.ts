import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUser } from './auth';
export async function pageUser() {
  const jar=await cookies();
  const user=await sessionUser(new Request(process.env.APP_URL??'http://localhost:3000',{headers:{cookie:jar.toString()}}));
  if(!user) redirect('/login');
  return user;
}
