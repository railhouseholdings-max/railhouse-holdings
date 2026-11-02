import 'server-only';
import { dataMode } from '../config/cloud';
import { ownerSession } from './session';
export async function lookupAccessDenied() {
  if (dataMode() === 'supabase' && !await ownerSession()) return Response.json({error:'Sign in to use the private workspace.'},{status:401,headers:{'Cache-Control':'no-store'}});
  return null;
}
