import { redirect } from 'next/navigation';
import { pageUser } from '@/server/page-session';
export default async function InternalLayout({children}:{children:React.ReactNode}) {
  if(process.env.NEXT_PUBLIC_DATA_MODE==='http') {
    const user=await pageUser();
    if(user.role==='CUSTOMER') redirect('/portal');
  }
  return children;
}
