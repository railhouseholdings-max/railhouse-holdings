import type { DealInputs } from '../../domain/models.ts';
import type { calculateDeal } from './deal.ts';
import { STRENGTH_RULES } from './deal-strength.ts';

/** Highest whole-dollar price meeting Good's recovery and value thresholds. */
export function targetPurchasePrice(input: DealInputs, result: ReturnType<typeof calculateDeal>): number | null {
  if (input.arv <= 0 || input.monthlyRent <= 0 || result.monthlyCashFlow < 0 || result.netProjectRecovery <= 0) return null;
  const otherProjectCosts = result.totalProjectCost - input.purchasePrice;
  const maximumProjectCost = Math.min(input.arv, result.netProjectRecovery / (STRENGTH_RULES.recoveryTarget / 100));
  const target = Math.min(1_000_000_000, Math.floor(maximumProjectCost - otherProjectCosts));
  if (target < 0 || target + result.purchaseClosingCosts < 0 || target + otherProjectCosts <= 0) return null;
  return target;
}
