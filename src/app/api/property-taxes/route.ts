import { lookupAccessDenied } from "@/lib/cloud/api-access";
import { NextRequest, NextResponse } from 'next/server';
import { matchTaxRecord, supportsTaxLookup } from '@/lib/taxes/property-taxes';
export async function GET(request: NextRequest) {
  const denied = await lookupAccessDenied(); if (denied) return denied;
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  const parcelId = request.nextUrl.searchParams.get('parcelId')?.replace(/\D/g, '') ?? '';
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if ((!parcelId && address.length < 8) || address.length > 240 || (parcelId && parcelId.length !== 18)) return json({ status: 'not-found' });
  if (!parcelId && !supportsTaxLookup(address)) return json({ status: 'unsupported' });
  const url = new URL('https://lowtaxinfo.com/lti-api/LowMobileTaxData.svc/api/PropertySearch');
  url.search = new URLSearchParams({ CorpCode: 'ALN', ...(parcelId ? {parcel:parcelId} : {address:address.split(',')[0]}), page_number: '0' }).toString();
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Tax service unavailable');
    const record = matchTaxRecord(await response.json(), address, parcelId);
    return json(record ? { status: 'found', record } : { status: 'not-found' });
  } catch { return json({ status: 'unavailable' }); }
}
