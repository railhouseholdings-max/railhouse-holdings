"use client";
import { emptyPropertyUnit, hasPropertyAdditions, totalUnitRent, unitProposedTotals, type PropertyUnitDraft } from '@/lib/deals/property-details';
import { money } from '@/lib/format';
import { ExplainedValue } from './calculation-help';

const fields=[{key:'bedrooms',label:'Bedrooms',step:1,unit:''},{key:'bathrooms',label:'Bathrooms',step:0.25,unit:''},{key:'squareFeet',label:'Living area',step:1,unit:'sq ft'},{key:'monthlyRent',label:'Estimated monthly rent',step:0.01,unit:'$'}] as const;
const additionFields=[{key:'bedrooms',label:'Additional bedrooms',step:1,unit:''},{key:'bathrooms',label:'Additional bathrooms',step:0.25,unit:''},{key:'squareFeet',label:'Additional living area',step:1,unit:'sq ft'}] as const;
export function PropertyUnits({units,declaredCount,onChange,onUseRent,rentEstimate}:{units:PropertyUnitDraft[];declaredCount:string;onChange:(units:PropertyUnitDraft[])=>void;onUseRent:(value:string)=>void;rentEstimate:number|null}) {
  const update=(id:string,change:Partial<PropertyUnitDraft>)=>onChange(units.map(unit=>unit.id===id?{...unit,...change}:unit));
  const rent=totalUnitRent(units);
  const existingCount=units.filter(unit=>unit.status==='existing').length;
  const incompleteCount=Number(declaredCount)>existingCount;
  return <section className="property-units" aria-labelledby="property-units-heading">
    <h3 id="property-units-heading"><ExplainedValue label="Unit breakdown" explanation={<p>Enter each unit’s layout and rent separately. Building-level RentCast facts are not divided between units. Proposed units are marked separately. Combined unit rent includes proposed units; use it only if the deal’s rent estimate should reflect that proposed configuration.</p>} /></h3>
    <p className="note">{existingCount} current unit rows{Number(declaredCount)>0?` / ${declaredCount} reported` : ''} · {units.filter(unit=>unit.status==='proposed').length} proposed. Blank unit values need your input.</p>
    {units.map((unit,index)=>{
      const totals=unitProposedTotals(unit);
      return <fieldset className="property-unit-card" key={unit.id}>
        <legend>{unit.name.trim()||`Unit ${index+1}`}{unit.status==='proposed'?' · Proposed new unit':''}</legend>
        <div className="input-grid">
          <label className="field"><span>Unit name / number</span><input type="text" maxLength={80} value={unit.name} onChange={event=>update(unit.id,{name:event.target.value})} /></label>
          <label className="field"><span>Unit status</span><select value={unit.status} onChange={event=>update(unit.id,{status:event.target.value as PropertyUnitDraft['status']})}><option value="existing">Current unit</option><option value="proposed">Proposed new unit</option></select></label>
          {fields.map(field=><label className="field" key={field.key}><span>{field.label}</span><div className="input-wrap"><input type="number" inputMode="decimal" min={0} max={1000000000} step={field.step} placeholder="Not provided" value={unit[field.key]} onChange={event=>update(unit.id,{[field.key]:event.target.value})} />{field.unit&&<span>{field.unit}</span>}</div></label>)}
        </div>
        {rentEstimate!==null && <button type="button" className="text-link" onClick={()=>update(unit.id,{monthlyRent:String(rentEstimate)})}>Use RentCast per-unit estimate ({money(rentEstimate)})</button>}
        <details className="unit-additions"><summary>Planned changes to this unit</summary><div className="input-grid">{additionFields.map(field=><label className="field" key={field.key}><span>{field.label}</span><div className="input-wrap"><input type="number" inputMode="decimal" min={0} max={1000000000} step={field.step} value={unit.additions[field.key]} onChange={event=>update(unit.id,{additions:{...unit.additions,[field.key]:event.target.value}})} />{field.unit&&<span>{field.unit}</span>}</div></label>)}</div></details>
        {hasPropertyAdditions(unit.additions)&&<p className="unit-proposed-total" aria-live="polite">Proposed: {totals.bedrooms??'Unknown'} bedrooms · {totals.bathrooms??'Unknown'} bathrooms · {totals.squareFeet===null?'Unknown':totals.squareFeet.toLocaleString('en-US')} sq ft</p>}
        <button type="button" className="text-link remove-property-unit" aria-label={`Remove ${unit.name.trim()||`Unit ${index+1}`}`} onClick={()=>onChange(units.filter(candidate=>candidate.id!==unit.id))}>Remove unit</button>
      </fieldset>;
    })}
    <div className="unit-actions"><button type="button" className="button secondary" onClick={()=>onChange([...units,emptyPropertyUnit(crypto.randomUUID(),`Unit ${units.length+1}`)])}>Add current unit</button><button type="button" className="button secondary" onClick={()=>onChange([...units,emptyPropertyUnit(crypto.randomUUID(),`Proposed unit ${units.filter(unit=>unit.status==='proposed').length+1}`,'proposed')])}>Add proposed unit</button></div>
    <div className="unit-rent-total"><span>Combined entered unit rent estimates{units.some(unit=>unit.status==='proposed')?' (including proposed units)':''}</span><strong>{rent===null?'Complete each unit’s rent estimate':`${money(rent,true)} / month`}</strong><button type="button" className="button secondary" disabled={rent===null||incompleteCount} onClick={()=>{if(rent!==null) onUseRent(String(rent));}}>Use total as property rent</button>{incompleteCount&&<p className="note">Add the remaining reported current units before using combined rent for the whole property.</p>}</div>
  </section>;
}
