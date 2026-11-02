export interface RentalTaxMetadata {
  assessmentYear: number;
  payableYear: number;
  sourceUrl: string;
  workbookUrl: string;
  workbookName: string;
  sha256: string;
}
export interface RentalTaxParcel {
  parcelId: string;
  address: string;
  zip: string;
  neighborhood: string;
  neighborhoodName: string;
  grm: number | null;
  assessedAsRental: boolean | null;
  propertyClass: string;
  baseRentAssessment: number | null;
  incomeCap2: number | null;
  incomeCap3: number | null;
  otherCap3: number | null;
  lookupRow: number;
}
export type RentalTaxMatch = { status: 'found'; parcel: RentalTaxParcel; metadata: RentalTaxMetadata }
  | { status: 'missing' | 'ambiguous' | 'conflict' | 'unavailable'; message: string };
