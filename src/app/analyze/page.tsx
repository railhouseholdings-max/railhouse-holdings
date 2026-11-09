import { PropertySeenTracker } from '@/components/scout/property-seen';
import Link from "next/link";
import { DealCalculator } from "@/components/deal-calculator";
import { PageHeader } from "@/components/ui";
import { getFeedProperty } from '@/lib/data/property-feed';
import { getDeal } from "@/lib/data/repository";
import { dataMode } from "@/lib/config/cloud";
import { requireOwner } from "@/lib/cloud/session";
export const metadata = { title: "Analyze Deal" };
export default async function Analyze({ searchParams }: { searchParams: Promise<{ deal?: string;property?:string }> }) { const cloudEnabled = dataMode() === "supabase"; if (cloudEnabled) await requireOwner(); const { deal,property } = await searchParams; const initialProperty=property?await getFeedProperty(property):null; const initialDeal = deal ? await getDeal(deal) : initialProperty?.deal??null; return <><PropertySeenTracker propertyId={initialDeal?.propertyId??initialProperty?.id}/><PageHeader eyebrow="BEFORE YOU BUY" title="Analyze a deal." description="Project costs, refinance recovery, and rental cash flow — in one clear view." />{deal && !initialDeal && <p className="notice">That deal could not be found. Start a new analysis below. <Link href="/analyze">Clear selection</Link></p>}<DealCalculator key={initialDeal?.id ?? initialProperty?.id ?? "new"} initialDeal={initialDeal} initialProperty={initialProperty} cloudEnabled={cloudEnabled} asOfDate={new Date().toISOString().slice(0, 10)} /></>; }
