import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { PropertyFeed } from '@/components/scout/property-feed';
import { listPropertyFeed } from '@/lib/data/property-feed';
import { dataMode } from '@/lib/config/cloud';

export const metadata={title:'Property Feed'};
export default async function Properties({searchParams}:{searchParams:Promise<{tab?:string}>}) {
  const mine=(await searchParams).tab==='mine';
  const properties=await listPropertyFeed();
  return <>
    <nav className="property-tabs" aria-label="Property views">
      <Link href="/properties" className={!mine?'active':''} aria-current={!mine?'page':undefined}>Property Feed</Link>
      <Link href="/properties?tab=mine" className={mine?'active':''} aria-current={mine?'page':undefined}>My Properties</Link>
    </nav>
    <PageHeader eyebrow={mine?'RAILHOUSE PORTFOLIO':'RAILHOUSE OPPORTUNITIES'} title={mine?'My properties':'Property feed'} description={mine?'The properties you own, with their details and saved analyses.':'Your properties and latest opportunities, newest first.'}/>
    {dataMode()==='demo'&&<p className="notice">Fictional demo records. Saving is disabled until private cloud storage is configured.</p>}
    <PropertyFeed key={mine?'mine':'feed'} properties={properties.filter(p=>mine?p.lifecycle==='owned':p.lifecycle!=='owned')} now={new Date().toISOString()} owned={mine}/>
  </>;
}
