import type { ArvComparable } from '../../domain/arv.ts';
import { propertyRecord, normalizePropertyType } from './normalization.ts';
import { validateSource, validDate } from './validation.ts';
/** RFC-style quoted cells; never evaluates spreadsheet expressions. */
export function parseCsv(text:string):Record<string,string>[] {
  if(text.length>500000)throw new Error('CSV exceeds 500 KB.');
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell.trim());cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;}
  if(quoted)throw new Error('Unclosed quoted CSV field.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  const headers=rows.shift()?.map(h=>h.replace(/^\uFEFF/,''))??[];
  if(!headers.length||new Set(headers).size!==headers.length)throw new Error('Missing or duplicate CSV headers.');
  return rows.map(cells=>{if(cells.length!==headers.length)throw new Error('CSV row width does not match header.');return Object.fromEntries(headers.map((h,i)=>[h,cells[i]]));});
}
export function importComparableCsv(text:string):ArvComparable[] {
  return parseCsv(text).map((r,index)=>{
    if(!r.id||!r.address||!r.provider||!r.reference||!validDate(r.retrievedAt))throw new Error(`CSV row ${index+2} needs id, address, provider, reference, and retrievedAt.`);
    const n=(key:string)=>{if(!r[key]?.trim())return null;const value=Number(r[key]);if(!Number.isFinite(value))throw new Error(`Invalid CSV ${key}.`);return value;};
    const source={provider:r.provider,recordId:r.id,reference:r.reference,retrievedAt:r.retrievedAt,reliability:n('reliability')??0.65,status:'user-supplied' as const};validateSource(source);
    const p=propertyRecord(r.id,r.address,source,{propertyType:normalizePropertyType(r.propertyType||null),units:n('units'),bedrooms:n('bedrooms'),bathrooms:n('bathrooms'),glaSqFt:n('glaSqFt'),lotSqFt:n('lotSqFt'),yearBuilt:n('yearBuilt'),garageSpaces:n('garageSpaces'),basementSqFt:n('basementSqFt'),basementFinishedSqFt:n('basementFinishedSqFt'),condition:(r.condition||null) as ArvComparable['condition'],quality:(r.quality||null) as ArvComparable['quality'],floodZone:r.floodZone||null,style:r.style||null,submarket:r.submarket||null,latitude:n('latitude'),longitude:n('longitude')});
    for(const key of ['propertyType','units','bedrooms','bathrooms','glaSqFt','lotSqFt','yearBuilt','garageSpaces','basementSqFt','basementFinishedSqFt','condition','quality','floodZone','style','submarket'] as const) if(p[key]!==null)p.evidence[key]='user-supplied';
    return {...p,sale:{status:(r.transactionStatus||'unknown') as ArvComparable['sale']['status'],price:n('salePrice'),date:r.saleDate||null,armsLength:r.armsLength==='true'?true:r.armsLength==='false'?false:null,source},distanceMiles:n('distanceMiles'),competingMarketEvidence:r.competingMarketEvidence||null,conditionAssessment:(r.conditionAssessment||'unknown') as ArvComparable['conditionAssessment']};
  });
}
