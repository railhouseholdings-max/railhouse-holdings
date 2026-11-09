import { validatePurchase } from '@/lib/persistence/property-ownership';
import { randomUUID } from 'node:crypto';
import { cloudConfig, dataMode } from '@/lib/config/cloud';
import { ownerSession } from '@/lib/cloud/session';
import { isSameOriginWrite, restRequest } from '@/lib/cloud/http';
import { validateSaveDeal, toDealRows } from '@/lib/persistence/deal-records';
import { lookupRentalSnapshot } from '@/lib/taxes/rental-snapshot';
import { estimateCountyRentalTaxes, selectAnnualTaxes, withSelectedPropertyTaxes } from '@/lib/calculations/tax-estimate';
export async function POST(request: Request) {
  const headers = {'Cache-Control':'no-store'};
  if (dataMode() !== 'supabase') return Response.json({error:'Saving is disabled in demo mode.'},{status:403,headers});
  const config=cloudConfig();
  if (!isSameOriginWrite(request,config.origin)) return Response.json({error:'Invalid request origin.'},{status:403,headers});
  const session=await ownerSession();
  if (!session) return Response.json({error:'Sign in again before saving. Your inputs remain in this tab.'},{status:401,headers});
  let validated;
  try {
    const raw=await request.text();
    if (raw.length>32000) return Response.json({error:'Deal is too large.'},{status:413,headers});
    const body=JSON.parse(raw);
    if(body.operation==='purchase'){
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const purchase=validatePurchase(body,today);
      const saved=await restRequest(config,session,'rpc/purchase_deal',{method:'POST',body:JSON.stringify({p_deal:purchase.dealId,p_revision:purchase.revision,p_price:purchase.purchasePrice,p_date:purchase.purchaseDate})});
      return Response.json(saved,{headers});
    }
    validated=validateSaveDeal(body);
    // Recompute county taxes from trusted server data. Never accept client outputs as authoritative.
    const match=lookupRentalSnapshot({address:validated.address,parcelId:validated.taxAssumptions.parcelId});
    const county=estimateCountyRentalTaxes(match.status==='found'?match.parcel:null,match.status==='found'?match.metadata:null,validated.inputs.monthlyRent,validated.taxAssumptions.payableYear);
    const selection=selectAnnualTaxes(validated.taxAssumptions.annualOverride===null?'':String(validated.taxAssumptions.annualOverride),county);
    validated.inputs=withSelectedPropertyTaxes(validated.inputs,selection);
    const rows=toDealRows(validated,match);
    const id=validated.id??randomUUID();
    const saved=await restRequest<{id:string;revision:number;updated_at:string}>(config,session,'rpc/save_deal',{method:'POST',body:JSON.stringify({p_id:id,p_expected_revision:validated.expectedRevision,p_deal:rows.deal,p_adjustments:rows.adjustments,p_taxes:rows.taxes})});
    return Response.json(saved,{headers});
  } catch (error) {
    const message=error instanceof Error?error.message:'Could not save deal.';
    const conflict=message.includes('another session');
    return Response.json({error:message},{status:conflict?409:400,headers});
  }
}
