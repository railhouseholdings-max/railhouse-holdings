import type { CloudConfig } from '../config/cloud.ts';
export type Fetcher = typeof fetch;
export function cloudHeaders(config: CloudConfig, accessToken?: string): Headers {
  const headers = new Headers({apikey:config.publishableKey,'Content-Type':'application/json'});
  if (accessToken) headers.set('Authorization',`Bearer ${accessToken}`);
  return headers;
}
export function isSameOriginWrite(request: Request, expectedOrigin: string): boolean {
  return request.headers.get('origin') === expectedOrigin;
}
export interface OwnerSession { accessToken: string; userId: string }
export async function verifyOwner(config: CloudConfig, token: string | undefined, fetcher: Fetcher = fetch): Promise<OwnerSession | null> {
  if (!token || token.length > 8000) return null;
  // Ask Supabase to verify the token; never trust a decoded browser JWT or user ID.
  const response = await fetcher(`${config.url}/auth/v1/user`,{headers:cloudHeaders(config,token),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Authentication service is unavailable.');
  const user = await response.json() as {id?:string};
  return user.id === config.ownerId ? {accessToken:token,userId:user.id} : null;
}
export async function passwordSignIn(config: CloudConfig, email: string, password: string, fetcher: Fetcher = fetch) {
  const response = await fetcher(`${config.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:cloudHeaders(config),cache:'no-store',signal:AbortSignal.timeout(15000),body:JSON.stringify({email,password})});
  if (!response.ok) return null;
  const session = await response.json() as {access_token?:string;expires_in?:number;user?:{id?:string}};
  if (session.user?.id !== config.ownerId || !session.access_token || !Number.isFinite(session.expires_in) || session.expires_in! <= 0) return null;
  // Intentionally no refresh-token storage or custom JWT verification. Re-login on expiry.
  return {accessToken:session.access_token,expiresIn:Math.min(session.expires_in!,3600)};
}
export async function restRequest<T>(config: CloudConfig, session: OwnerSession, path: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<T> {
  if (session.userId !== config.ownerId) throw new Error('Private workspace access denied.');
  if (!/^(properties|deals)(\?|$)|^rpc\/save_deal$/.test(path)) throw new Error('Unsupported repository operation.');
  const response = await fetcher(`${config.url}/rest/v1/${path}`,{...init,headers:cloudHeaders(config,session.accessToken),cache:'no-store',signal:AbortSignal.timeout(15000)});
  if (response.status === 401 || response.status === 403) throw new Error('Session expired or workspace access denied. Sign in again.');
  if (response.status === 409) throw new Error('This deal changed in another session. Reload it before saving again.');
  if (!response.ok) throw new Error('Cloud database request failed. Check migrations, owner setup, and database availability.');
  return await response.json() as T;
}
