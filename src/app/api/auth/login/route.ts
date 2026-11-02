import { NextResponse } from 'next/server';
import { cloudConfig, dataMode } from '@/lib/config/cloud';
import { isSameOriginWrite, passwordSignIn, SignInError } from '@/lib/cloud/http';
import { SESSION_COOKIE } from '@/lib/cloud/session';
export async function POST(request: Request) {
  if (dataMode() !== 'supabase') return Response.json({error:'Private mode is disabled.'},{status:404});
  const config = cloudConfig();
  if (!isSameOriginWrite(request,config.origin)) return Response.json({error:'Invalid request origin.'},{status:403});
  if (Number(request.headers.get('content-length') ?? 0) > 10000) return Response.json({error:'Request too large.'},{status:413});
  let session;
  try {
    const form = await request.formData(), email = String(form.get('email') ?? '').trim(), password = String(form.get('password') ?? '');
    if (!email || email.length > 320 || !password || password.length > 1024) throw new Error('Invalid credentials');
    session = await passwordSignIn(config,email,password);
  } catch (error) {
    const code=error instanceof SignInError ? error.code : 'unavailable';
    return new NextResponse(null,{status:303,headers:{Location:`/login?error=${code}`,'Cache-Control':'no-store'}});
  }
  if (!session) return new NextResponse(null,{status:303,headers:{Location:'/login?error=credentials','Cache-Control':'no-store'}});
  const response = new NextResponse(null,{status:303,headers:{Location:'/','Cache-Control':'no-store'}});
  response.cookies.set(SESSION_COOKIE,session.accessToken,{httpOnly:true,secure:new URL(config.origin).protocol === 'https:',sameSite:'lax',path:'/',maxAge:session.expiresIn});
  return response;
}
