import { CLOSING_PROFILE } from "@/lib/calculations/closing";
import type { estimateClosingCosts } from "@/lib/calculations/closing";
import { money } from "@/lib/format";
import { DetailRows } from "./ui";
import { ExplainedValue } from "./calculation-help";

type Estimate = ReturnType<typeof estimateClosingCosts>;
export function ClosingCostEstimate({ estimate }: { estimate: Estimate | null }) {
  const p = CLOSING_PROFILE;
  const explained = (label: string, explanation: string) => <ExplainedValue label={label} explanation={<p>{explanation}</p>} />;
  const baseline = (label: string) => explained(label, "Fixed observed fee from your signed June 2026 closing package. It is a read-only planning baseline, not a guaranteed charge for a different lender, property, provider, or state. This fee is not multiplied by loan size.");
  return <div className="closing-estimate">
    <div className="section-heading"><h3>Automatic closing estimate</h3><span className="badge">Read-only</span></div>
    <p className="note">Based on your June 2026 closing. Flat fees stay fixed. Origination follows the loan amount; prepaids and escrow follow the funding date, taxes, and insurance. Title insurance is quote-dependent. These are estimates, not a new lender quote.</p>
    <div className="closing-totals"><div><small>{explained("Total closing costs", "Sum of all itemized loan and title charges, recording, annual prepaid premiums, prepaid interest, and initial escrow, including the signed aggregate adjustment. Includes fees paid before closing; credits are shown separately.")}</small><strong>{estimate ? money(estimate.grossClosingCosts, true) : "—"}</strong></div><div><small>{explained("Paid before closing", "Sum of the appraisal, AMC, and annual flood premium when marked paid beforehand. These costs remain in total investment costs and are not deducted from the closing wire again.")}</small><strong>{estimate ? money(estimate.paidBeforeClosing, true) : "—"}</strong></div><div><small>{explained("Deducted at closing", "Total closing costs minus the amounts paid before closing. This is the cost deducted from loan proceeds before credits and existing-debt payoff.")}</small><strong>{estimate ? money(estimate.atClosingCosts, true) : "—"}</strong></div><div><small>{explained("Cash to borrower", "Gross refinance loan − costs deducted at closing + broker/lender credits − existing debt payoff. A negative result is cash you must bring to closing. Fees paid beforehand remain part of investment costs.")}</small><strong>{estimate ? money(estimate.cashToBorrower, true) : "—"}</strong></div></div>
    {!estimate && <p className="note">Enter ARV, LTV, rate, funding date, annual taxes, and homeowners insurance to see the complete estimate.</p>}
    {estimate?.titleQuoteNeeded && <p className="note title-quote-note">Title premium is unconfirmed: this total includes the source’s $195 reference. Enter a title-policy quote under lender-specific adjustments for the current coverage amount.</p>}
    <DetailRows rows={[
      [explained("Appraisal + AMC baseline", "$500 appraisal + $175 appraisal-management-company fee = $675. Both are fixed planning baselines from the document and were paid before closing. The payment timing can be changed under lender-specific adjustments."), money(p.appraisal + p.appraisalAmc)],
      [explained("Origination rate", "Observed origination fee $1,981.88 ÷ source loan $113,250 ≈ 1.75%. This agrees with the spreadsheet. The app uses 1.75% × each deal’s refinance loan and rounds to cents. It is a planning assumption, not a new lender commitment."), `${p.originationPercent}% of loan`],
    ]} />
    <details className="closing-items"><summary>Loan & title charges</summary>
      {estimate ? <ItemRows estimate={estimate} category="loan" /> : <DetailRows rows={[
        [explained("Origination", "Loan amount × 1.75%, rounded to cents. The rate is inferred from the source origination fee and matches the spreadsheet."), `${p.originationPercent}% of refinance loan`], [baseline("Appraisal + AMC"), money(p.appraisal + p.appraisalAmc)],
        [baseline("Underwriting"), money(p.underwriting)], [baseline("Credit report"), money(p.creditReport)], [explained("Lender’s title policy · quote-dependent", "The source paid $195 on a $113,250 loan. Actual pricing depends on insured coverage, insurer rate schedule, policy, and discounts. This is an unconfirmed reference, not a universal fixed fee. Enter a confirmed quote under lender-specific adjustments."), `${money(p.lendersTitlePolicy)} reference`],
        [baseline("ALTA 8.1 + ALTA 9 endorsements"), money(p.environmentalEndorsement + p.restrictionsEndorsement)], [baseline("Settlement / closing agent"), money(p.settlement)],
        [baseline("Notary"), money(p.notary)], [baseline("Courier"), money(p.courier)], [baseline("Closing protection letter"), money(p.closingProtectionLetter)],
        [baseline("Title enforcement fund"), money(p.titleEnforcement)],
      ]} />}
    </details>
    <details className="closing-items"><summary>Recording, premiums & escrow</summary>
      {estimate ? <>{(["government", "prepaid", "escrow"] as const).map(category => <ItemRows key={category} estimate={estimate} category={category} />)}<p className="note">Daily interest: {money(estimate.dailyInterest, true)} × {estimate.interestDays} days. Escrow uses monthly amounts rounded to cents, matching the closing document.</p></> : <DetailRows rows={[
        [baseline("Mortgage recording"), money(p.recording)], [explained("Prepaid homeowners premium", "One full year of the annual homeowners premium entered in the rental section. It is separate from the escrow deposit."), "12 months"], [explained("Prepaid flood premium, if needed", "One full year of the entered flood premium; zero if flood coverage is not modeled."), "12 months"],
        [explained("Homeowners escrow", "Annual homeowners premium ÷ 12, rounded to cents, × 8 months. Eight months is the source baseline."), `${p.homeownersEscrowMonths} months`], [explained("Property tax escrow", "Annual taxes ÷ 12, rounded to cents, × 4 months. Four months is the source baseline."), `${p.taxEscrowMonths} months`], [explained("Flood escrow, if needed", "Annual flood premium ÷ 12, rounded to cents, × 3 months. Zero when the annual premium is zero."), `${p.floodEscrowMonths} months`],
        [explained("Prepaid interest", "Loan × annual interest rate ÷ 100 ÷ 365, rounded to cents per day, × inclusive days from funding through month-end."), "Funding day through month-end"],
      ]} />}
    </details>
    <details className="closing-items"><summary>What is estimated vs. deal-specific?</summary><p className="note">The observed origination fee implies approximately 1.75%, matching your spreadsheet. Appraisal, underwriting, settlement, and other flat service fees retain their observed dollar baselines. Title insurance needs an insurer-specific quote or rate schedule; its $195 source premium is labeled an unconfirmed reference until a quote is supplied. The 8/4/3 escrow months are also baseline assumptions.</p><p className="note">Credits, aggregate escrow adjustments, debt payoffs, and additional quoted charges stay editable below. They default to zero rather than assuming the same concessions on every deal. The source’s lender-paid $339.75 compensation is not a borrower charge.</p><p className="note">The source loan has no mortgage insurance or balloon payment. Its early-payoff penalty can be as high as $5,663 during the first five years; this contingent future charge is not a closing deduction or a monthly expense.</p></details>
  </div>;
}
function ItemRows({ estimate, category }: { estimate: Estimate; category: Estimate["items"][number]["category"] }) {
  return <dl className="closing-line-items">{estimate.items.filter(item => item.category === category).map(item => <div key={item.id}><dt><ExplainedValue label={item.label} explanation={<p>{item.explanation}</p>} /><small>{item.basis}{item.timing === "beforeClosing" ? " · Paid before closing" : ""}</small></dt><dd>{money(item.amount, true)}</dd></div>)}</dl>;
}
