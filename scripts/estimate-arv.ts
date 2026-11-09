import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runArvEstimate } from '../src/lib/arv/service.ts';
import { validateArvInput } from '../src/lib/arv/validation.ts';
import { importComparableCsv } from '../src/lib/arv/import.ts';
import { auditEbyGrid } from '../src/lib/arv/eby-regression.ts';
import { describeArv } from '../src/lib/arv/application.ts';
const args=process.argv.slice(2);
const option=(key:string)=>{const i=args.indexOf(key);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Supply a value for ${key}.`);return args[i+1];};
try {
  if(args.includes('--help')||!args.length){console.log('npm run arv -- --input <input.json> [--comps-csv <export.csv>] [--json] [--output <result.json>] [--live]\nnpm run arv -- --offline-demo [--json]\nnpm run arv -- --eby-regression\nDefault: offline, supplied closed-sale evidence only. --live requires RENTCAST_API_KEY and may consume up to six paid requests.');}
  else if(args.includes('--eby-regression')){
    const grid=JSON.parse(await readFile(new URL('../tests/fixtures/arv/eby-appraisal-grid.json',import.meta.url),'utf8'));
    console.log(JSON.stringify(auditEbyGrid(grid),null,2));
  }else{
    const file=args.includes('--offline-demo')?'tests/fixtures/arv/synthetic-input.json':option('--input');if(!file)throw new Error('Supply --input or --offline-demo.');
    const raw=JSON.parse(await readFile(resolve(file),'utf8'));const csv=option('--comps-csv');if(csv)raw.comparables=importComparableCsv(await readFile(resolve(csv),'utf8'));
    const input=validateArvInput(raw);const result=await runArvEstimate(input,{live:args.includes('--live'),apiKey:process.env.RENTCAST_API_KEY,onUsage:event=>process.stderr.write(`RentCast request ${event.requests}: HTTP ${event.status}\n`)});
    const json=JSON.stringify(result,null,2);const output=option('--output');if(output)await writeFile(resolve(output),json+'\n');
    console.log(args.includes('--json')?json:[describeArv(result),...result.comparables.map(c=>`${c.comparable.address}: $${c.adjustedPrice.toFixed(2)}, weight ${(c.weight*100).toFixed(1)}%, net ${c.netAdjustmentPercent.toFixed(1)}%, gross ${c.grossAdjustmentPercent.toFixed(1)}%`),...result.assumptions.map(a=>`Assumption: ${a}`),...result.warnings.map(w=>`Warning: ${w}`)].join('\n'));
  }
}catch(error){console.error(error instanceof Error?error.message:'ARV command failed.');process.exitCode=1;}
