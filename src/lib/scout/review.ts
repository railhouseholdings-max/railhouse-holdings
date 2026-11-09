import type { PropertyReview, ScoutEvidence } from '../../domain/scout.ts';
import { validateArvInput } from '../arv/validation.ts';
const text=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max)throw new Error('Invalid review text.');return v;};
export function validatePropertyReview(raw:unknown,now:string):PropertyReview {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||JSON.stringify(raw).length>50000)throw new Error('Invalid property review.');
  const r=raw as PropertyReview;
  if(!['Researching','Under Review','Watch','Dismissed'].includes(r.workflow)||r.decision!==null&&!['Strong Buy','Potential Fit','Watch','Pass','Needs Review'].includes(r.decision))throw new Error('Invalid review status.');
  const evidence:ScoutEvidence={};
  if(r.evidence?.rehab){const v=r.evidence.rehab;if(![v.low,v.base,v.high].every(n=>Number.isFinite(n)&&n>=0&&n<=1e9)||v.low>v.base||v.base>v.high||typeof v.photoReviewed!=='boolean'||!/^\d{4}-\d{2}-\d{2}$/.test(v.asOf)||!Number.isFinite(Date.parse(v.asOf))||v.asOf>now.slice(0,10))throw new Error('Invalid sourced rehab range.');evidence.rehab={...v,scope:text(v.scope,3000),source:text(v.source,500)};if(!v.scope.trim()||!v.source.trim())throw new Error('Supply the rehab scope and source.');}
  if(r.evidence?.thesis)evidence.thesis=text(r.evidence.thesis,3000);
  if(r.evidence?.thesisSource)evidence.thesisSource=text(r.evidence.thesisSource,500);
  if(r.evidence?.rentOverride){const rent=r.evidence.rentOverride;if(!Number.isFinite(rent.monthly)||rent.monthly<=0||[rent.low,rent.high].some(n=>n!==null&&(!Number.isFinite(n)||n<0))||rent.low!==null&&rent.low>rent.monthly||rent.high!==null&&rent.high<rent.monthly)throw new Error('Invalid stabilized rent evidence.');evidence.rentOverride={...rent,source:text(rent.source,500)};if(!rent.source.trim())throw new Error('Rent estimate source is required.');}
  if(r.evidence?.arvInput)evidence.arvInput=validateArvInput(r.evidence.arvInput);
  if(r.evidence?.neighborhood){const n=r.evidence.neighborhood;if(!Array.isArray(n.sources)||n.sources.length>20)throw new Error('Invalid neighborhood sources.');evidence.neighborhood={summary:text(n.summary,4000),sources:n.sources.map(s=>{const u=new URL(s.url);if(!['https:','http:'].includes(u.protocol)||!/^\d{4}-\d{2}-\d{2}/.test(s.retrievedAt))throw new Error('Invalid neighborhood source.');return {url:u.href,retrievedAt:s.retrievedAt};})};}
  return {notes:text(r.notes,5000),workflow:r.workflow,decision:r.decision,evidence};
}
