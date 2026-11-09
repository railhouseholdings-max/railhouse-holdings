"use client";

import { useEffect, useRef, useState } from 'react';
import { isCompletePropertyAddress, type RentCastLookup } from '@/domain/property-lookup';
import { PropertyUnits } from "./property-units";
import { ExplainedValue } from "./calculation-help";
import { money } from '@/lib/format';
import { PROPERTY_DETAIL_FIELDS, propertyDetailValue, proposedPropertyTotals, isMultifamilyProperty, propertyUnits, type PropertyDetailsDraft } from '@/lib/deals/property-details';

type LookupState = {address:string;status:'loading'|'ready'|'error';data?:RentCastLookup;error?:string};
export function usePropertyLookup(onRent: (value: string) => void, initial?:RentCastLookup) {
  const [state,setState]=useState<LookupState|null>(()=>initial?{address:initial.address,status:'ready',data:initial}:null);
  const request=useRef<{key:string;controller:AbortController}|null>(null);
  useEffect(()=>()=>request.current?.controller.abort(),[]);
  const invalidate=()=>{request.current?.controller.abort();request.current=null;setState(null);};
  const commit=async(address:string, retry=false)=>{
    const cleaned=address.trim();
    if(!cleaned) {invalidate();return;}
    const key=cleaned.toLowerCase().replace(/\s+/g,' ');
    // Reusing an imported sheet property must not incur a paid lookup on ordinary field blur.
    if(!retry&&state?.data?.source==='Google Sheets'&&state.address.trim().toLowerCase().replace(/\s+/g,' ')===key)return;
    if(!retry && request.current?.key===key) return;
    request.current?.controller.abort();
    const controller=new AbortController();request.current={key,controller};
    if(!isCompletePropertyAddress(cleaned)) {setState({address:cleaned,status:'error',error:'Enter a full street address with city and state or ZIP to look up details and rent.'});return;}
    setState({address:cleaned,status:'loading'});
    try {
      const response=await fetch(`/api/property-lookup?${new URLSearchParams({address:cleaned})}`,{cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(!response.ok) throw new Error(typeof data.error==='string'?data.error:'Property lookup unavailable. Enter values manually.');
      if(controller.signal.aborted) return;
      const result=data as RentCastLookup;
      setState({address:cleaned,status:'ready',data:result});
      if(result.rent && !result.rent.perUnit) onRent(String(result.rent.monthly));
    } catch(error) {
      if(!controller.signal.aborted) setState({address:cleaned,status:'error',error:error instanceof Error?error.message:'Property lookup unavailable. Enter values manually.'});
    }
  };
  return {state,commit,invalidate};
}
export function PropertyLookupDetails({state,onRetry,onUseRent,currentRent,draft,onChange,onReset}:{
  state:LookupState|null;onRetry:()=>void;onUseRent:(value:string)=>void;currentRent:string;
  draft:PropertyDetailsDraft;onChange:(draft:PropertyDetailsDraft)=>void;onReset:()=>void;
}) {
  const data=state?.data;
  const rent=data?.rent;
  const coreLabels:readonly string[]=PROPERTY_DETAIL_FIELDS.map(field=>field.label);
  const other=data?.facts.filter(fact=>!coreLabels.includes(fact.label))??[];
  const totals=proposedPropertyTotals(data,draft);
  const totalText=(value:number|null,unit='')=>value===null?'Enter current value':value.toLocaleString('en-US')+unit;
  const multifamily=isMultifamilyProperty(data,draft);
  const units=propertyUnits(data,draft);
  const hasEdits=draft.units!==undefined || Object.keys(draft.overrides).length>0 || Object.values(draft.additions).some(value=>Number(value)!==0);
  const edit=(label:string,value:string)=>onChange({...draft,overrides:{...draft.overrides,[label]:value}});
  return <details className="rentcast-details property-details-section">
    <summary><span>Property details</span><small role="status">{state?.status==='loading'?'Looking up RentCast details…':state?.status==='error'?'Lookup unavailable · enter details manually':data?`${data.source} details · edit current values & plan additions`:'Current values & planned additions'}</small></summary>
    <div className="property-details-body">
      {data && <p className="note">{data.source} · {data.address} · retrieved {data.fetchedAt.slice(0,10)}. Correct any values below as needed.</p>}
      {state?.status==='error' && <div className="notice"><p>{state.error}</p><button type="button" className="text-link" onClick={onRetry}>Retry property lookup</button></div>}
      <h3><ExplainedValue label={multifamily?"Current building totals":"Current property"} explanation={<p>Imported values describe the existing property. Correct any values below as needed. Your corrections are kept separately from the original provider data.</p>} /></h3>
      <div className="input-grid current-property-fields">
        {PROPERTY_DETAIL_FIELDS.map(field=><label className="field" key={field.label}><span>{field.label}</span>{field.label==='Property type'?<select value={propertyDetailValue(data,draft,field.label)} onChange={event=>edit(field.label,event.target.value)}><option value="">Not provided</option>{Array.from(new Set(['Single Family','Multi-Family','Duplex','Triplex','Fourplex','Apartment','Condo','Townhouse','Manufactured',propertyDetailValue(data,draft,field.label)].filter(Boolean))).map(type=><option key={type} value={type}>{type}</option>)}</select>:<div className="input-wrap"><input aria-label={`Current ${field.label.toLowerCase()}`} type={field.type} inputMode={field.type==='number'?'decimal':undefined} min={field.type==='number'?0:undefined} max={field.type==='number'?1000000000:undefined} step={'step' in field?field.step:undefined} placeholder="Not available" value={propertyDetailValue(data,draft,field.label)} onChange={event=>edit(field.label,event.target.value)} />{field.unit && <span>{field.unit}</span>}</div>}</label>)}
      </div>
      {multifamily && <PropertyUnits units={units} declaredCount={propertyDetailValue(data,draft,'Units')} onChange={next=>onChange({...draft,units:next})} onUseRent={onUseRent} rentEstimate={rent?.perUnit?rent.monthly:null} />}
      <div className="property-additions" role="group" aria-labelledby="property-additions-heading">
        <h3 id="property-additions-heading"><ExplainedValue label="Planned additions" explanation={<p>Enter only the bedrooms, bathrooms, and living area you plan to add. These amounts are added to current values to show the proposed layout.</p>} /></h3>
        <div className="input-grid">
          {([{key:'bedrooms',label:'Additional bedrooms',unit:'',step:1},{key:'bathrooms',label:'Additional bathrooms',unit:'',step:0.25},{key:'squareFeet',label:'Additional living area',unit:'sq ft',step:1}] as const).map(field=><label className="field" key={field.key}><span>{field.label}</span><div className="input-wrap"><input type="number" inputMode="decimal" min={0} max={1000000000} step={field.step} value={draft.additions[field.key]} onChange={event=>onChange({...draft,additions:{...draft.additions,[field.key]:event.target.value}})} />{field.unit && <span>{field.unit}</span>}</div></label>)}
        </div>
        <h3 className="proposed-property-heading"><ExplainedValue label="Proposed property totals" explanation={<p>Current property values plus planned additions. Missing current values remain unknown. These planning totals do not recalculate RentCast rent or change your ARV and rehab budget; update those estimates separately.</p>} /></h3>
        <dl className="property-facts proposed-property-totals" aria-live="polite" aria-atomic="true"><div><dt>Bedrooms</dt><dd>{totalText(totals.bedrooms)}</dd></div><div><dt>Bathrooms</dt><dd>{totalText(totals.bathrooms)}</dd></div><div><dt>Living area</dt><dd>{totalText(totals.squareFeet,' sq ft')}</dd></div></dl>
      </div>
      {other.length>0 && <div className="property-other-facts"><h3><ExplainedValue label="Other property information" explanation={<p>Historical sales, assessments, taxes, and HOA amounts are reference values. Editing them does not change your financial inputs.</p>} /></h3><div className="input-grid">{other.map(fact=><label className="field" key={fact.label}><span>{fact.label}</span><div className="input-wrap"><input type="text" maxLength={240} value={propertyDetailValue(data,draft,fact.label)} onChange={event=>edit(fact.label,event.target.value)} /></div></label>)}</div></div>}
      {rent && <div className="rentcast-rent"><div><span>{data?.source} monthly rent estimate{rent.perUnit?' / unit':''}</span><strong>{money(rent.monthly,true)}</strong>{rent.low!==null && rent.high!==null && <small>Estimate range: {money(rent.low)}–{money(rent.high)}</small>}{rent.comparableCount>0 && <small>{rent.comparableCount} rental comparables returned</small>}</div>{!rent.perUnit && Number(currentRent)!==rent.monthly && <button type="button" className="button secondary" onClick={()=>onUseRent(String(rent.monthly))}>{rent.perUnit?'Use per-unit rent':'Use rent estimate'}</button>}</div>}
      {rent && <p className="note">{rent.perUnit?'Per-unit estimate only. Apply it to reviewed units above, then use their combined rent for the property.':'Estimate for the original RentCast property configuration. Expected monthly rent remains editable in Primary Estimates.'}</p>}
      {data?.warnings.map(warning=><p className="note" key={warning}>{warning}</p>)}
      {hasEdits && <button type="button" className="text-link reset-property-details" onClick={onReset}>{data?'Reset details to RentCast':'Clear property details'} & remove additions</button>}
      <p className="note">Property edits and planned additions stay in this tab and are included when you share the deal.</p>
    </div>
  </details>;
}
