import type { DealInputs } from '../../domain/models.ts';
import type { RentalTaxMetadata, RentalTaxParcel } from '../../domain/property-tax.ts';
import { cents } from './closing.ts';

export type CountyRentalTaxEstimate = {
  status: 'ready' | 'missing';
  annualTaxes: number | null;
  assessedValue: number | null;
  message: string;
  warning: string | null;
  calculation: string;
};
export function roundAssessment(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid rental assessed value.');
  return Math.round((value + Number.EPSILON * value) / 100) * 100;
}
export function estimateCountyRentalTaxes(parcel: RentalTaxParcel | null, metadata: RentalTaxMetadata | null, monthlyRent: number | null, payableYear: number): CountyRentalTaxEstimate {
  const warning = parcel?.assessedAsRental === false ? 'The workbook snapshot marks this property as not assessed as a rental. This projected rental scenario does not change its official assessment.'
    : parcel && parcel.assessedAsRental === null ? 'Rental assessment status is missing in the workbook snapshot.' : null;
  const missing = (message: string): CountyRentalTaxEstimate => ({status:'missing',annualTaxes:null,assessedValue:null,message,warning,calculation:''});
  if (!parcel || !metadata) return missing('A county workbook match is required. Enter an address or parcel ID, or supply a manual annual-tax estimate.');
  if (metadata.assessmentYear !== 2026 || metadata.payableYear !== 2027 || payableYear !== 2027) return missing('The 0.88 factor is supported only for assessment 2026 / payable 2027. Enter a manual estimate for the selected year.');
  if (!parcel.neighborhood || parcel.grm === null || !Number.isFinite(parcel.grm) || parcel.grm <= 0) return missing('This workbook row has no usable neighborhood or monthly-rent GRM. Enter a manual annual-tax estimate.');
  if (!['510','511','512','520','521','522','530','531','532','540','541','542','550'].includes(parcel.propertyClass)) return missing(`Property class ${parcel.propertyClass || 'unknown'} is not supported by the ordinary residential rental adaptation. Enter a manual annual-tax estimate.`);
  const components = [parcel.baseRentAssessment,parcel.incomeCap2,parcel.incomeCap3,parcel.otherCap3];
  if (components.some(v => v === null || !Number.isFinite(v) || v < 0)) return missing('Workbook component values are incomplete. Enter a manual annual-tax estimate.');
  if (parcel.incomeCap3! > 0 || parcel.otherCap3! > 0) return missing('This parcel has separate 3%-cap value or land/improvements. The workbook uses (2%-cap value × 0.88 × 0.02) + (3%-cap value × 0.03). Projected rent cannot safely allocate these components; enter a manual total annual-tax estimate.');
  if (parcel.incomeCap2 !== parcel.baseRentAssessment) return missing('The workbook’s 2%-cap income value differs from rent × GRM, indicating excess land/improvements or another adjustment. A projected-rent adaptation is unsupported; enter a manual annual-tax estimate.');
  if (monthlyRent === null || !Number.isFinite(monthlyRent) || monthlyRent <= 0) return missing('Enter positive projected monthly market rent to estimate rental assessed value.');
  const assessedValue = roundAssessment(monthlyRent * parcel.grm);
  const annualTaxes = cents(assessedValue * 0.88 * 0.02);
  return {status:'ready',annualTaxes,assessedValue,warning,message:'County workbook simplified estimate — assessment 2026, payable 2027. Not an exact tax bill.',
    calculation:`ROUND(${monthlyRent} monthly projected rent × ${parcel.grm} monthly-rent GRM, nearest $100) = $${assessedValue}; $${assessedValue} × 0.88 × 0.02 = $${annualTaxes.toFixed(2)} / year.`};
}
export interface SelectedAnnualTaxes { annualTaxes: number | null; source: 'county' | 'override' | 'missing'; explanation: string }
export function selectAnnualTaxes(override: string, county: CountyRentalTaxEstimate): SelectedAnnualTaxes {
  if (override.trim() !== '') {
    const value = Number(override);
    if (!Number.isFinite(value) || value < 0) return {annualTaxes:null,source:'missing',explanation:'Enter a valid nonnegative annual-tax override, or clear it to use the county estimate.'};
    return {annualTaxes:cents(value),source:'override',explanation:`Manual annual-tax override: $${cents(value).toFixed(2)}. This takes precedence over the county estimate.`};
  }
  return county.status === 'ready' ? {annualTaxes:county.annualTaxes,source:'county',explanation:county.calculation}
    : {annualTaxes:null,source:'missing',explanation:county.message};
}
export function withSelectedPropertyTaxes(input: DealInputs, selected: SelectedAnnualTaxes): DealInputs {
  if (selected.annualTaxes === null) throw new RangeError('Annual tax estimate missing. Match the county workbook or enter a manual annual-tax estimate.');
  return {...input,annualPropertyTaxes:selected.annualTaxes};
}
