import { redirect } from 'next/navigation';
import { StaffPage } from '@/features/auth/staff-page';
import { pageUser } from '@/server/page-session';
export default async function Page(){
  if(process.env.NEXT_PUBLIC_DATA_MODE!=='http') return <p>Staff administration requires connected mode.</p>;
  if((await pageUser()).role!=='ADMIN') redirect('/dashboard');
  return <StaffPage/>;
}
