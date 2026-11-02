import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dataMode } from '@/lib/config/cloud';
import { ownerSession } from '@/lib/cloud/session';
const messages: Record<string,string> = {
  credentials:'Sign-in failed. Use the email and password of the user created under Supabase Authentication → Users.',
  owner:'Supabase accepted this login, but its User UID does not match SUPABASE_OWNER_ID. Copy the UID of this Authentication user into .env.local and restart the development server.',
  confirmation:'This account’s email is not confirmed. Confirm the owner user in Supabase Authentication → Users before signing in.',
  provider:'Email/password sign-in is disabled for this project. Enable the Email provider under Supabase Authentication → Sign In / Providers. Public signups can remain disabled.',
  key:'Supabase rejected the API key. Check that SUPABASE_PUBLISHABLE_KEY belongs to the same project as SUPABASE_URL, then restart the development server.',
  'rate-limit':'Supabase is temporarily limiting sign-in attempts. Wait before retrying.',
  unavailable:'Cannot reach the sign-in service right now. Check the development terminal and your connection, then try again.',
};
export const metadata = {title:'Sign in'};
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}) {
  if (dataMode() === 'demo') return <section className="panel"><h1>Demo workspace</h1><p className="note">Cloud sign-in is disabled. Your local calculator and examples are available.</p><Link className="button" href="/">Open workspace</Link></section>;
  if (await ownerSession()) redirect('/');
  const {error} = await searchParams;
  return <section className="panel login-panel"><p className="eyebrow">PRIVATE WORKSPACE</p><h1>Sign in to Railhouse</h1><p className="note">Use your configured owner’s Supabase email and password. There is no public signup.</p>{error && <p className="error" role="alert">{messages[error] ?? messages.unavailable}</p>}<form action="/api/auth/login" method="post"><label className="field"><span>Email</span><input type="email" name="email" autoComplete="username" required maxLength={320}/></label><label className="field"><span>Password</span><input type="password" name="password" autoComplete="current-password" required maxLength={1024}/></label><button className="button" type="submit">Sign in</button></form><p className="note">Sessions last up to one hour. Sign in again after expiry. In-progress calculator inputs stay on the current tab; save before leaving it.</p></section>;
}
