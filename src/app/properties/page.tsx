import { AnalyzeButton, PageHeader, PropertyCard } from "@/components/ui";
import { listProperties } from "@/lib/data/repository";
import { dataMode } from "@/lib/config/cloud";
export const metadata = { title: "Properties" };
export default async function Properties() { const properties = await listProperties(); return <><PageHeader eyebrow="YOUR REAL ESTATE" title="Properties" description="From acquisition through everyday operations." action={<AnalyzeButton />} /><div className="list-summary"><strong>{properties.length} properties</strong><span>{dataMode() === "demo" ? "Fictional examples for exploring your workspace" : "Saved properties in your private workspace"}</span></div>{properties.length === 0 && <p className="notice">No properties have been imported yet. Saved analyses appear on your Dashboard.</p>}<div className="property-grid">{properties.map(p => <PropertyCard key={p.id} property={p} />)}</div></>; }
