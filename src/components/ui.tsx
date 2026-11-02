import Link from "next/link";
import type { ReactNode } from "react";
import type { Property } from "@/domain/models";
import { propertyMetrics } from "@/lib/calculations/portfolio";
import { money } from "@/lib/format";
import { Icon } from "./icon";
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</header>; }
export function AnalyzeButton() { return <Link href="/analyze" className="button"><Icon name="plus" />Analyze New Deal</Link>; }
export function Metric({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) { return <div className={`metric ${accent ? "accent" : ""}`}><p>{label}</p><strong>{value}</strong>{hint && <span>{hint}</span>}</div>; }
export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <section className="panel"><div className="section-heading"><h2>{title}</h2>{action}</div>{children}</section>; }
export function Status({ status }: { status: string }) { return <span className={`badge ${status === "Rehab" || status === "Researching" ? "amber" : ""}`}><span />{status}</span>; }
export function PropertyCard({ property: p }: { property: Property }) { const m = propertyMetrics(p); return <Link href={`/properties/${p.id}`} className="property-card"><div className="property-top"><div className="house-symbol"><Icon name="properties" /></div><Status status={p.status} /></div><h3>{p.address}</h3><p className="muted">{p.city}, {p.state} {p.zip}</p><p className="property-specs">{p.beds} beds <span>·</span> {p.baths} baths <span>·</span> {p.squareFeet.toLocaleString("en-US")} sq ft</p><div className="property-bottom"><div><small>Estimated value</small><strong>{money(p.valuation.currentEstimatedValue)}</strong></div><div><small>Cash flow / mo</small><strong className={m.monthlyCashFlow >= 0 ? "positive" : "negative"}>{money(m.monthlyCashFlow)}</strong></div></div><span className="card-link">View property <Icon name="arrow" /></span></Link>; }
export function DetailRows({ rows }: { rows: [ReactNode, ReactNode][] }) { return <dl className="detail-rows">{rows.map(([label, value], index) => <div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
