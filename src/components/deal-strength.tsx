"use client";

import { useId } from 'react';
import type { calculateDeal } from '@/lib/calculations/deal';
import { assessDealStrength, gaugePosition, STRENGTH_RULES } from '@/lib/calculations/deal-strength';
import { money, percent } from '@/lib/format';
import { ExplainedValue } from './calculation-help';

function point(position: number, radius: number) {
  const angle = Math.PI * (1 - position);
  return { x: 112 + radius * Math.cos(angle), y: 112 - radius * Math.sin(angle) };
}
function StrengthGauge({ label, value, display, min, max, low, high, target, targetLabel, status, explanation }: {
  label: string; value: number | null; display: string; min: number; max: number; low: string; high: string;
  target: number; targetLabel: string; status: string; explanation: string;
}) {
  const gradientId = useId();
  const position = gaugePosition(value, min, max);
  const needle = point(position ?? 0.5, 65);
  const mark = gaugePosition(target, min, max)!;
  const markStart = point(mark, 76), markEnd = point(mark, 100);
  return <div className="strength-gauge">
    <div className="strength-gauge-art">
      <svg viewBox="0 0 224 140" role="img" aria-label={`${label}: ${display}. ${status}. ${targetLabel}. Scale ${low} to ${high}.`}>
        <defs><linearGradient id={gradientId} x1="24" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#c4483c" /><stop offset=".5" stopColor="#dfc576" /><stop offset="1" stopColor="#39875a" /></linearGradient></defs>
        <path d="M24 112 A88 88 0 0 1 200 112" fill="none" stroke={`url(#${gradientId})`} strokeWidth="16" strokeLinecap="round" />
        <line x1={markStart.x} y1={markStart.y} x2={markEnd.x} y2={markEnd.y} stroke="#344637" strokeWidth="2" />
        {position !== null && <><line x1="112" y1="112" x2={needle.x} y2={needle.y} stroke="#233d30" strokeWidth="4" strokeLinecap="round" /><circle cx="112" cy="112" r="6" fill="#233d30" /></>}
        <text x="17" y="136" textAnchor="start">{low}</text><text x="207" y="136" textAnchor="end">{high}</text>
      </svg>
    </div>
    <div className="strength-gauge-copy"><h3><ExplainedValue label={label} explanation={<p>{explanation}</p>} /></h3><strong>{display}</strong><span className="gauge-status">{status}</span><small>{targetLabel}</small></div>
  </div>;
}

export function DealStrength({ result, arv, monthlyRent }: { result: ReturnType<typeof calculateDeal>; arv: number; monthlyRent: number }) {
  const strength = assessDealStrength({ ...result, arv, monthlyRent });
  const rules = STRENGTH_RULES;
  return <div className="deal-strength">
    <div className={`strength-rating ${(strength.rating ?? 'unrated').toLowerCase()}`}>
      <div><span className="eyebrow">OVERALL DEAL STRENGTH</span><strong>{strength.rating ?? 'Not rated'}</strong></div>
      <p>{!strength.rating ? 'Enter positive project cost, ARV, and rent to assess this deal.' : strength.rating === 'Excellent' ? 'All three factors meet the stronger planning targets.' : strength.rating === 'Good' ? 'Meets the 85% recovery target with nonnegative cash flow and value created.' : strength.concerns.join(' ')}</p>
    </div>
    <div className="strength-gauges">
      <StrengthGauge label="Monthly cash flow" value={result.monthlyCashFlow} display={money(result.monthlyCashFlow, true)} min={-500} max={500} low="−$500" high="+$500" target={0} targetLabel="Break-even: $0 / month" status={strength.cashFlowStatus}
        explanation="Monthly rent minus principal, interest, taxes, insurance, management, and the reserves you entered. Negative: below $0. Neutral: $0–$50/month. Positive: above $50/month. The dial runs from −$500 to +$500; larger values keep their actual label while the needle stays at the endpoint." />
      <StrengthGauge label="Cash recovery" value={result.recoveryPercent} display={percent(result.recoveryPercent)} min={0} max={120} low="0%" high="120%" target={rules.recoveryTarget} targetLabel="Target: 85% recovered" status={result.recoveryPercent === null ? 'N/A' : result.recoveryPercent >= rules.recoveryTarget ? 'Meets target' : 'Below target'}
        explanation="Net whole-project refinance recovery divided by total project cost × 100. Uses refinance proceeds after all closing costs and credits, before acquisition-debt payoff; this is not the closing wire or an annual return. Target: at least 85%. Zero project cost is N/A. Dial range: 0–120%; actual values can exceed it." />
      <StrengthGauge label="Value created" value={strength.valueCreatedPercent} display={percent(strength.valueCreatedPercent)} min={-20} max={40} low="−20%" high="40%" target={0} targetLabel="Break-even: ARV = project cost" status={strength.valueCreatedPercent === null ? 'N/A' : `${money(strength.valueCreated, true)} net value`}
        explanation="(ARV − total project cost) ÷ total project cost × 100. Project cost includes purchase, rehab, contingency, holding, and net purchase closing fees. This measures projected value above your all-in project cost, before refinance costs; it is not gross appreciation, an annual return, or proof that rehab alone caused the increase. Zero project cost is N/A. Dial range: −20% to +40%." />
    </div>
    <div className="strength-supporting">
      <div><ExplainedValue label="Debt coverage" explanation={<p>Net operating income ÷ principal and interest. NOI here is rent less entered operating expenses and vacancy/maintenance reserves, excluding CapEx. Below 1.00× means operations do not cover debt service before CapEx. This is a model check, not a lender qualification. No debt service: N/A.</p>} /><strong>{strength.debtCoverage === null ? 'N/A' : `${strength.debtCoverage.toFixed(2)}×`}</strong></div>
      <div><ExplainedValue label="Cash-on-cash return" explanation={<p>12 × monthly cash flow ÷ cash remaining in the deal × 100. Uses stabilized modeled cash flow and whole-project cash left after refinance. N/A when cash left is zero or negative; full capital recovery does not imply an infinite return.</p>} /><strong>{percent(strength.cashOnCashPercent)}</strong></div>
    </div>
    <details className="strength-rules"><summary>How the rating works</summary><p>Bad: negative cash flow, recovery below {rules.recoveryTarget}%, or negative value created. Good: all three meet those minimums. Excellent: at least ${rules.excellentCashFlow}/month cash flow, {rules.excellentRecovery}% recovery, and {rules.excellentValueCreated}% value created.</p><p>These are initial Railhouse planning rules, not market benchmarks. Neutral cash flow is $0–${rules.neutralCashFlowMax}/month. Dials show separate scales; the tick marks break-even or the recovery target. Debt coverage and cash-on-cash are context and do not change the rating. Results depend on your estimated ARV, rent, taxes, and reserves.</p></details>
  </div>;
}
