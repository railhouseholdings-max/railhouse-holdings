import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { cloudConfig, dataMode } from '@/lib/config/cloud';
import { cloudHeaders, isSameOriginWrite } from '@/lib/cloud/http';
import { SESSION_COOKIE } from '@/lib/cloud/session';
export async function POST(request: Request) {
  if (dataMode() !== 'supabase') return new Response(null,{status:404});
  const config = cloudConfig();
  if (!isSameOriginWrite(request,config.origin)) return new Response(null,{status:403});
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    try { await fetch(`${config.url}/auth/v1/logout?scope=local`,{method:'POST',headers:cloudHeaders(config,token),cache:'no-store',signal:AbortSignal.timeout(10000)}); }
    catch { /* Always remove the local cookie, even if remote logout is unavailable. */ }
  }
  const response = new NextResponse(null,{status:303,headers:{Location:'/login','Cache-Control':'no-store'}});
  response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,secure:new URL(config.origin).protocol === 'https:',sameSite:'lax',path:'/',maxAge:0});
  return response;
}
