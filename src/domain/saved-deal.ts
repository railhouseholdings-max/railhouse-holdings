import type { ClosingAdjustments } from './closing.ts';
import type { PurchaseAdjustments } from './purchase.ts';
import type { DealInputs } from './models.ts';
import type { RentalTaxMatch } from './property-tax.ts';
export interface DealTaxAssumptions { parcelId: string; payableYear: number; annualOverride: number | null }
export interface SavedDealDetails {
  revision?: number;
  closingAdjustments?: ClosingAdjustments;
  purchaseAdjustments?: PurchaseAdjustments;
  taxAssumptions?: DealTaxAssumptions;
  taxEvidence?: RentalTaxMatch | null;
}
export interface SaveDealRequest {
  id: string | null;
  expectedRevision: number | null;
  address: string;
  status: 'Reviewing' | 'Researching';
  inputs: DealInputs;
  closingAdjustments: ClosingAdjustments;
  purchaseAdjustments: PurchaseAdjustments;
  taxAssumptions: DealTaxAssumptions;
}
