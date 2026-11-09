import { readFile } from 'node:fs/promises';
import { OfflineScoutStore } from '../src/lib/scout/offline.ts';
import { syncSheetToFeed } from '../src/lib/sheets/workflow.ts';
import type { SheetGrid } from '../src/lib/sheets/client.ts';
if(!process.argv.includes('--offline-demo')){
  console.error('Use npm run scout -- --offline-demo. Production imports run from Properties or the protected daily server endpoint.');process.exitCode=1;
}else {
  const grid=JSON.parse(await readFile(new URL('../tests/fixtures/scout/synthetic-sheet.json',import.meta.url),'utf8')) as SheetGrid;
  const store=new OfflineScoutStore();store.settings.enabled=true;
  const run=await syncSheetToFeed({store,key:'SYNTHETIC offline sheet import',now:()=>grid.fetchedAt,signal:new AbortController().signal,read:async()=>grid});
  console.log(JSON.stringify({mode:'SYNTHETIC offline Google Sheets import — not actual properties',run,properties:[...store.properties.values()],listingHistory:store.history},null,2));
}
