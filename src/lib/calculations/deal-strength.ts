import type { calculateDeal } from './deal.ts';

// Planning rules chosen for this dashboard, not market benchmarks or lender criteria.
export const STRENGTH_RULES = { neutralCashFlowMax: 50, excellentCashFlow: 250, recoveryTarget: 85, excellentRecovery: 100, excellentValueCreated: 20 } as const;
type StrengthInput = Pick<ReturnType<typeof calculateDeal>, 'totalProjectCost' | 'monthlyCashFlow' | 'recoveryPercent' | 'monthlyPrincipalAndInterest' | 'monthlyCapexReserve' | 'cashRemainingInDeal'> & { arv: number; monthlyRent: number };
export function assessDealStrength(input: StrengthInput) {
  const valueCreated = input.arv - input.totalProjectCost;
  const valueCreatedPercent = input.totalProjectCost > 0 ? valueCreated / input.totalProjectCost * 100 : null;
  const cashFlowStatus = input.monthlyCashFlow < 0 ? 'Negative' : input.monthlyCashFlow <= STRENGTH_RULES.neutralCashFlowMax ? 'Neutral' : 'Positive';
  const rateable = input.totalProjectCost > 0 && input.arv > 0 && input.monthlyRent > 0 && input.recoveryPercent !== null;
  let rating: 'Bad' | 'Moderate' | 'Good' | 'Excellent' | null = null;
  const concerns: string[] = [];
  if (input.monthlyCashFlow < 0) concerns.push('Cash flow is negative.');
  if (input.recoveryPercent !== null && input.recoveryPercent < STRENGTH_RULES.recoveryTarget) concerns.push('Cash recovery is below the 85% target.');
  if (valueCreated < 0) concerns.push('Projected value is below total project cost.');
  if (rateable) rating = input.monthlyCashFlow < 0 || valueCreated < 0 ? 'Bad'
    : input.recoveryPercent! < STRENGTH_RULES.recoveryTarget ? 'Moderate'
    : input.monthlyCashFlow >= STRENGTH_RULES.excellentCashFlow && input.recoveryPercent! >= STRENGTH_RULES.excellentRecovery && valueCreatedPercent! >= STRENGTH_RULES.excellentValueCreated ? 'Excellent' : 'Good';
  // NOI excludes capital replacements; debt service is principal + interest only.
  const monthlyNoi = input.monthlyCashFlow + input.monthlyPrincipalAndInterest + input.monthlyCapexReserve;
  const debtCoverage = input.monthlyPrincipalAndInterest > 0 ? monthlyNoi / input.monthlyPrincipalAndInterest : null;
  const cashOnCashPercent = input.cashRemainingInDeal > 0 ? input.monthlyCashFlow * 12 / input.cashRemainingInDeal * 100 : null;
  return { rating, concerns, cashFlowStatus, valueCreated, valueCreatedPercent, debtCoverage, cashOnCashPercent };
}

/** Visual position only. Values beyond a dial's range pin to the endpoint. */
export function gaugePosition(value: number | null, min: number, max: number): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, (value - min) / (max - min)));
}
