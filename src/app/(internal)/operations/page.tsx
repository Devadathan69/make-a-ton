import { redirect } from 'next/navigation';
import { pageUser } from '@/server/page-session';
import { OperationsPage } from '@/components/operations';
export default async function Page(){if(process.env.NEXT_PUBLIC_DATA_MODE!=='http')return <p>Billing operations require connected mode.</p>;if((await pageUser()).role!=='ADMIN')redirect('/dashboard');return <OperationsPage/>;}
