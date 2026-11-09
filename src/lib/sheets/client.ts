import { createHash, createSign } from 'node:crypto';
export const DEFAULT_SCOUT_SHEET_ID='1pwGmqgLpAZ_WWqduYLaVDctTHcY4KiiTQXsyF5QroBw';
export interface SheetGrid {spreadsheetId:string;sheetId:number;title:string;values:string[][];hyperlinks:Record<number,Record<number,string>>;fetchedAt:string}
const TOKEN_URL='https://oauth2.googleapis.com/token';
const tokenCache=new Map<string,{token:string;expires:number}>();
async function boundedJson(response:Response):Promise<unknown>{
  if(!response.ok){await response.body?.cancel();throw new Error(response.status===401||response.status===403?'Google Sheets access denied. Enable the Sheets API and share the sheet with the service-account email as Viewer.':`Google Sheets request failed (HTTP ${response.status}).`);}
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty Google Sheets response.');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000)throw new Error('Sheet response exceeds 5 MB; narrow the source tab.');chunks.push(value);}}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
interface Credentials {client_email:string;private_key:string}
function credentials(raw:string):Credentials {
  let c:Credentials;try{c=JSON.parse(raw);}catch{throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON must contain the service-account JSON credential.');}
  if(!c||typeof c.client_email!=='string'||!c.client_email.endsWith('.gserviceaccount.com')||typeof c.private_key!=='string'||!c.private_key.includes('PRIVATE KEY'))throw new Error('Invalid Google Sheets service-account credential.');
  return {client_email:c.client_email,private_key:c.private_key.replace(/\\n/g,'\n')};
}
export async function readScoutSheet(options:{credentialJson:string;spreadsheetId?:string;sheetId?:number;fetcher?:typeof fetch;signal?:AbortSignal;now?:()=>Date}):Promise<SheetGrid> {
  const spreadsheetId=options.spreadsheetId??DEFAULT_SCOUT_SHEET_ID,sheetId=options.sheetId??0;
  if(!/^[A-Za-z0-9_-]{20,120}$/.test(spreadsheetId)||!Number.isSafeInteger(sheetId)||sheetId<0)throw new Error('Invalid source spreadsheet or tab ID.');
  const c=credentials(options.credentialJson),fetcher=options.fetcher??fetch,now=options.now??(()=>new Date());
  const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000);
  const cacheKey=createHash('sha256').update(c.client_email+c.private_key).digest('hex');const cached=tokenCache.get(cacheKey);
  let token=cached&&cached.expires>now().getTime()+60000?cached.token:null;
  if(!token){
    const iat=Math.floor(now().getTime()/1000);const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:TOKEN_URL,iat,exp:iat+3600})}`;
    let assertion:string;try{assertion=`${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(c.private_key,'base64url')}`;}catch{throw new Error('Google Sheets private key could not be loaded.');}
    const raw=await boundedJson(await fetcher(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal,cache:'no-store',redirect:'error'})) as {access_token?:string;expires_in?:number};
    if(!raw.access_token||!Number.isFinite(raw.expires_in)||raw.expires_in!<=0)throw new Error('Google did not issue a usable Sheets access token.');
    token=raw.access_token;if(tokenCache.size>4)tokenCache.clear();tokenCache.set(cacheKey,{token,expires:now().getTime()+Math.min(raw.expires_in!,3600)*1000});
  }
  const get=async(params:URLSearchParams)=>{
    const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);url.search=params.toString();
    return boundedJson(await fetcher(url,{headers:{Authorization:`Bearer ${token}`},signal,cache:'no-store',redirect:'error'}));
  };
  const metadata=await get(new URLSearchParams({fields:'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))'})) as {sheets?:{properties:{sheetId:number;title:string;gridProperties:{rowCount:number;columnCount:number}}}[]};
  const tab=metadata.sheets?.find(s=>s.properties.sheetId===sheetId)?.properties;
  if(!tab||!tab.title||!Number.isInteger(tab.gridProperties?.columnCount))throw new Error('The configured Google Sheets tab was not found.');
  if(tab.gridProperties.columnCount>200)throw new Error('The source tab has more than 200 columns. Use a dedicated import tab with at most 200 columns.');
  const columnName=(n:number)=>{let name='';for(;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  const range=`'${tab.title.replace(/'/g,"''")}'!A1:${columnName(tab.gridProperties.columnCount)}${Math.min(tab.gridProperties.rowCount,5002)}`;
  const grid=await get(new URLSearchParams({ranges:range,fields:'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(formattedValue,hyperlink))))'})) as {sheets?:{properties:{sheetId:number};data?:{startRow?:number;startColumn?:number;rowData?:{values?:{formattedValue?:string;hyperlink?:string}[]}[]}[]}[]};
  const data=grid.sheets?.find(s=>s.properties.sheetId===sheetId)?.data;if(!data)throw new Error('Google Sheets did not return the requested tab data.');
  const values:string[][]=[],hyperlinks:SheetGrid['hyperlinks']={};
  for(const block of data)for(const [r,row] of (block.rowData??[]).entries()){
    const index=(block.startRow??0)+r;values[index]??=[];
    for(const [col,cell] of (row.values??[]).entries()){
      const j=(block.startColumn??0)+col;values[index][j]=cell.formattedValue??'';
      if(cell.hyperlink){hyperlinks[index]??={};hyperlinks[index][j]=cell.hyperlink;}
    }
  }
  while(values.length&&!values.at(-1)?.some(v=>v?.trim()))values.pop();
  if(values.length>5001)throw new Error('Source tab exceeds 5,000 data rows; import refused to avoid silently truncating records.');
  return {spreadsheetId,sheetId,title:tab.title,values,hyperlinks,fetchedAt:now().toISOString()};
}
