#!/usr/bin/env python3
"""Read-only OOXML extraction; stdlib only. Never copy the source workbook into the app."""
import argparse, collections, hashlib, json, math, pathlib, re, zipfile
import xml.etree.ElementTree as E

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def extract(path, output):
    with zipfile.ZipFile(path) as z:
        strings = [''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        wb = E.fromstring(z.read('xl/workbook.xml'))
        rels = {r.get('Id'):r.get('Target') for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheets = {s.get('name'):'xl/'+rels[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')].lstrip('/') for s in wb.find('m:sheets',NS)}
        def rows(sheet):
            with z.open(sheets[sheet]) as stream:
                for _, el in E.iterparse(stream, events=['end']):
                    if el.tag != '{'+NS['m']+'}row': continue
                    vals, forms = {}, {}
                    for c in el.findall('m:c',NS):
                        col = re.sub(r'\d','',c.get('r')); v=c.find('m:v',NS); f=c.find('m:f',NS)
                        value = v.text if v is not None else None
                        if c.get('t') == 's' and value is not None: value=strings[int(value)]
                        elif c.get('t') == 'inlineStr': value=''.join(c.find('m:is',NS).itertext())
                        elif value is not None and c.get('t') not in ('str','e'):
                            try: value=float(value); value=int(value) if value.is_integer() else value
                            except ValueError: pass
                        vals[col]=value
                        if f is not None: forms[col]=f.text
                    yield int(el.get('r')), vals, forms
                    el.clear()
        calc={n:(v,f) for n,v,f in rows('2026 Calculator')}
        assert calc[5][0]['A']=='2026 Rental Calculator Estimator'
        assert '26Pay27' in calc[54][0]['B']
        assert calc[34][1]['D']=='ROUND(D40*D36,-2)'
        assert calc[47][1]['D']=='(E42*0.88*0.02)+(G42*0.03)'
        assert ',31,FALSE)' in calc[42][1]['E'] and ',32,FALSE)' in calc[42][1]['G']
        neighborhoods, records, seen = [], [], set()
        nb_index={}; classes=collections.Counter(); mixed=0
        def number(v): return v if isinstance(v,(int,float)) and math.isfinite(v) else None
        for n,v,_ in rows('lookup sheet'):
            if n==1:
                expected={'A':'Address','C':'NBHD','D':'NBHD Name','E':'StateParcelNbr','I':'PropertyClassCode','P':'Rental','S':'LandCap3','V':'ImprCap3','AA':'EstRent','AB':'GRM'}
                assert all(v.get(k)==val for k,val in expected.items()), 'Lookup schema changed; review before refresh.'
                continue
            if not v.get('E'): continue
            parcel=re.sub(r'\D','',str(v['E'])); address=v.get('A') or v.get('F') or ''
            if len(parcel)!=18: raise ValueError(f'Invalid parcel at row {n}')
            key=(str(v.get('C') or ''),str(v.get('D') or ''))
            if key not in nb_index: nb_index[key]=len(neighborhoods); neighborhoods.append(list(key))
            grm=number(v.get('AB')); rent=number(v.get('AA'))
            base=math.floor(rent*grm/100+0.5)*100 if rent is not None and grm is not None else None
            # Store only matching keys, neighborhood/GRM, rental flag and component safety data.
            # No reported rents, owners, sales, contact data or workbook included.
            cap3parts=[number(v.get(c)) for c in ('S','V','AD')]
            cap3=max(cap3parts[0]+cap3parts[1],cap3parts[2]) if all(x is not None for x in cap3parts) else None
            record=[parcel,str(address).strip(),str(v.get('AI') or ''),nb_index[key],grm,
                    v.get('P')=='Yes' if v.get('P') in ('Yes','No') else None,
                    str(v.get('I') or ''),base,number(v.get('AE')),number(v.get('AF')),cap3,n]
            encoded=json.dumps(record,separators=(',',':'))
            if encoded in seen: continue
            seen.add(encoded); records.append(record); classes[record[6]]+=1
            if record[9] or record[10] or (base is not None and record[8]!=base): mixed+=1
        for address,grm,nb in [('2221 EBY AVE',94.57,'471211-074'),('2115 LAVERNE AVE',84.14,'727601-072')]:
            matches=[r for r in records if r[1]==address]
            assert len(matches)==1 and matches[0][4]==grm and neighborhoods[matches[0][3]][0]==nb
        meta={'assessmentYear':2026,'payableYear':2027,'sourceUrl':'https://www.allencounty.in.gov/192/Rental-Properties',
              'workbookUrl':'https://www.allencounty.in.gov/DocumentCenter/View/229/2026-Pay-2027-Rental-Property-Calculator',
              'workbookName':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
              'formulaCells':{'assessment':'2026 Calculator!D34','tax':'2026 Calculator!D47','residential':'2026 Calculator!E42','other':'2026 Calculator!G42'},
              'columns':['parcel','address','zip','neighborhoodIndex','grm','assessedAsRental','propertyClass','baseRentAssessment','incomeCap2','incomeCap3','otherCap3','lookupRow']}
        output.parent.mkdir(parents=True,exist_ok=True)
        packed='\n'.join('\t'.join('' if x is None else 'Y' if x is True else 'N' if x is False else str(x) for x in row) for row in records)
        assert all('\t' not in str(x) and '\n' not in str(x) for row in records for x in row), 'Unexpected delimiter'
        output.write_text(json.dumps({'metadata':meta,'neighborhoods':neighborhoods,'rows':packed},separators=(',',':'))+'\n')
        print(json.dumps({'records':len(records),'neighborhoods':len(neighborhoods),'bytes':output.stat().st_size,'componentFlags':mixed,'topClasses':classes.most_common(12)}))
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('workbook',type=pathlib.Path)
    parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]/'src/lib/taxes/data/allen-rentals-2026.json')
    args=parser.parse_args();extract(args.workbook,args.output)
