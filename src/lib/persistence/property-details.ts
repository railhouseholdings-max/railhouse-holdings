import type { SaveDealRequest } from '../../domain/saved-deal.ts';
/** Bound the existing serializable draft/lookup. It remains attributed user/provider data. */
export function validatePropertyDetails(raw:unknown):NonNullable<SaveDealRequest['propertyDetails']> {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||JSON.stringify(raw).length>32000)throw new Error('Invalid property details.');
  const value=raw as NonNullable<SaveDealRequest['propertyDetails']>;
  const additions=(v:unknown)=>{
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid proposed additions.');
    const x=v as Record<string,unknown>;
    for(const key of ['bedrooms','bathrooms','squareFeet'])if(typeof x[key]!=='string'||String(x[key]).length>30||(x[key]!==''&&(!Number.isFinite(Number(x[key]))||Number(x[key])<0)))throw new Error('Invalid proposed additions.');
  };
  if(!value.draft||typeof value.draft!=='object'||!value.draft.overrides||Array.isArray(value.draft.overrides)||typeof value.draft.overrides!=='object')throw new Error('Invalid property draft.');
  for(const [k,v] of Object.entries(value.draft.overrides))if(k.length>80||typeof v!=='string'||v.length>500)throw new Error('Invalid property correction.');
  additions(value.draft.additions);
  if(value.draft.units!==undefined){
    if(!Array.isArray(value.draft.units)||value.draft.units.length>24)throw new Error('Too many unit plans.');
    for(const unit of value.draft.units){
      if(!unit||typeof unit!=='object'||!['existing','proposed'].includes(unit.status))throw new Error('Invalid unit plan.');
      for(const key of ['id','name','bedrooms','bathrooms','squareFeet','monthlyRent'] as const)if(typeof unit[key]!=='string'||unit[key].length>160)throw new Error('Invalid unit plan.');
      additions(unit.additions);
    }
  }
  if(value.lookup){
    if(!['RentCast','Google Sheets'].includes(value.lookup.source)||typeof value.lookup.address!=='string'||typeof value.lookup.fetchedAt!=='string'||!Array.isArray(value.lookup.facts)||value.lookup.facts.length>100||!Array.isArray(value.lookup.warnings)||value.lookup.warnings.some(v=>typeof v!=='string'||v.length>1000))throw new Error('Invalid property source snapshot.');
    for(const fact of value.lookup.facts)if(typeof fact?.label!=='string'||fact.label.length>100||typeof fact.value!=='string'||fact.value.length>500)throw new Error('Invalid property source fact.');
  }
  return JSON.parse(JSON.stringify(value));
}
