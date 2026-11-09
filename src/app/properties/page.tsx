import Link from 'next/link';
import { AnalyzeButton,PageHeader } from '@/components/ui';
import { PropertyFeed } from '@/components/scout/property-feed';
import { ScoutSettings } from '@/components/scout/settings';
import { listPropertyFeed,scoutDashboard } from '@/lib/data/property-feed';
import { dataMode } from '@/lib/config/cloud';
import type { ScoutRun } from '@/domain/scout';
export const metadata={title:'Property Feed'};
export default async function Properties() {
  const [properties,scout]=await Promise.all([listPropertyFeed(),scoutDashboard()]);
  return <><PageHeader eyebrow="RAILHOUSE OPPORTUNITIES" title="Property feed" description="Your deal analyses and agent’s Google Sheet, together." action={<AnalyzeButton/>}/>{dataMode()==='demo'&&<p className="notice">Fictional demo records. Scout and saving are disabled until private cloud storage is configured.</p>}<ScoutSettings initial={scout.config} enabled={dataMode()==='supabase'}/><PropertyFeed properties={properties}/><section className="panel scout-run-history"><h2>Import activity</h2>{!scout.runs.length&&<p className="note">No imports yet. Daily and manual sheet imports will appear here.</p>}{scout.runs.map(r=>{const summary=r.summary as Partial<ScoutRun>;return <details key={String(r.id)}><summary>{new Date(String(r.started_at)).toLocaleString('en-US',{timeZone:'America/New_York'})} ET · {String(r.status)} · {Number(r.requests)} source/storage requests</summary><p className="note">Run {String(r.id)}</p><ul className="scout-risk-list">{(summary.report??summary.errors??[]).map((line,i)=><li key={i}>{line}</li>)}</ul></details>;})}<details><summary>Recent listing changes</summary>{!scout.changes.length&&<p className="note">No recorded listing changes.</p>}{scout.changes.map(change=>{const observation=change.observation as {address:string;status:string;price:number|null};return <p className="note" key={String(change.id)}><Link href={`/analyze?property=${change.property_id}`}>{observation.address}</Link> · {observation.status} · {observation.price?.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})??'Price unknown'} · {new Date(String(change.recorded_at)).toLocaleDateString('en-US')}</p>;})}</details></section></>;
}
