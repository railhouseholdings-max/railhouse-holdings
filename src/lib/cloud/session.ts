import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cloudConfig, dataMode } from '../config/cloud';
import { verifyOwner } from './http';
export const SESSION_COOKIE = 'railhouse-access-token';
export const ownerSession = cache(async () => {
  if (dataMode() === 'demo') return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifyOwner(cloudConfig(),token);
});
export async function requireOwner() {
  const session = await ownerSession();
  if (!session) redirect('/login');
  return session;
}
