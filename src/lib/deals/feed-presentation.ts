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

/** New is age-based rather than read-based; an explicit mark restarts its week. */
export function isNewProperty(property:{addedDate?:string|null;newMarkedAt?:string|null},now:string):boolean {
  const today=propertyAddedDate(undefined,now,null);
  if(!today)return false;
  const start=property.newMarkedAt?propertyAddedDate(undefined,property.newMarkedAt,null):property.addedDate;
  if(!start)return false;
  const days=(Date.parse(`${today}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000;
  return Number.isFinite(days)&&days>=0&&days<7;
}
export function isOlderProperty(addedDate:string|null|undefined,now:string):boolean {
  const today=propertyAddedDate(undefined,now,null);
  if(!addedDate||!today)return false;
  const [year,month,day]=today.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year,month-1,0)).getUTCDate();
  const cutoff=new Date(Date.UTC(year,month-2,Math.min(day,lastDay))).toISOString().slice(0,10);
  return addedDate<cutoff;
}
