import type { ScoutRun,ScoutStore } from '../../domain/scout.ts';
import type { SheetGrid } from './client.ts';
import { normalizeSheet } from './import.ts';
export async function syncSheetToFeed(options:{store:ScoutStore;read:()=>Promise<SheetGrid>;key:string;now:()=>string;signal:AbortSignal}):Promise<ScoutRun|null> {
  if(!(await options.store.config()).enabled)throw new Error('Daily sheet import is disabled. Enable it in Properties.');
  const run=await options.store.begin(options.key,options.now());if(!run)return null;
  try {
    const grid=await options.read();const parsed=normalizeSheet(grid);
    run.sources=[`Google Sheets ${grid.spreadsheetId}, tab ${grid.title} (gid ${grid.sheetId})`];
    run.warnings=parsed.warnings;run.errors=parsed.errors;run.discovered=parsed.rows.length;
    for(const {listing,evaluation} of parsed.rows){
      if(options.signal.aborted){run.errors.push('Import time budget reached; remaining rows will be retried on the next full sync.');break;}
      try{const saved=await options.store.saveListing(run.id,listing,evaluation);if(saved.created)run.added++;else run.updated++;run.evaluated++;}catch{run.errors.push(`Sheet row ${evaluation.imported!.row} could not be saved; existing property data retained.`);}
    }
    run.status=run.errors.length?'partial':'succeeded';run.completedAt=options.now();
    run.report=[`${run.added} new feed entries; ${run.updated} existing properties refreshed from the sheet.`,`${run.evaluated} rows imported. Agent recommendations and metrics are attributed to Google Sheets, not recalculated.`,...run.warnings,...run.errors,'Rows removed from the sheet do not delete properties or imply sold/off-market status.'];
    await options.store.finish(run,run.status==='succeeded'?run.startedAt:null);return run;
  }catch(error){
    run.status='failed';run.completedAt=options.now();run.errors.push(error instanceof Error?error.message:'Google Sheets import failed.');run.report=[...run.errors,'Existing properties, manual inputs and listing statuses were retained.'];
    await options.store.finish(run,null);return run;
  }
}
