// SERVER ONLY: this import is reachable only from the route, never from a client component.
// Bundled static data; no filesystem access, Excel parsing, or workbook download at runtime.
import 'server-only';
import snapshot from './data/allen-rentals-2026.json';
import type { RentalTaxParcel } from '../../domain/property-tax';
import { matchRentalParcel, normalizeParcelId, normalizeStreetAddress } from './rental-lookup';
const number = (value: string) => value === '' ? null : Number(value);
const parcels: RentalTaxParcel[] = snapshot.rows.split('\n').map(line => {
  const r = line.split('\t');
  const nb = snapshot.neighborhoods[Number(r[3])];
  return { parcelId:r[0],address:r[1],zip:r[2],neighborhood:nb[0],neighborhoodName:nb[1],grm:number(r[4]),
    assessedAsRental:r[5] === 'Y' ? true : r[5] === 'N' ? false : null,propertyClass:r[6],baseRentAssessment:number(r[7]),
    incomeCap2:number(r[8]),incomeCap3:number(r[9]),otherCap3:number(r[10]),lookupRow:Number(r[11]) };
});
const byParcel = new Map<string,RentalTaxParcel[]>();
const byStreet = new Map<string,RentalTaxParcel[]>();
for (const parcel of parcels) {
  const id = normalizeParcelId(parcel.parcelId), street = normalizeStreetAddress(parcel.address);
  byParcel.set(id,[...(byParcel.get(id) ?? []),parcel]);
  byStreet.set(street,[...(byStreet.get(street) ?? []),parcel]);
}
export function lookupRentalSnapshot(query: { address?: string; parcelId?: string }) {
  const key = query.parcelId || (/^\d[\d.\-\s]+$/.test(query.address ?? '') ? query.address : '');
  const candidates = key ? byParcel.get(normalizeParcelId(key)) : byStreet.get(normalizeStreetAddress(query.address ?? ''));
  const match = matchRentalParcel(candidates ?? [],query);
  return match.status === 'found' ? {...match,metadata:snapshot.metadata} : match;
}
