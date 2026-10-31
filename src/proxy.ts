import { NextResponse, type NextRequest } from 'next/server';
import { sessionUser } from '@/server/auth';
/** Reject before streaming or cached layouts; domain handlers still authorize every call. */
export async function proxy(request:NextRequest) {
  if(process.env.NEXT_PUBLIC_DATA_MODE!=='http')return NextResponse.next();
  try {
    const user=await sessionUser(request),path=request.nextUrl.pathname;
    const redirect=(to:string)=>NextResponse.redirect(new URL(to,request.url));
    if(!user)return redirect('/login');
    if(user.role==='CUSTOMER'&&!path.startsWith('/portal'))return redirect('/portal');
    if(user.role!=='CUSTOMER'&&path.startsWith('/portal'))return redirect('/dashboard');
    if(user.role!=='ADMIN'&&(path.startsWith('/settings/staff')||path.startsWith('/operations')))return redirect('/dashboard');
    return NextResponse.next();
  } catch {return new NextResponse('Sign-in service unavailable. Please retry.',{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const config={matcher:['/dashboard/:path*','/catalog/:path*','/customers/:path*','/quotes/:path*','/subscriptions/:path*','/invoices/:path*','/payments/:path*','/portal/:path*','/settings/:path*','/operations/:path*']};
