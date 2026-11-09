import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyAddedDate,isUnseenProperty } from '../src/lib/deals/feed-presentation.ts';
import { listingPhotoUrl } from '../src/lib/deals/listing-photo.ts';
import { normalizeSheet } from '../src/lib/sheets/import.ts';
import type { SheetGrid } from '../src/lib/sheets/client.ts';
test('added date uses the original source calendar date, independently of later imports',()=>{
  assert.equal(propertyAddedDate('2026-10-16','2026-11-09T14:00:00Z','2026-11-09T14:00:00Z'),'2026-10-16');
  assert.equal(propertyAddedDate('10/16/2026','2026-12-01T14:00:00Z','2026-11-09T14:00:00Z'),'2026-10-16');
  assert.equal(propertyAddedDate('2026-10-26T23:00:00-05:00',null,null),'2026-10-26');
  assert.equal(propertyAddedDate('', '2026-11-01T01:00:00Z','2026-10-31T12:00:00Z'),'2026-10-31');
  assert.equal(propertyAddedDate('bad date',null,'2026-11-09T14:00:00Z'),'2026-11-09');
  assert.equal(propertyAddedDate(undefined,undefined,undefined),null);
});
test('only unread discovered prospects are New; daily updates cannot erase the read marker',()=>{
  assert.equal(isUnseenProperty({lifecycle:'prospect',firstViewedAt:null}),true);
  assert.equal(isUnseenProperty({lifecycle:'prospect',firstViewedAt:'2026-11-09T14:00:00Z'}),false);
  assert.equal(isUnseenProperty({lifecycle:'prospect',deal:{id:'saved-manual-analysis'}}),false);
  assert.equal(isUnseenProperty({lifecycle:'owned'}),false);
});
test('photo URLs use supplied public HTTPS links and reject scripts, credentials and local network targets',()=>{
  assert.equal(listingPhotoUrl('https://photos.zillowstatic.com/fp/synthetic-example.jpg'),'https://photos.zillowstatic.com/fp/synthetic-example.jpg');
  assert.equal(listingPhotoUrl('https://ap.rdcpix.com/synthetic-example.webp?width=720'),'https://ap.rdcpix.com/synthetic-example.webp?width=720');
  for(const url of ['javascript:alert(1)','data:image/png;base64,test','http://example.com/photo.jpg','https://user:secret@example.com/photo.jpg','https://127.0.0.1/photo','https://2130706433/photo','https://10.0.0.1/photo','https://169.254.169.254/latest/meta-data','https://192.168.1.1/photo','https://172.16.0.1/photo','https://[::1]/photo','https://localhost/photo'])assert.equal(listingPhotoUrl(url),null,url);
});
test('optional sheet Photo URL/hyperlink is imported without a photo lookup or invented usage license',()=>{
  const grid:SheetGrid={spreadsheetId:'SYNTHETIC_sheet_photo_fixture',sheetId:0,title:'SYNTHETIC',fetchedAt:'2026-11-09T14:00:00Z',values:[['Address','City','ZIP','Status','Photo URL','Photo Credit'],['100 SYNTHETIC Ln','Fort Wayne','46802','Active','View photo','SYNTHETIC listing agent']],hyperlinks:{1:{4:'https://photos.zillowstatic.com/fp/synthetic-example.jpg'}}};
  const row=normalizeSheet(grid).rows[0];assert.equal(row.listing.photos.length,1);assert.equal(row.listing.photos[0].url,'https://photos.zillowstatic.com/fp/synthetic-example.jpg');assert.equal(row.listing.photos[0].licensed,false);assert.equal(row.listing.photos[0].source,'SYNTHETIC listing agent');
  grid.hyperlinks={};grid.values[1][4]='javascript:alert(1)';assert.equal(normalizeSheet(grid).rows[0].listing.photos.length,0);
  grid.values[1][4]='';assert.equal(normalizeSheet(grid).rows[0].listing.photos.length,0);
});
