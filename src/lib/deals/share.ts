import type { DealInputs } from '../../domain/models.ts';
import type { calculateDeal } from '../calculations/deal.ts';
import { assessDealStrength } from '../calculations/deal-strength.ts';
import { targetPurchasePrice } from '../calculations/target-purchase-price.ts';
import { money, percent } from '../format.ts';

export function isMobileShareAvailable(device: { userAgent: string; maxTouchPoints: number; userAgentData?: { mobile: boolean } }, secure: boolean, shareSupported: boolean): boolean {
  const mobile = device.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(device.userAgent)
    || (/Macintosh/i.test(device.userAgent) && device.maxTouchPoints > 1);
  return secure && shareSupported && mobile;
}

export function formatDealShare(address: string, input: DealInputs, result: ReturnType<typeof calculateDeal>, taxExplanation: string): string {
  const strength = assessDealStrength({...result, arv:input.arv, monthlyRent:input.monthlyRent});
  const target = targetPurchasePrice(input, result);
  const dollars = (label: string, value: number) => `${label}: ${money(value, true)}`;
  return [
    'RAILHOUSE HOLDINGS — DEAL ESTIMATE',
    address.trim() || 'Property address not provided',
    '', 'DEAL METRICS',
    `Rating: ${strength.rating ?? 'Not rated'}`,
    dollars('Monthly cash flow', result.monthlyCashFlow),
    `Capital recovered: ${percent(result.recoveryPercent)}`,
    dollars('Value created', strength.valueCreated),
    `Value created / project cost: ${percent(strength.valueCreatedPercent)}`,
    dollars('Cash left in deal', result.cashRemainingInDeal),
    `Debt coverage: ${strength.debtCoverage === null ? 'N/A' : strength.debtCoverage.toFixed(2) + '×'}`,
    `Cash-on-cash return: ${percent(strength.cashOnCashPercent)}`,
    `Target purchase price (Good): ${target === null ? 'No price-only solution' : money(target, true)}`,
    '', 'PRIMARY INPUTS',
    dollars('Purchase price', input.purchasePrice), dollars('Rehab budget', input.rehabBudget),
    dollars('After repair value (ARV)', input.arv), dollars('Expected monthly rent', input.monthlyRent),
    '', 'PROJECT COST ESTIMATES',
    dollars('Construction contingency', input.unexpectedConstructionCosts), dollars('Holding costs', input.holdingCosts),
    dollars('Net purchase closing costs', result.purchaseClosingCosts),
    ...(result.purchase ? [dollars('Additional purchase costs', result.purchase.additionalCosts), dollars('Purchase credits', result.purchase.buyerCredits)] : []),
    dollars('Total project cost', result.totalProjectCost),
    '', 'REFINANCE ESTIMATES',
    `Refinance LTV: ${input.refinanceLtv}%`, `Interest rate: ${input.interestRate}%`,
    `Loan term: ${input.loanTermYears} years`, `Funding date: ${input.closingDate}`,
    dollars('Refinance loan', result.refinanceLoanAmount), dollars('Total refinance closing costs', result.refinanceCosts),
    ...(result.closing ? result.closing.items.map(item => dollars(`${item.label} (${item.timing === 'beforeClosing' ? 'paid before closing' : 'at closing'})`, item.amount)) : []),
    ...(result.closing ? [dollars('Broker credit', result.closing.brokerCredit), dollars('Lender credit', result.closing.lenderCredit), dollars('Existing loan payoff', result.closing.existingLoanPayoff)] : []),
    dollars('Cash to borrower at closing', result.cashOutProceeds), dollars('Net whole-project recovery', result.netProjectRecovery),
    '', 'OPERATING ASSUMPTIONS',
    dollars('Annual property taxes', input.annualPropertyTaxes), `Tax basis: ${taxExplanation}`,
    dollars('Annual homeowners insurance', input.annualInsurance),
    `Management: ${input.managementPercent}%`, `Vacancy reserve: ${input.vacancyPercent}%`,
    `Maintenance reserve: ${input.maintenancePercent}%`, dollars('Monthly CapEx reserve', input.monthlyCapexReserve),
    '', 'MONTHLY INCOME & EXPENSES',
    dollars('Rent', input.monthlyRent), dollars('Principal & interest', result.monthlyPrincipalAndInterest),
    dollars('Property taxes', result.monthlyTaxes), dollars('Homeowners insurance', result.monthlyInsurance),
    dollars('Flood insurance', result.monthlyFloodInsurance), dollars('Management', result.managementExpense),
    dollars('Vacancy reserve', result.vacancyReserve), dollars('Maintenance reserve', result.maintenanceReserve),
    dollars('CapEx reserve', result.monthlyCapexReserve), dollars('Total monthly costs', result.totalMonthlyCost),
    dollars('Net monthly cash flow', result.monthlyCashFlow),
    '', 'Planning estimates based on the current inputs; actual costs and results may differ. Target price holds all other assumptions fixed. Current county taxes are historical reference only.',
  ].join('\n');
}
