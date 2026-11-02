// Allen County's public tax service, linked from the county treasurer website.
// Annual billed installments are used; outstanding balances are deliberately ignored.
export type TaxRecord = { annualTaxes: number; payYear: number; parcelId: string; sourceUrl: string; address: string };
type TaxRow = { PropertyAddress1?: string; PropertyCity?: string; PropertyState?: string; PayYear?: number; SpringTax?: number; FallTax?: number; DuplicateNumber?: number; StateKey?: string; Status?: string; TaxType?: string };
export type TaxSearch = { Results?: TaxRow[]; systemParameters?: { PayYear?: number }[] };
function normalize(value: string) {
  return value.toLowerCase().replace(/\bavenue\b/g, 'ave').replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bdrive\b/g, 'dr').replace(/\bboulevard\b/g, 'blvd').replace(/\bcourt\b/g, 'ct').replace(/\blane\b/g, 'ln').replace(/[^a-z0-9]/g, '');
}
export function supportsTaxLookup(address: string): boolean {
  return /\bfort wayne\b/i.test(address) && /\b(IN|Indiana)\b/i.test(address);
}
export function matchTaxRecord(data: TaxSearch, address: string, parcelId = ""): TaxRecord | null {
  const year = data.systemParameters?.[0]?.PayYear;
  const normalizedParcel = parcelId.replace(/\D/g, "");
  if ((!normalizedParcel && !supportsTaxLookup(address)) || !Number.isInteger(year) || !Array.isArray(data.Results)) return null;
  const street = normalize(address.split(',')[0]);
  const matches = data.Results.filter(row => row.PayYear === year && row.Status === 'A' && row.TaxType === 'R'
    && (normalizedParcel ? row.StateKey?.replace(/\D/g, '') === normalizedParcel : normalize(row.PropertyAddress1 ?? '') === street && normalize(row.PropertyCity ?? '') === 'fortwayne')
    && row.PropertyState === 'IN');
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (![row.SpringTax, row.FallTax].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      || !Number.isSafeInteger(row.DuplicateNumber) || !row.StateKey) return null;
  return { annualTaxes: Math.round((row.SpringTax! + row.FallTax!) * 100) / 100, payYear: year!, parcelId: row.StateKey,
    sourceUrl: `https://lowtaxinfo.com/allencounty/${row.DuplicateNumber}-${year}`,
    address: `${row.PropertyAddress1}, ${row.PropertyCity ?? "Allen County"}, IN` };
}
