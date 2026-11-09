/** Mirror private.property_key in the migration. Never drop apartment identifiers. */
export function propertyIdentity(address:string):string {
  const aliases:Record<string,string>={AVENUE:'AVE',STREET:'ST',ROAD:'RD',DRIVE:'DR',LANE:'LN',COURT:'CT',BOULEVARD:'BLVD',PLACE:'PL',TERRACE:'TER',PARKWAY:'PKWY',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',APARTMENT:'UNIT',APT:'UNIT',SUITE:'UNIT',STE:'UNIT'};
  return address.toUpperCase().replace(/\b\d{5}(?:-\d{4})?\s*$/,'').replace(/#/g,' UNIT ').replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean).map(w=>aliases[w]??w).join(' ');
}
