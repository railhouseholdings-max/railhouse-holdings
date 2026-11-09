export interface PropertyFact { label: string; value: string }
export interface RentCastLookup {
  source: 'RentCast'|'Google Sheets';
  sourceReference?:string;
  coordinates?:{latitude:number;longitude:number};
  address: string;
  fetchedAt: string;
  facts: PropertyFact[];
  rent: { monthly: number; low: number | null; high: number | null; perUnit: boolean; comparableCount: number } | null;
  warnings: string[];
}
export function isCompletePropertyAddress(address: string): boolean {
  const value = address.trim();
  return value.length <= 240 && /^\d[\w-]*\s+\S/.test(value) && (value.split(',').filter(part => part.trim()).length >= 3 || /\b\d{5}(?:-\d{4})?\s*$/.test(value));
}
export function canAutofillRent(current: string, previousAutomatic: string | null): boolean {
  return current.trim() === '' || current === previousAutomatic;
}
