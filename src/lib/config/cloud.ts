export type DataMode = 'demo' | 'supabase';
export interface CloudConfig { mode: 'supabase'; url: string; publishableKey: string; ownerId: string; origin: string }
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function dataMode(env: Readonly<Record<string,string|undefined>> = process.env): DataMode {
  const mode = env.RAILHOUSE_DATA_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'supabase') throw new Error('RAILHOUSE_DATA_MODE must be demo or supabase.');
  return mode;
}
export function cloudConfig(env: Readonly<Record<string,string|undefined>> = process.env): CloudConfig {
  if (dataMode(env) !== 'supabase') throw new Error('Private cloud storage is not enabled.');
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_OWNER_ID: ownerId, APP_ORIGIN: origin } = env;
  if (!url || !publishableKey || !ownerId || !origin) throw new Error('Private cloud configuration is incomplete. Check the server environment variables.');
  const project = new URL(url), app = new URL(origin);
  if (project.protocol !== 'https:' || project.username || project.password || project.search || project.hash || project.pathname !== '/') throw new Error('SUPABASE_URL must be an HTTPS project origin.');
  if (!publishableKey.startsWith('sb_publishable_') && publishableKey.split('.').length !== 3) throw new Error('Use a Supabase publishable key, not a secret/service-role key.');
  if (publishableKey.startsWith('sb_secret_')) throw new Error('Privileged keys are not used by this application.');
  // Legacy anon JWTs are accepted, but legacy service_role JWTs must be rejected.
  if (publishableKey.split('.').length === 3) {
    try { if (JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString()).role !== 'anon') throw new Error(); }
    catch { throw new Error('The legacy API key must be an anon key.'); }
  }
  if (!UUID_PATTERN.test(ownerId)) throw new Error('SUPABASE_OWNER_ID must be the Auth user UUID.');
  if (app.username || app.password || app.search || app.hash || app.pathname !== '/' || !['http:','https:'].includes(app.protocol)) throw new Error('APP_ORIGIN must be an application origin.');
  if (app.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(app.hostname)) throw new Error('Non-local application origins require HTTPS.');
  return { mode:'supabase',url:project.origin,publishableKey,ownerId:ownerId.toLowerCase(),origin:app.origin };
}
