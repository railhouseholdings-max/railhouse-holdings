"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SaveDealRequest } from "@/domain/saved-deal";
import type { DealAnalysis, DealInputs } from "@/domain/models";
import { calculateDeal } from "@/lib/calculations/deal";
import { money, percent } from "@/lib/format";
import { DetailRows } from "./ui";
import { ShareDealButton } from "./share-deal-button";
import { PurchasePriceExplorer } from "./purchase-price-explorer";
import { targetPurchasePrice } from "@/lib/calculations/target-purchase-price";
import { DealStrength, DealStrengthDetails } from "./deal-strength";
import { withSelectedPropertyTaxes } from "@/lib/calculations/tax-estimate";
import { PropertyTaxFields, usePropertyTaxModel } from "./property-tax-estimate";
import { PropertyLookupDetails, usePropertyLookup } from "./property-lookup";
import { emptyPropertyDetails } from "@/lib/deals/property-details";
import { canAutofillRent } from "@/domain/property-lookup";
import { AddressAutocomplete } from "./address-autocomplete";
import { ClosingCostEstimate } from "./closing-cost-estimate";
import { PurchaseCostEstimate } from "./purchase-cost-estimate";
import type { PurchaseAdjustments } from "@/domain/purchase";
import { DEFAULT_PURCHASE_ADJUSTMENTS, estimatePurchaseCosts, PURCHASE_STATEMENT_REFERENCE } from "@/lib/calculations/purchase";
import { ExplainedValue } from "./calculation-help";
import { dealExplanations } from "@/lib/calculations/deal-explanations";
import type { ClosingAdjustments } from "@/domain/closing";
import { closingLoanFromDeal, DEFAULT_CLOSING_ADJUSTMENTS, estimateClosingCosts } from "@/lib/calculations/closing";

import { initialDealFields, updateEstimatedFields, type DealFormValues } from "@/lib/deals/defaults";

type Field = { key: keyof DealInputs; label: string; unit: string; hint?: string; max?: number; disabled?: boolean; placeholder?: string; required?: boolean };
const projectFields: Field[] = [
  { key: "purchasePrice", label: "Purchase price", hint: "Your planned offer or acquisition price. Adjusting it changes project cost, capital recovery, and value created.", unit: "$" },
  { key: "rehabBudget", label: "Rehab budget", hint: "Your estimated total renovation cost. Include planned additions and improvements.", unit: "$" },
  { key: "unexpectedConstructionCosts", label: "Construction contingency", unit: "$", hint: "Estimated at 4% of rehab; editable. Based on the spreadsheet’s $2,000 / $50,000 allowance." },
  { key: "holdingCosts", label: "Total holding costs", unit: "$", hint: "$1,500 spreadsheet allowance for utilities and other project costs; editable." },
  { key: "arv", label: "After repair value (ARV)", hint: "Your estimate of the finished property value after renovations. The refinance loan is sized from this amount.", unit: "$" },
];
const loanFields: Field[] = [
  { key: "refinanceLtv", label: "Refinance LTV", hint: "The refinance loan as a percentage of after repair value.", unit: "%", max: 100 },
  { key: "interestRate", label: "Annual interest rate", hint: "Expected annual refinance interest rate, entered as a percentage.", unit: "%", max: 100 },
  { key: "loanTermYears", label: "Loan term", hint: "The refinance amortization term in years.", unit: "years", max: 50 },
];
const feeFields: Field[] = [
  { key: "closingCosts", label: "Fixed refinance closing costs", unit: "$", hint: "Exclude appraisal, origination, and escrow entered below." },
  { key: "appraisalFee", label: "Bank appraisal fee", unit: "$" },
  { key: "originationPercent", label: "Origination rate", unit: "%", max: 100, hint: "Applied to the refinance loan amount." },
  { key: "closingDate", label: "Refinance funding date", unit: "date", hint: "Defaults to 90 days from today. Use disbursement date; interest runs through month-end." },
  { key: "taxEscrow", label: "Tax escrow deposit", unit: "$", hint: "Upfront deposit, separate from annual taxes." },
  { key: "insuranceEscrow", label: "Insurance escrow deposit", unit: "$", hint: "Upfront deposit, separate from annual insurance." },
];
const operatingFields: Field[] = [
  { key: "monthlyRent", label: "Expected monthly rent", hint: "Expected rent for the whole property each month. RentCast can fill an estimate; review it and edit as needed.", unit: "$" },
  { key: "annualPropertyTaxes", label: "Property taxes / year", unit: "$" },
  { key: "annualInsurance", label: "Homeowners insurance / year", unit: "$", hint: "$970 closing-document estimate. Replace with a quote for this property." },
  { key: "managementPercent", label: "Property management", hint: "Percentage of monthly rent reserved for property management.", unit: "%", max: 100 },
  { key: "monthlyCapexReserve", label: "CapEx reserve / month", unit: "$", hint: "Flat monthly allowance for capital replacements." },
];
const extraFields: Field[] = [
  { key: "vacancyPercent", label: "Vacancy reserve", hint: "Percentage of rent reserved for vacancy. Starts at 0%; avoid double-counting other reserves.", unit: "%", max: 100 },
  { key: "maintenancePercent", label: "Maintenance reserve", hint: "Percentage of rent reserved for routine maintenance. Starts at 0%; avoid double-counting other reserves.", unit: "%", max: 100 },
];
type FormValues = DealFormValues;

function InputFields({ definitions, values, onChange, trailing }: {
  trailing?: ReactNode;
  definitions: Field[];
  values: FormValues;
  onChange: (key: keyof DealInputs, value: string) => void;
}) {
  return <div className="input-grid">{definitions.map(field => (
    <label className="field" key={field.key} htmlFor={field.key}>
      <span>{field.hint ? <ExplainedValue label={field.label} explanation={<p>{field.hint}</p>} /> : field.label}</span>
      <div className={`input-wrap ${field.unit === "date" ? "date-input" : ""}`}>
        <input id={field.key} name={field.key} type={field.unit === "date" ? "date" : "number"}
          inputMode={field.unit === "date" ? undefined : "decimal"}
          min={field.unit === "date" ? "1900-01-01" : field.key === "loanTermYears" ? 1 : 0}
          max={field.unit === "date" ? "9999-12-31" : field.max ?? 1000000000}
          step={field.key === "loanTermYears" ? 1 : "any"} required={field.required ?? true} disabled={field.disabled}
          value={values[field.key]} onChange={event => onChange(field.key, event.target.value)}
          placeholder={field.placeholder ?? "Enter amount"} aria-describedby={field.hint ? `${field.key}-hint` : undefined} />
        {field.unit !== "date" && <span>{field.unit}</span>}
      </div>
      {field.hint && <small id={`${field.key}-hint`} className="sr-only">{field.hint}</small>}
    </label>
  ))}{trailing}</div>;
}


export function DealCalculator({ initialDeal, asOfDate, cloudEnabled = false }: { initialDeal?: DealAnalysis | null; asOfDate: string; cloudEnabled?: boolean }) {
  const router = useRouter();
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const inputsHeading = useRef<HTMLHeadingElement>(null);
  const [calculationRequest, setCalculationRequest] = useState(0);
  useEffect(() => {
    if (calculationRequest === 0) return;
    const heading = resultsHeading.current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [calculationRequest]);
  const [fields, setFields] = useState(() => initialDealFields(asOfDate, initialDeal?.inputs));
  const [propertyDraft, setPropertyDraft] = useState(emptyPropertyDetails);
  const automaticRent = useRef<string | null>(null);
  const manualRent = useRef(Boolean(initialDeal));
  const automaticContingency = useRef(!initialDeal);
  const [address, setAddress] = useState(initialDeal?.address ?? "");
  const taxModel = usePropertyTaxModel(address,fields.monthlyRent,{assumptions:initialDeal?.taxAssumptions,evidence:initialDeal?.taxEvidence});
  const [savedRecord,setSavedRecord] = useState<{id:string;revision:number} | null>(initialDeal?.revision ? {id:initialDeal.id,revision:initialDeal.revision} : null);
  const [saving,setSaving] = useState(false);
  const [saveMessage,setSaveMessage] = useState("");
  const populateRent = useCallback((value: string) => {
    if (manualRent.current) return;
    const previousAutomatic = automaticRent.current;
    automaticRent.current = value;
    setFields(previous => canAutofillRent(previous.monthlyRent, previousAutomatic) ? { ...previous, monthlyRent: value } : previous);
    setSaveMessage("");
  }, []);
  const propertyLookup = usePropertyLookup(populateRent);
  const resetEstimates = () => {setPropertyDraft(emptyPropertyDetails()); propertyLookup.invalidate(); automaticRent.current = null; manualRent.current = false; taxModel.reset(); automaticContingency.current = true; setSavedRecord(null); setSaveMessage("");};
  // A new address invalidates query-scoped lookup data automatically. Preserve the
  // explicitly selected tax year and manual override until the user clears them.
  const changeAddress = (next: string) => {
    if (next !== address) {
      setPropertyDraft(emptyPropertyDetails());
      propertyLookup.invalidate();
      const previousAutomatic = automaticRent.current;
      if (previousAutomatic !== null) setFields(previous => previous.monthlyRent === previousAutomatic ? { ...previous, monthlyRent: "" } : previous);
      automaticRent.current = null;
    }
    setAddress(next); setShowResults(false);
  };
  const [showResults, setShowResults] = useState(Boolean(initialDeal));
  const [isEdited, setIsEdited] = useState(false);
  const [closingAdjustments, setClosingAdjustments] = useState<ClosingAdjustments>(() => ({ ...(initialDeal?.closingAdjustments ?? DEFAULT_CLOSING_ADJUSTMENTS) }));
  const [referenceLoaded, setReferenceLoaded] = useState(false);
  const [purchaseAdjustments, setPurchaseAdjustments] = useState<PurchaseAdjustments>(() => ({ ...(initialDeal?.purchaseAdjustments ?? DEFAULT_PURCHASE_ADJUSTMENTS) }));
  const [purchaseReferenceLoaded, setPurchaseReferenceLoaded] = useState(false);
  let purchasePreview: ReturnType<typeof estimatePurchaseCosts> | null = null;
  let purchaseError = "";
  try { purchasePreview = estimatePurchaseCosts(Number(fields.purchasePrice || 0), purchaseAdjustments); }
  catch (error) { purchaseError = error instanceof Error ? error.message : "Check the purchase amounts."; }
  const estimatedAnnualTaxes = taxModel.selected.annualTaxes;
  let closingPreview: ReturnType<typeof estimateClosingCosts> | null = null;
  let closingPreviewError = "";
  const closingKeys = ["arv", "refinanceLtv", "interestRate", "annualInsurance", "closingDate"] as const;
  if (estimatedAnnualTaxes !== null && closingKeys.every(key => fields[key].trim() !== "")) {
    try {
      closingPreview = estimateClosingCosts(closingLoanFromDeal({
        arv: Number(fields.arv), refinanceLtv: Number(fields.refinanceLtv),
        interestRate: Number(fields.interestRate), annualPropertyTaxes: estimatedAnnualTaxes ?? NaN,
        annualInsurance: Number(fields.annualInsurance), closingDate: fields.closingDate,
      }), closingAdjustments);
    } catch (error) { closingPreviewError = error instanceof Error ? error.message : "Check the closing inputs."; }
  }
  const updateAdjustment = (key: keyof ClosingAdjustments, value: number | boolean | null) => {
    setClosingAdjustments(previous => ({ ...previous, [key]: value }));
    setShowResults(false); setIsEdited(true);
  };
  let calculatedInput: DealInputs | null = null;
  let result: ReturnType<typeof calculateDeal> | null = null;
  let calculationError = "";
  let explanations: Record<string, string> = {};
  if (showResults) {
    try {
      const enteredInput = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key,
        key === "closingDate" ? value : value.trim() === "" ? NaN : Number(value),
      ])) as unknown as DealInputs;
      const input = withSelectedPropertyTaxes(enteredInput, taxModel.selected);
      calculatedInput = input;
      result = calculateDeal(input, closingAdjustments, purchaseAdjustments);
      explanations = { ...dealExplanations(input, result), monthlyTaxes: `${taxModel.selected.explanation} Annual taxes ${money(input.annualPropertyTaxes, true)} ÷ 12, rounded to cents = ${money(result.monthlyTaxes, true)}/month. Current county taxes are historical reference only.` };
    } catch (error) {
      calculationError = error instanceof Error ? error.message : "Check the entered values.";
    }
  }
  const update = (key: keyof DealInputs, value: string) => {
    if (key === "monthlyRent") { automaticRent.current = null; manualRent.current = value.trim() !== ""; }
    if (key === "unexpectedConstructionCosts") automaticContingency.current = false;
    setFields(previous => updateEstimatedFields(previous, key, value, { contingency: automaticContingency.current }));
    if (key !== "annualPropertyTaxes" && key !== "purchasePrice") setShowResults(false);
    setSaveMessage("");
    setIsEdited(true);
  };
  const saveDeal = async () => {
    if (!calculatedInput || !result || saving) return;
    const payload: SaveDealRequest = {id:savedRecord?.id ?? null,expectedRevision:savedRecord?.revision ?? null,address,status:initialDeal?.status ?? "Reviewing",inputs:calculatedInput,closingAdjustments,purchaseAdjustments,
      taxAssumptions:{parcelId:taxModel.parcelId,payableYear:Number(taxModel.payableYear),annualOverride:taxModel.override.trim() === "" ? null : Number(taxModel.override)}};
    setSaving(true); setSaveMessage("");
    try {
      const response=await fetch("/api/deals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json() as {id?:string;revision?:number;error?:string};
      if (!response.ok || !data.id || !data.revision) throw new Error(data.error ?? "Could not save this deal.");
      setSavedRecord({id:data.id,revision:data.revision});
      router.refresh();
      setSaveMessage(`Saved revision ${data.revision}. New edits require another save. Open this deal from your Dashboard to reload it.`);
    } catch(error) {setSaveMessage(error instanceof Error ? error.message : "Save failed. Your inputs remain in this tab.");}
    finally {setSaving(false);}
  };
  const targetPrice = result && calculatedInput ? targetPurchasePrice(calculatedInput, result) : null;
  const explained = (label: string, key: string) => <ExplainedValue label={label} explanation={<p>{explanations[key]}</p>} />;
  const renderFields = (definitions: Field[], trailing?: ReactNode) => <InputFields definitions={definitions} values={fields} onChange={update} trailing={trailing} />;

  return <>
    {taxModel.warning && <p className="notice tax-warning" role="alert">{taxModel.warning}</p>}
    {referenceLoaded && <p className="notice">{isEdited ? "Editing the closing-document reference. Calculated amounts reflect your current inputs. " : ""}Closing-document loan terms loaded: $113,250 loan, 6.25%, 30 years, funding June 8, 2026. Project costs and rent are still your inputs. The source closing reported $105,833.63 cash to borrower. This analysis uses the selected county rental estimate or manual override; closing totals may differ from the historical reference.</p>}
    {purchaseReferenceLoaded && <p className="notice">Purchase statement reference loaded: December 19, 2025 · $80,000 purchase, $50,000 estimated rehab, and $314 purchase closing fees. Source total: $130,314. Current results use any edits you make; other assumptions remain your inputs.</p>}
    <form onSubmit={event => { event.preventDefault(); setShowResults(true); setCalculationRequest(request => request + 1); }} className="calculator-form calculator-sections">
      {showResults && <section className="panel results deal-metrics-section" aria-labelledby="deal-metrics-heading">
          <p className="eyebrow section-kicker">01 · DEAL METRICS</p><h2 id="deal-metrics-heading" ref={resultsHeading} tabIndex={-1} className="results-heading">{result ? "Deal metrics & rating" : "A clear picture, before you buy."}</h2>
          <p className="muted result-description">{result ? address || "Your analysis" : "Enter the four project numbers, then calculate to see cash flow and capital recovery."}</p>
          {calculationError && <p role="alert" className="error">{calculationError}</p>}
          {result && calculatedInput && <ShareDealButton address={address} input={calculatedInput} result={result} taxExplanation={taxModel.selected.explanation} property={propertyLookup.state?.address === address.trim() ? propertyLookup.state.data : undefined} propertyDraft={propertyDraft} />}
          <div className="deal-metrics-workspace">
            <PurchasePriceExplorer price={fields.purchasePrice} arv={Number(fields.arv)} target={targetPrice} onChange={value => update("purchasePrice", value)} />
            {result && <DealStrength result={result} arv={Number(fields.arv)} monthlyRent={Number(fields.monthlyRent)} />}
          </div>
      </section>}
        <section className="panel primary-estimates" aria-labelledby="primary-estimates-heading">
          <p className="eyebrow input-category section-kicker">{showResults ? "02" : "01"} · YOUR INPUTS</p>
          <div className="step-heading"><div><h2 id="primary-estimates-heading" ref={inputsHeading} tabIndex={-1}>Your primary estimates</h2></div></div>
          <AddressAutocomplete value={address} onChange={changeAddress} onCommit={next => { void propertyLookup.commit(next); }} />
          <PropertyLookupDetails state={propertyLookup.state?.address === address.trim() ? propertyLookup.state : null} currentRent={fields.monthlyRent}
            draft={propertyDraft} onChange={setPropertyDraft} onReset={() => setPropertyDraft(emptyPropertyDetails())}
            onRetry={() => { void propertyLookup.commit(address, true); }}
            onUseRent={value => { manualRent.current = false; automaticRent.current = value; setFields(previous => ({ ...previous, monthlyRent: value })); setShowResults(false); setIsEdited(true); setSaveMessage(""); }} />
          {renderFields([...projectFields.filter(field => ["purchasePrice", "rehabBudget", "arv"].includes(field.key)),operatingFields[0]])}
          <PropertyTaxFields model={taxModel} projectedRent={fields.monthlyRent} />
        <div className="form-actions primary-actions"><button type="submit" className="button">Calculate deal <span aria-hidden="true">→</span></button><button type="button" className="button secondary" onClick={() => {
          resetEstimates(); setFields(initialDealFields(asOfDate)); setAddress(""); setIsEdited(false); setShowResults(false); setClosingAdjustments({ ...DEFAULT_CLOSING_ADJUSTMENTS }); setReferenceLoaded(false);
        setPurchaseAdjustments({ ...DEFAULT_PURCHASE_ADJUSTMENTS }); setPurchaseReferenceLoaded(false);
        }}>Clear inputs</button></div>
        </section>
      <section className="panel derived-section" aria-labelledby="derived-values-heading">
        <header className="calculator-section-heading">
          <p className="eyebrow section-kicker">{showResults ? "03" : "02"} · ESTIMATES & BREAKDOWN</p>
          <h2 id="derived-values-heading">Derived values & assumptions</h2>
          <p>Estimated costs, financing assumptions, and the detailed results calculated from your inputs.</p>
        </header>
        <div className="derived-values-grid">
        <div className="estimated-costs" role="group" aria-labelledby="estimated-costs-heading">
          <header className="estimated-costs-heading">
            <p className="eyebrow">ESTIMATED FOR YOU</p>
            <h3 id="estimated-costs-heading">Costs & assumptions</h3>
            <p>Prefilled from your project inputs and reference documents. Review and adjust as needed.</p>
          </header>
        <section className="panel" aria-labelledby="inferred-costs-heading">
          <div className="step-heading"><span>A</span><div><h3 id="inferred-costs-heading">Upfront project costs</h3><p>One-time costs added to your purchase and rehab budget.</p></div></div>
          {renderFields(projectFields.filter(field => ["unexpectedConstructionCosts", "holdingCosts"].includes(field.key)))}
          <PurchaseCostEstimate estimate={purchasePreview} adjustments={purchaseAdjustments}
            onChange={(key, value) => { setPurchaseAdjustments(previous => ({ ...previous, [key]: value })); setShowResults(false); setIsEdited(true); }}
            onLoadReference={() => {
              resetEstimates();
              setFields(previous => ({ ...previous, purchasePrice: String(PURCHASE_STATEMENT_REFERENCE.purchasePrice), rehabBudget: String(PURCHASE_STATEMENT_REFERENCE.rehabBudget), unexpectedConstructionCosts: "2000", annualPropertyTaxes: "" }));
              setPurchaseAdjustments({ ...DEFAULT_PURCHASE_ADJUSTMENTS });
              setAddress("2221 Eby Avenue, Fort Wayne, IN 46802");
              setPurchaseReferenceLoaded(true); setShowResults(false);
            }} />
          {purchaseError && <p role="alert" className="error">{purchaseError}</p>}
        </section>
        <section className="panel">
          <div className="step-heading"><span>B</span><div><h3>Ongoing ownership costs</h3><p>Insurance, management, and reserves used to estimate monthly cash flow.</p></div></div>
          {renderFields(operatingFields.filter(field => !["monthlyRent", "annualPropertyTaxes"].includes(field.key)))}
          <label className="field flood-field"><span><ExplainedValue label="Flood insurance / year" explanation={<p>Enter $0 if not required. Updates the annual premium, monthly expense, and three-month escrow.</p>} /></span><div className="input-wrap"><input type="number" inputMode="decimal" min={0} max={1000000000} step="0.01" value={closingAdjustments.annualFloodInsurance} onChange={event => updateAdjustment("annualFloodInsurance", Number(event.target.value))} /><span>$</span></div></label>
          <details className="extra-reserves"><summary>Additional reserves <span>Optional · beyond the spreadsheet</span></summary>{renderFields(extraFields)}</details>
        </section>
        <section className="panel">
          <div className="step-heading"><span>C</span><div><h3>Refinance costs & terms</h3><p>Estimated loan terms and the cost of recovering your investment.</p></div></div>
          {renderFields(loanFields)}
          {renderFields(feeFields.filter(field => field.key === "closingDate"))}
          <button type="button" className="text-link" onClick={() => {
            resetEstimates();
            setFields(previous => ({ ...previous, arv: "151000", refinanceLtv: "75", interestRate: "6.25", loanTermYears: "30", closingDate: "2026-06-08", annualPropertyTaxes: "2410.08", annualInsurance: "970" }));
            setClosingAdjustments({ ...DEFAULT_CLOSING_ADJUSTMENTS, annualFloodInsurance: 905, aggregateEscrowAdjustment: -604.99, brokerCredit: 339.75, quotedTitlePremium: 195 });
            setAddress("2221 Eby Avenue, Fort Wayne, IN 46802"); setReferenceLoaded(true); setIsEdited(false); setShowResults(false);
          }}>Use actual closing loan terms →</button>
          <ClosingCostEstimate estimate={closingPreview} />
          {closingPreviewError && <p role="alert" className="error">{closingPreviewError}</p>}
          <details className="closing-adjustments"><summary>Lender-specific adjustments <small>Credits, payoffs & payment timing</small></summary>
            <p className="note">These cannot be reliably estimated from a single closing. Enter confirmed amounts; credits and the aggregate adjustment start at zero.</p>
            <label className="field title-quote-field"><span><ExplainedValue label="Lender title-policy premium estimate" explanation={<p>Starts at the $195 closing-document reference. Editable; confirm a quote for this deal’s loan amount.</p>} /></span><div className="input-wrap"><input type="number" inputMode="decimal" step="0.01" min={0} max={1000000000} value={closingAdjustments.quotedTitlePremium ?? 195} onChange={event => updateAdjustment("quotedTitlePremium", event.target.value === "" ? null : Number(event.target.value))} /><span>$</span></div></label>
            <div className="input-grid">{([
              ["aggregateEscrowAdjustment", "Aggregate escrow adjustment", "Signed amount; negative reduces the deposit."],
              ["brokerCredit", "Broker credit", "Reduces cash needed at closing."],
              ["lenderCredit", "Lender credit", "Separate from lender-paid broker compensation."],
              ["existingLoanPayoff", "Existing loan payoff", "Reduces the actual cash returned to you."],
              ["additionalClosingCosts", "Additional quoted charges", "Only amounts not already itemized above."],
            ] as const).map(([key, label, hint]) => <label className="field" key={key}><span><ExplainedValue label={label} explanation={<p>{hint}</p>} /></span><div className="input-wrap"><input type="number" inputMode="decimal" step="0.01" min={key === "aggregateEscrowAdjustment" ? undefined : 0} max={1000000000} value={closingAdjustments[key]} onChange={event => updateAdjustment(key, Number(event.target.value))} /><span>$</span></div></label>)}</div>
            <label className="checkbox-field"><input type="checkbox" checked={closingAdjustments.appraisalPaidBeforeClosing} onChange={event => updateAdjustment("appraisalPaidBeforeClosing", event.target.checked)} />Appraisal + AMC paid before closing</label>
            <label className="checkbox-field"><input type="checkbox" checked={closingAdjustments.floodPremiumPaidBeforeClosing} onChange={event => updateAdjustment("floodPremiumPaidBeforeClosing", event.target.checked)} />Annual flood premium paid before closing</label>
          </details>
        </section>
        </div>
          <div className="derived-results">
            {result && <section className="panel results" aria-labelledby="detailed-results-heading">
              <h3 id="detailed-results-heading">Calculated results</h3>
              <DealStrengthDetails result={result} arv={Number(fields.arv)} monthlyRent={Number(fields.monthlyRent)} />
            <div className="capital-summary"><div><span>{explained("Cash left in the deal", "cashRemainingInDeal")}</span><strong>{money(result.cashRemainingInDeal, true)}</strong></div><div><span>{explained("Capital recovered", "recoveryPercent")}</span><strong>{percent(result.recoveryPercent)}</strong></div></div>
            {cloudEnabled && <div className="save-deal-controls"><button className="button" type="button" disabled={saving} onClick={saveDeal}>{saving ? "Saving…" : savedRecord ? "Update saved deal" : "Save deal"}</button><p className="note" role="status">{saveMessage || "Saves project inputs, fee adjustments, and tax assumptions to your private database."}</p></div>}
            {result.cashRemainingInDeal < 0 && <p className="note">Negative cash left means refinance proceeds exceed the modeled project cost.</p>}
            <h3 className="breakdown-title">Refinance & cash returned</h3>
            <DetailRows rows={[
              [explained("Purchase closing costs", "purchaseClosingCosts"), money(result.purchaseClosingCosts, true)],
              [explained("Total project cost", "totalProjectCost"), money(result.totalProjectCost, true)],
              [explained("Gross refinance loan", "refinanceLoanAmount"), money(result.refinanceLoanAmount, true)],
              [explained("Total closing costs", "refinanceCosts"), money(result.refinanceCosts, true)],
              [explained("Already paid before closing", "paidBeforeClosing"), money(result.closing?.paidBeforeClosing ?? 0, true)],
              [explained("Costs deducted at closing", "atClosingCosts"), money(result.closing?.atClosingCosts ?? 0, true)],
              [explained("Broker + lender credits", "credits"), money(result.closing?.credits ?? 0, true)],
              [explained("Existing debt payoff", "existingLoanPayoff"), money(result.closing?.existingLoanPayoff ?? 0, true)],
              [explained("Cash to borrower at closing", "cashOutProceeds"), money(result.cashOutProceeds, true)],
              [explained("Net whole-project recovery", "netProjectRecovery"), money(result.netProjectRecovery, true)],
            ]} />
            <p className="note">Cash to borrower reflects payment timing and any debt payoff. Cash left in the deal uses whole-project cost recovery, including fees already paid, so paying a fee early does not improve the investment return.</p>
            <details className="result-details" open><summary>Monthly income & expenses</summary><DetailRows rows={[
              [explained("Expected rent", "monthlyRent"), money(Number(fields.monthlyRent), true)],
              [explained("Principal & interest", "monthlyPrincipalAndInterest"), money(result.monthlyPrincipalAndInterest, true)],
              [explained("Property taxes", "monthlyTaxes"), money(result.monthlyTaxes, true)],
              [explained("Homeowners insurance", "monthlyInsurance"), money(result.monthlyInsurance, true)],
              [explained("Flood insurance", "monthlyFloodInsurance"), money(result.monthlyFloodInsurance, true)],
              [explained("Mortgage incl. taxes & insurance", "monthlyMortgagePayment"), money(result.monthlyMortgagePayment, true)],
              [explained("Management", "managementExpense"), money(result.managementExpense, true)],
              [explained("CapEx reserve", "monthlyCapexReserve"), money(result.monthlyCapexReserve, true)],
              [explained("Vacancy reserve", "vacancyReserve"), money(result.vacancyReserve, true)],
              [explained("Maintenance reserve", "maintenanceReserve"), money(result.maintenanceReserve, true)],
              [explained("Total monthly costs", "totalMonthlyCost"), money(result.totalMonthlyCost, true)],
            ]} /></details>
            </section>}
        <details className="panel assumptions"><summary>How these estimates work</summary><ul>
          <li>Project cost includes purchase, rehab, holding, construction contingency, and net purchase closing costs. Purchase and refinance transaction fees are separate; rehab is counted only once.</li>
          <li>Closing charges use your signed package’s fixed-fee baseline and 1.75% origination. They are read-only estimates, not guaranteed fees for another property.</li>
          <li>Interest starts on the funding/disbursement date. The daily rate is rounded to cents before multiplying by inclusive days through month-end, matching the document.</li>
          <li>Annual homeowners and flood premiums are closing prepaids. Initial escrow is a separate deposit. Recurring taxes and insurance are deducted only once in monthly cash flow.</li>
          <li>Appraisal + AMC and flood premiums can be marked paid before closing; they remain part of the total investment cost.</li>
          <li>Credits and aggregate escrow adjustments are deal-specific. No concession is assumed until entered.</li>
          <li>The original sheet’s single rent and editable management rate remain. ROE awaits a defined formula.</li>
          <li>No appreciation, income tax, disposition, or future prepayment-penalty forecast is included.</li>
        </ul></details>
          </div>
        </div>
      </section>
    </form>
  </>;
}
