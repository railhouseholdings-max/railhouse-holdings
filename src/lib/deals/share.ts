import { emptyPropertyDetails, propertyDetailValue, proposedPropertyTotals, propertyUnits, unitProposedTotals, hasPropertyAdditions, totalUnitRent, type PropertyDetailsDraft } from "./property-details.ts";
import type { RentCastLookup } from "../../domain/property-lookup.ts";
import type { DealInputs } from '../../domain/models.ts';
import { money } from '../format.ts';

export function isMobileShareAvailable(device: { userAgent: string; maxTouchPoints: number; userAgentData?: { mobile: boolean } }, secure: boolean, shareSupported: boolean): boolean {
  const mobile = device.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(device.userAgent)
    || (/Macintosh/i.test(device.userAgent) && device.maxTouchPoints > 1);
  return secure && shareSupported && mobile;
}

const provided=(value:string)=>value.trim()||'Not provided';
const numeric=(value:string,unit='')=>value.trim()===''||!Number.isFinite(Number(value))?'Not provided':Number(value).toLocaleString('en-US')+unit;
const count=(value:string,label:string)=>`${numeric(value)} ${Number(value)===1?label:label+'s'}`;
const layout=(bedrooms:string,bathrooms:string,squareFeet:string)=>`${count(bedrooms,'bedroom')} · ${count(bathrooms,'bathroom')} · ${numeric(squareFeet,' sq ft')}`;
function additionsLines(additions:PropertyDetailsDraft['additions']):string[] {
  return [additions.bedrooms.trim()!==''&&Number(additions.bedrooms)!==0?`+${count(additions.bedrooms,'bedroom')}`:null,additions.bathrooms.trim()!==''&&Number(additions.bathrooms)!==0?`+${count(additions.bathrooms,'bathroom')}`:null,additions.squareFeet.trim()!==''&&Number(additions.squareFeet)!==0?`+${numeric(additions.squareFeet,' sq ft')}`:null].filter((value):value is string=>Boolean(value));
}
export function formatDealShare(address:string,input:DealInputs,property?:RentCastLookup,draft:PropertyDetailsDraft=emptyPropertyDetails()):string {
  const units=propertyUnits(property,draft);
  const totals=proposedPropertyTotals(property,draft);
  const propertyType=provided(propertyDetailValue(property,draft,'Property type'));
  const current=(label:string)=>propertyDetailValue(property,draft,label);
  const proposed=hasPropertyAdditions(draft.additions)||units.some(unit=>unit.status==='proposed'||hasPropertyAdditions(unit.additions));
  const lines=[
    'RAILHOUSE HOLDINGS — PROPERTY & PURCHASE ESTIMATE',
    address.trim()||'Property address not provided',
    `Property type: ${propertyType}`,
    '', 'PURCHASE & ESTIMATES',
    `Purchase price: ${money(input.purchasePrice,true)}`,
    `Rehab estimate: ${money(input.rehabBudget,true)}`,
    `Estimated monthly rent (whole property): ${money(input.monthlyRent,true)}`,
    `Estimated ARV: ${money(input.arv,true)}`,
    '', 'CURRENT PROPERTY',
    layout(current('Bedrooms'),current('Bathrooms'),current('Living area')),
    ...(current('Units')?[`Reported current units: ${current('Units')}`]:[]),
  ];
  if(units.length) {
    lines.push('', 'UNIT BREAKDOWN');
    for(const [index,unit] of units.entries()) {
      lines.push(`${unit.name.trim()||`Unit ${index+1}`}${unit.status==='proposed'?' — PROPOSED NEW UNIT':''}`,layout(unit.bedrooms,unit.bathrooms,unit.squareFeet),`Estimated monthly rent: ${unit.monthlyRent.trim()===''||!Number.isFinite(Number(unit.monthlyRent))||Number(unit.monthlyRent)<0?'Not provided':money(Number(unit.monthlyRent),true)}`);
      if(hasPropertyAdditions(unit.additions)) {
        const next=unitProposedTotals(unit);
        lines.push(`Planned additions: ${additionsLines(unit.additions).join(' · ')}`,`Proposed layout: ${layout(next.bedrooms===null?'':String(next.bedrooms),next.bathrooms===null?'':String(next.bathrooms),next.squareFeet===null?'':String(next.squareFeet))}`);
      }
    }
    const rent=totalUnitRent(units);
    if(rent!==null) lines.push(`Combined entered unit rent estimates: ${money(rent,true)} / month`);
    if(rent!==null && rent!==input.monthlyRent) lines.push('Unit rents differ from the whole-property estimate above.');
    const declared=Number(current('Units'));
    const entered=units.filter(unit=>unit.status==='existing').length;
    if(declared>entered) lines.push(`Breakdown incomplete: ${entered} of ${declared} reported current units entered.`);
  } else if(/multi|apartment|duplex|triplex|fourplex|quadplex/i.test(propertyType)||Number(current('Units'))>1) lines.push('', 'Unit breakdown: Not provided');
  if(hasPropertyAdditions(draft.additions)) lines.push('', 'PROPOSED BUILDING ADDITIONS',additionsLines(draft.additions).join(' · '),`Proposed building total: ${layout(totals.bedrooms===null?'':String(totals.bedrooms),totals.bathrooms===null?'':String(totals.bathrooms),totals.squareFeet===null?'':String(totals.squareFeet))}`);
  if(proposed) lines.push('', 'Heads up: proposed additions or new units are planned. They do not automatically update rent, ARV, or rehab estimates. Building and unit additions are separate descriptions; do not add them together.');
  lines.push('', 'Planning estimates; actual costs and results may differ.');
  return lines.join('\n');
}
