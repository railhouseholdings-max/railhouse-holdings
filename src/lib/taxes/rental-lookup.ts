import type { RentalTaxParcel } from '../../domain/property-tax.ts';
export function normalizeParcelId(value: string): string { return value.replace(/[^\d]/g, ''); }
export function normalizeStreetAddress(value: string): string {
  const suffixes: Record<string,string> = {avenue:'ave',street:'st',road:'rd',drive:'dr',boulevard:'blvd',court:'ct',lane:'ln',place:'pl',circle:'cir',trail:'trl',parkway:'pkwy',terrace:'ter',north:'n',south:'s',east:'e',west:'w'};
  return value.split(',')[0].toLowerCase().replace(/\b[a-z]+\b/g, word => suffixes[word] ?? word).replace(/[^a-z0-9]/g,'');
}
export function matchRentalParcel(records: RentalTaxParcel[], query: { address?: string; parcelId?: string }): { status: 'found'; parcel: RentalTaxParcel } | { status: 'missing' | 'ambiguous' | 'conflict'; message: string } {
  const parcelId = normalizeParcelId(query.parcelId ?? '');
  const rawAddress = query.address?.trim() ?? '';
  const embeddedParcel = /^\d[\d.\-\s]+$/.test(rawAddress) ? normalizeParcelId(rawAddress) : '';
  const id = parcelId || embeddedParcel;
  if (id && id.length !== 18) return { status:'missing', message:'Enter the full 18-digit Allen County parcel ID.' };
  const street = embeddedParcel ? '' : normalizeStreetAddress(rawAddress);
  const zip = rawAddress.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  const state = rawAddress.match(/,\s*([A-Za-z]{2}|Indiana)\s*(?:\d{5}(?:-\d{4})?)?\s*$/)?.[1]?.toUpperCase();
  if (state && !['IN','INDIANA'].includes(state)) return {status:'missing',message:'The workbook covers Allen County, Indiana only.'};
  if (!id && !/^\d/.test(rawAddress)) return {status:'missing',message:'Enter a complete street address or parcel ID to match the county workbook.'};
  const candidates = records.filter(row => id ? normalizeParcelId(row.parcelId) === id
    : normalizeStreetAddress(row.address) === street && (!zip || row.zip === zip));
  if (candidates.length > 1) return {status:'ambiguous',message:'Multiple workbook rows match this property. Supply a unique parcel ID or enter a manual tax estimate.'};
  if (candidates.length === 0) return {status:'missing',message:'No matching property was found in the county workbook snapshot. Enter a manual annual-tax estimate.'};
  const parcel = candidates[0];
  if (id && street && (normalizeStreetAddress(parcel.address) !== street || (zip && parcel.zip !== zip))) return {status:'conflict',message:'The address and parcel ID refer to different properties. Check them before using a county estimate.'};
  return {status:'found',parcel};
}
