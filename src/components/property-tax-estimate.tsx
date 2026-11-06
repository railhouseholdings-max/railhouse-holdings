"use client";
import { useEffect, useState } from 'react';
import type { DealTaxAssumptions } from '@/domain/saved-deal';
import type { RentalTaxMatch } from '@/domain/property-tax';
import type { TaxRecord } from '@/lib/taxes/property-taxes';
import { estimateCountyRentalTaxes, selectAnnualTaxes } from '@/lib/calculations/tax-estimate';
import { ExplainedValue } from './calculation-help';
import { money } from '@/lib/format';

type LookupState = { key: string; match: RentalTaxMatch; historical: TaxRecord | null; historicalDone: boolean };
export function usePropertyTaxModel(address: string, rent: string, initial?: {assumptions?: DealTaxAssumptions; evidence?: RentalTaxMatch | null}) {
  const [parcelId,setParcelId] = useState(initial?.assumptions?.parcelId ?? '');
  const [override,setOverride] = useState(initial?.assumptions?.annualOverride === null || initial?.assumptions?.annualOverride === undefined ? '' : String(initial.assumptions.annualOverride));
  const [payableYear,setPayableYear] = useState(String(initial?.assumptions?.payableYear ?? 2027));
  const [revision,setRevision] = useState(0);
  const [lookup,setLookup] = useState<LookupState | null>(() => initial?.evidence ? {key:`${address}\u0000${initial.assumptions?.parcelId ?? ''}\u00000`,match:initial.evidence,historical:null,historicalDone:false} : null);
  const key = `${address}\u0000${parcelId}\u0000${revision}`;
  const active = lookup?.key === key ? lookup : null;
  const hasQuery = Boolean(address.trim() || parcelId.trim());
  useEffect(() => {
    if (!hasQuery) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      let match: RentalTaxMatch;
      try {
        const response = await fetch(`/api/rental-tax-property?${new URLSearchParams({address,parcelId})}`,{signal:controller.signal,cache:'no-store'});
        if (!response.ok) throw new Error('Workbook lookup failed');
        match = await response.json() as RentalTaxMatch;
      } catch {
        if (controller.signal.aborted) return;
        match = {status:'unavailable',message:'County workbook lookup unavailable. Enter a manual annual-tax estimate.'};
      }
      if (controller.signal.aborted) return;
      setLookup({key,match,historical:null,historicalDone:false});
      let historical: TaxRecord | null = null;
      try {
        const historicalQuery = new URLSearchParams({address,parcelId:match.status === 'found' ? match.parcel.parcelId : parcelId});
        const response = await fetch(`/api/property-taxes?${historicalQuery}`,{signal:controller.signal,cache:'no-store'});
        if (response.ok) historical = (await response.json() as {record?:TaxRecord}).record ?? null;
      } catch { /* Historical bill availability never changes the projected tax estimate. */ }
      if (!controller.signal.aborted) setLookup({key,match,historical,historicalDone:true});
    },450);
    return () => {window.clearTimeout(timer);controller.abort();};
  },[address,parcelId,revision,key,hasQuery]);
  const match = active?.match ?? null;
  const county = estimateCountyRentalTaxes(match?.status === 'found' ? match.parcel : null,match?.status === 'found' ? match.metadata : null,rent.trim() === '' ? null : Number(rent),Number(payableYear));
  if (match && match.status !== 'found') county.message = match.message;
  const selected = selectAnnualTaxes(override,county);
  const reset = () => {setParcelId('');setOverride('');setPayableYear('2027');setLookup(null);setRevision(v=>v+1);};
  return {parcelId,setParcelId,override,setOverride,payableYear,setPayableYear,match,county,selected,
    historical:active?.historical ?? null,historicalDone:active?.historicalDone ?? false,
    loading:hasQuery && !active,hasQuery,reset,refresh:()=>setRevision(v=>v+1),
    warning:active && county.status === 'missing' && selected.source !== 'override' ? county.message : null};
}
export function PropertyTaxFields({ model, projectedRent }: { model: ReturnType<typeof usePropertyTaxModel>; projectedRent: string }) {
  const {match,county,selected,historical} = model;
  const help = <>
    <p>Source: <a href="https://www.allencounty.in.gov/192/Rental-Properties" target="_blank" rel="noreferrer">Allen County Rental Properties</a>. Official 2026 Rental Calculator snapshot. This is the workbook’s simplified estimate, not an exact bill.</p>
    {match?.status === 'found' && <>
      <p><a href={match.metadata.workbookUrl} target="_blank" rel="noreferrer">{match.metadata.workbookName}</a></p>
      <p>Assessment year: {match.metadata.assessmentYear}. Payable year: {match.metadata.payableYear}. Selected payable year: {model.payableYear || 'missing'}.</p>
      <p>{match.parcel.address} · parcel {match.parcel.parcelId}. Neighborhood: {match.parcel.neighborhood} — {match.parcel.neighborhoodName}. Monthly-rent GRM: {match.parcel.grm ?? 'missing'}. Projected monthly market rent: {projectedRent || 'missing'}. Lookup sheet row {match.parcel.lookupRow}.</p>
      <p>Snapshot rental assessment: {match.parcel.assessedAsRental === true ? 'Yes' : match.parcel.assessedAsRental === false ? 'No' : 'Unknown'}. Property class: {match.parcel.propertyClass}.</p>
      <p>Snapshot components: income 2%-cap value {match.parcel.incomeCap2 === null ? 'missing' : money(match.parcel.incomeCap2,true)}; income 3%-cap value {match.parcel.incomeCap3 === null ? 'missing' : money(match.parcel.incomeCap3,true)}; other 3%-cap land/improvement or cost value {match.parcel.otherCap3 === null ? 'missing' : money(match.parcel.otherCap3,true)}. Base rent-derived assessment: {match.parcel.baseRentAssessment === null ? 'missing' : money(match.parcel.baseRentAssessment,true)}.</p>
    </>}
    <p>Residential formula: assessed value = projected monthly rent × monthly GRM, rounded to the nearest $100. For assessment 2026 / payable 2027 only: assessed value × 0.88 × 0.02. The workbook’s separate 3%-cap component uses × 0.03, without the 0.88 factor. Mixed components and excess adjustments require a manual total estimate here.</p>
    <p>{county.calculation || county.message}</p>
    <p>{selected.explanation} The selected annual amount is used consistently in cash flow, refinance escrow, closing costs, and ratings. The current county bill is historical reference only.</p>
  </>;
  return <div className="property-tax-model">
    <div className="input-grid">
      <label className="field" htmlFor="currentAnnualTaxes"><span><ExplainedValue label="Current county taxes / year" explanation={<p>Historical reference only{historical ? ` · payable ${historical.payYear}` : ""}. This amount does not set projected taxes used in the deal calculation.</p>} /></span><div className="input-wrap"><input id="currentAnnualTaxes" type="text" readOnly value={historical ? historical.annualTaxes.toFixed(2) : ''} /><span>$</span></div></label>
      <label className="field" htmlFor="estimatedAnnualTaxes"><span><ExplainedValue label="Estimated taxes / year" explanation={<><p>Tap the estimate to enter your own annual amount. Your override takes precedence in all calculations; clear it to use the county estimate.</p>{help}</>} /></span><div className="input-wrap"><input id="estimatedAnnualTaxes" type="number" inputMode="decimal" min={0} max={1000000000} step="0.01" value={model.override !== '' ? model.override : county.annualTaxes === null ? '' : county.annualTaxes.toFixed(2)} onChange={event => model.setOverride(event.target.value)} aria-describedby="estimated-taxes-hint" /><span>$</span></div><small id="estimated-taxes-hint" className="sr-only">{selected.source === 'override' ? 'Manual override · Used in calculations' : selected.source === 'county' ? `County simplified estimate · payable ${model.payableYear}` : 'Enter an annual estimate or match a property'}</small></label>
    </div>
    {model.override !== '' && <button type="button" className="text-link" onClick={() => model.setOverride('')}>Use county estimate</button>}
    {model.loading && <p className="note" role="status">Matching the county workbook…</p>}
    {match && county.status === 'missing' && <p className="note">{county.message}</p>}
    {county.warning && <p className="notice tax-model-warning" role="status">{county.warning}</p>}
    {model.historicalDone && !historical && <p className="note">Current county tax bill unavailable. No historical amount has been assumed.</p>}
    {historical && <p className="note"><a className="text-link" href={historical.sourceUrl} target="_blank" rel="noreferrer">Current county bill · payable {historical.payYear} ↗</a> · {historical.address}</p>}
    <div className="input-grid tax-model-controls">
      <label className="field" htmlFor="taxPayableYear"><span><ExplainedValue label="Tax payable year" explanation={<p>County model supports 2027. Other years need an override.</p>} /></span><div className="input-wrap"><input id="taxPayableYear" type="number" min={2020} max={2100} step={1} required value={model.payableYear} onChange={e=>model.setPayableYear(e.target.value)} /></div></label>
    </div>
    <details className="tax-parcel-details"><summary>Match by parcel ID</summary><label className="field" htmlFor="taxParcelId"><span><ExplainedValue label="Allen County parcel ID (optional)" explanation={<p>Use a parcel ID to resolve duplicate addresses. If both the address and parcel ID are entered, they must agree.</p>} /></span><input id="taxParcelId" type="text" maxLength={40} value={model.parcelId} onChange={e=>model.setParcelId(e.target.value)} /></label></details>
    {model.hasQuery && <button className="text-link" type="button" onClick={model.refresh}>Refresh property tax data →</button>}
  </div>;
}
