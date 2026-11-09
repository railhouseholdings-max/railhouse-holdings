"use client";
import { useEffect, useRef, useState } from 'react';
import type { ArvInput, ArvResult } from '@/domain/arv';
import type { RentCastLookup } from '@/domain/property-lookup';
import type { PropertyDetailsDraft } from '@/lib/deals/property-details';
import { calculatorArvInput, describeArv } from '@/lib/arv/application';
import { importComparableCsv } from '@/lib/arv/import';
import { money } from '@/lib/format';
import { ExplainedValue } from './calculation-help';
const layoutFields=[['units','Finished legal units'],['bedrooms','Finished bedrooms'],['bathrooms','Finished bathrooms'],['glaSqFt','Finished above-grade GLA (sq ft)'],['garageSpaces','Finished garage spaces'],['basementSqFt','Total basement (sq ft)'],['basementFinishedSqFt','Finished basement (sq ft)']] as const;
export function ArvEstimator({address,property,draft,valuationDate,onApply}:{address:string;property?:RentCastLookup;draft:PropertyDetailsDraft;valuationDate:string;onApply:(value:number)=>void}) {
  const [scenario,setScenario]=useState<Record<string,string>>({});
  const [comps,setComps]=useState('');const [live,setLive]=useState(false);const [historical,setHistorical]=useState(false);const [scope,setScope]=useState('');
  const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);const [response,setResponse]=useState<{key:string;result:ArvResult}|null>(null);
  const controller=useRef<AbortController|null>(null);useEffect(()=>()=>controller.current?.abort(),[]);
  const base=calculatorArvInput(address,property,draft,valuationDate);
  const input:ArvInput={...base,proposed:{...base.proposed},scenarioName:scenario.name||'Proposed investor-grade renovation'};
  for(const [key] of layoutFields)if(key in scenario)Object.assign(input.proposed!,{[key]:scenario[key].trim()===''?null:Number(scenario[key])});
  input.proposed!.condition=(scenario.condition??'C3') as NonNullable<ArvInput['proposed']>['condition'];input.proposed!.quality=(scenario.quality??'Q4') as NonNullable<ArvInput['proposed']>['quality'];
  input.subject.submarket=scenario.submarket?.trim()||null;input.subject.floodZone=scenario.floodZone?.trim()||null;
  if(historical)input.settings={historicalEbyScope:scope.trim()};
  const key=JSON.stringify([input,comps,live]);const result=response?.key===key?response.result:null;
  const edit=(field:string,value:string)=>{setScenario(previous=>({...previous,[field]:value}));setStatus('');};
  const estimate=async()=>{
    setStatus('');setBusy(true);controller.current?.abort();const abort=new AbortController();controller.current=abort;
    try {
      let supplied:unknown=[];
      if(comps.trim()) supplied=comps.trim().startsWith('[')?JSON.parse(comps):importComparableCsv(comps);
      if(!Array.isArray(supplied))throw new Error('Supply a JSON array of canonical comparable sales, or the documented CSV format.');
      if(!address.trim())throw new Error('Enter the subject address first.');
      if(historical&&!scope.trim())throw new Error('Explain why the Eby historical rates apply to this particular competing market, or leave the fallback disabled.');
      const response=await fetch('/api/property-lookup',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({operation:'estimate-arv',live,input:{...input,comparables:supplied}})});
      const data=await response.json();if(!response.ok)throw new Error(data.error??'ARV estimation failed.');
      if(!abort.signal.aborted)setResponse({key,result:data as ArvResult});
    }catch(error){if(!abort.signal.aborted)setStatus(error instanceof Error?error.message:'ARV estimation failed.');}
    finally{if(controller.current===abort)setBusy(false);}
  };
  return <details className="arv-estimator">
    <summary><strong>Estimate ARV from closed sales</strong><small>Appraisal-style comparison · proposed finished condition</small></summary>
    <div className="arv-estimator-body">
      <p className="note">Uses current Property details and building-level additions. Verify legal units and above-grade area. Unit-level plans are not added again. Completed finish defaults to C3 / Q4 investor grade; no luxury premium.</p>
      <div className="input-grid">
        <label className="field"><span>Scenario name</span><input type="text" maxLength={120} value={scenario.name??''} placeholder="Proposed investor-grade renovation" onChange={e=>edit('name',e.target.value)} /></label>
        {layoutFields.map(([field,label])=><label className="field" key={field}><span>{label}</span><input type="number" inputMode="decimal" min={field==='units'?1:0} max={1000000000} step={field==='bathrooms'?0.25:1} value={scenario[field]??String(base.proposed?.[field]??base.subject[field]??'')} placeholder="Unknown" onChange={e=>edit(field,e.target.value)} /></label>)}
        {(['condition','quality'] as const).map(field=><label className="field" key={field}><span>{field==='condition'?'Finished condition':'Finished construction quality'}</span><select value={scenario[field]??(field==='condition'?'C3':'Q4')} onChange={e=>edit(field,e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={`${field==='condition'?'C':'Q'}${n}`}>{field==='condition'?'C':'Q'}{n}</option>)}</select></label>)}
        <label className="field"><span><ExplainedValue label="Verified competing submarket" explanation={<p>Use a reviewed neighborhood or micro-market label. Competing-market evidence is required before the search can use sales beyond 1 mile or cross a different submarket.</p>} /></span><input type="text" maxLength={240} placeholder="Unknown" value={scenario.submarket??''} onChange={e=>edit('submarket',e.target.value)} /></label>
        <label className="field"><span>Subject flood zone</span><input type="text" maxLength={30} placeholder="Unknown (e.g. AE or X)" value={scenario.floodZone??''} onChange={e=>edit('floodZone',e.target.value)} /></label>
      </div>
      <label className="field arv-comparable-input"><span><ExplainedValue label="Supplied comparable sales (JSON or CSV)" explanation={<p>Use attributable closed sales with dates, actual prices and source references. The canonical JSON and CSV columns are documented in docs/arv-estimator.md. Active asking prices are excluded. Condition and adjustment evidence should be supplied where available.</p>} /></span><textarea rows={5} maxLength={450000} value={comps} onChange={e=>{setComps(e.target.value);setStatus('');}} placeholder="Paste comparable array JSON or a CSV export. Leave empty only when using live discovery." /></label>
      <label className="field arv-import-file"><span>Import comparable file</span><input type="file" accept=".json,.csv,application/json,text/csv" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>450000){setStatus('Comparable file exceeds 450 KB.');return;}setComps(await file.text());}} /></label>
      <label className="checkbox-field"><input type="checkbox" checked={live} onChange={e=>setLive(e.target.checked)} />Find recorded sales through RentCast (up to six provider requests; current-date valuations only)</label>
      <label className="checkbox-field"><input type="checkbox" checked={historical} onChange={e=>setHistorical(e.target.checked)} />Use historical Eby fallback rates only in a reviewed, competing Fort Wayne single-family market</label>
      {historical&&<label className="field"><span>Eby scope justification</span><input type="text" maxLength={2000} value={scope} onChange={e=>setScope(e.target.value)} placeholder="Why these historical references are applicable to these comps" /></label>}
      <div className="arv-actions"><button type="button" className="button secondary" disabled={busy} onClick={estimate}>{busy?'Estimating…':'Estimate finished value'}</button>{busy&&<button type="button" className="text-link" onClick={()=>{controller.current?.abort();setBusy(false);setStatus('Estimate canceled.');}}>Cancel</button>}</div>
      {status&&<p className="error" role="alert">{status}</p>}
      {response&&!result&&<p className="notice">Inputs changed. Run the estimate again before applying the previous ARV.</p>}
      {result&&<div className="arv-result" role="status">
        <h3>{result.likelyArv===null?'Insufficient evidence':`${result.confidence.level} confidence · ${result.status}`}</h3>
        <div className="arv-value-range">{([['Conservative',result.conservativeArv],['Likely',result.likelyArv],['High',result.highArv]] as const).map(([label,value])=><div key={label}><span>{label}</span><strong>{value===null?'—':money(value)}</strong></div>)}</div>
        <p className="note">{describeArv(result)}</p>
        <div className="arv-actions"><button type="button" className="button" disabled={result.likelyArv===null} onClick={()=>{if(result.likelyArv!==null)onApply(result.likelyArv);}}>Use likely ARV in calculator</button><a className="button secondary" download="railhouse-arv.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result,null,2))}`}>Download evidence JSON</a></div>
        <details><summary>Comparable grid & evidence</summary>{result.comparables.map((c,index)=><section className="arv-comp" key={`${c.comparable.id}-${index}`}><h4>{c.comparable.address}</h4><p>Closed {c.comparable.sale.date} · {money(c.comparable.sale.price!)} · {c.distanceMiles.toFixed(2)} mi</p><p>Adjusted {money(c.adjustedPrice,true)} · weight {(c.weight*100).toFixed(1)}% · net {c.netAdjustmentPercent.toFixed(1)}% · gross {c.grossAdjustmentPercent.toFixed(1)}%</p>{c.adjustments.map(a=><p key={a.feature}>{a.feature}: {money(a.amount,true)} ({a.direction}) — {a.rationale} Source: {a.evidence.reference}</p>)}{c.unresolved.map(item=><p className="negative" key={item}>Unresolved: {item}</p>)}</section>)}{result.excluded.map((c,i)=><p key={`${c.id}-${i}`}>Excluded {c.id}: {c.reason}</p>)}</details>
        <details><summary>Assumptions, confidence & limitations</summary>{[...result.assumptions,...result.confidence.reasons,...result.warnings].map((text,i)=><p className="note" key={i}>{text}</p>)}{result.confidence.factors.map(f=><p className="note" key={f.name}>{f.name}: {(f.score*100).toFixed(0)} / 100 (factor weight {f.weight}%)</p>)}</details>
        <p className="note">{result.methodologyVersion} · {result.calibrationVersion} · investment estimate, not a licensed appraisal. Full evidence and source references are in the downloaded JSON. Only the applied ARV is saved by the existing Save deal action.</p>
      </div>}
    </div>
  </details>;
}
