import { sheetDate } from '../sheets/import.ts';
/** Source Date Added is a calendar date. Daily refresh timestamps never replace it. */
export function propertyAddedDate(sourceDate:string|undefined,firstDiscoveredAt:string|null|undefined,createdAt:string|null|undefined):string|null {
  const source=sheetDate(sourceDate??'');if(source)return /^\d{4}-\d{2}-\d{2}/.test(sourceDate??'')?sourceDate!.slice(0,10):source.slice(0,10);
  for(const value of [firstDiscoveredAt,createdAt]){
    if(!value||!Number.isFinite(Date.parse(value)))continue;
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  }
  return null;
}
export function isUnseenProperty(property:{firstViewedAt?:string|null;deal?:unknown;lifecycle?:string}):boolean {
  // A saved personal analysis/owned asset has already been worked on by this single owner.
  return !property.firstViewedAt&&!property.deal&&property.lifecycle!=='owned';
}
