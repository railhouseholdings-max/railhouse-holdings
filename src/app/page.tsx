import Link from 'next/link';
import { Metric,PageHeader,Section,Status } from '@/components/ui';
import { Icon } from '@/components/icon';
import { listProperties } from '@/lib/data/repository';
import { portfolioMetrics,propertyMetrics } from '@/lib/calculations/portfolio';
import { money } from '@/lib/format';
import { dataMode } from '@/lib/config/cloud';

export const metadata={title:'My Portfolio'};
export default async function MyPortfolio() {
  const properties=await listProperties();
  const m=portfolioMetrics(properties);
  const ordered=[...properties].sort((a,b)=>(b.acquisition.acquisitionDate??'').localeCompare(a.acquisition.acquisitionDate??'')||a.address.localeCompare(b.address));
  return <>
    <PageHeader eyebrow="RAILHOUSE HOLDINGS" title="My Portfolio" description="Your properties, capital and rental performance."/>
    <div className="metrics-grid">
      <Metric label="Portfolio value" value={money(m.value)} hint={dataMode()==='demo'?'Current estimates · demo':'Recorded property valuations'} accent/>
      <Metric label="Total equity" value={money(m.equity)} hint="Recorded value less recorded debt"/>
      <Metric label={m.usesTargetRent?'Projected monthly cash flow':'Monthly cash flow'} value={money(m.cashFlow)} hint="After debt service and configured reserves"/>
      <Metric label="Properties" value={String(m.count).padStart(2,'0')} hint={`${properties.filter(p=>p.status==='Rented').length} rented · ${properties.filter(p=>p.status==='Rehab').length} in rehab`}/>
      <Metric label="Total debt" value={money(m.debt)} hint="Recorded balances; see property dates"/>
      <Metric label={m.usesTargetRent?'Monthly rent (includes targets)':'Monthly rent'} value={money(m.rent)} hint={m.usesTargetRent?'Includes target rent, not collected income':'Scheduled lease income'}/>
      <Metric label="Recorded cash invested" value={money(m.cashInvested)} hint="Documented contributions; see property notes"/>
    </div>
    <Section title="My Properties" action={<Link className="text-link" href="/properties?tab=mine">View all <Icon name="arrow"/></Link>}>
      {!ordered.length?<p className="muted">Your purchased properties will appear here.</p>:<div className="portfolio-property-list">{ordered.map(p=>{
        const metrics=propertyMetrics(p);
        return <Link key={p.id} href={`/properties/${p.id}`} className="portfolio-property-summary">
          <div className="portfolio-property-heading"><div><h3>{p.address}</h3><p className="muted">{[p.city,p.state,p.zip].filter(Boolean).join(' · ')}</p><p className="note">{p.beds??'?'} beds · {p.baths??'?'} baths · {p.squareFeet?.toLocaleString('en-US')??'Unknown'} sq ft</p></div><Status status={p.status}/></div>
          <dl className="portfolio-property-metrics">
            <div><dt>Recorded value</dt><dd>{money(p.valuation.currentEstimatedValue)}</dd></div>
            <div><dt>Equity</dt><dd>{money(metrics.equity)}</dd></div>
            <div><dt>{metrics.rentIsTarget?'Target rent / month':'Rent / month'}</dt><dd>{money(metrics.rent)}</dd></div>
            <div><dt>{metrics.rentIsTarget?'Projected cash flow / month':'Cash flow / month'}</dt><dd>{money(metrics.monthlyCashFlow)}</dd></div>
          </dl>
          <span className="portfolio-property-open">View property details <Icon name="arrow"/></span>
        </Link>;
      })}</div>}
    </Section>
  </>;
}
