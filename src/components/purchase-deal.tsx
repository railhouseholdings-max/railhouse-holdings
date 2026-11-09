'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function PurchaseDeal({save,price,today,disabled,owned}:{save:()=>Promise<{id:string;revision:number}|undefined>;price:number;today:string;disabled:boolean;owned:boolean}) {
  const router=useRouter();
  const [open,setOpen]=useState(false),[purchaseDate,setPurchaseDate]=useState(today),[purchasePrice,setPurchasePrice]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(owned)return <p className="note">This property is in <Link href="/properties?tab=mine">My Properties</Link>. Analysis figures remain estimates.</p>;
  const purchase=async()=>{
    if(busy||disabled)return;
    if(purchasePrice.trim()===''||!Number.isFinite(Number(purchasePrice))||Number(purchasePrice)<0){setError('Enter the actual purchase price.');return;}
    setBusy(true);setError('');
    try {
      const saved=await save();if(!saved)throw new Error('The analysis could not be saved. Check the save message and try again.');
      const response=await fetch('/api/deals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'purchase',dealId:saved.id,revision:saved.revision,purchaseDate,purchasePrice:Number(purchasePrice)})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??'Could not record purchase.');
      router.push('/properties?tab=mine');router.refresh();
    }catch(error){setError(error instanceof Error?error.message:'Could not record purchase.');}finally{setBusy(false);}
  };
  return <section className="purchase-deal"><h3>Purchased this property?</h3>{!open?<button type="button" className="button secondary" disabled={disabled} onClick={()=>{setPurchasePrice(String(price));setOpen(true);}}>Record purchase & add to My Properties</button>:<>
    <p className="note">Confirm the actual purchase price and date below. This saves your latest analysis and moves the same property record into My Properties. Rental, rehab and refinance estimates stay estimates.</p>
    <div className="input-grid"><label className="field"><span>Actual purchase price</span><input type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" required value={purchasePrice} onChange={e=>setPurchasePrice(e.target.value)} disabled={busy}/></label><label className="field"><span>Purchase date</span><input type="date" min="1900-01-01" max={today} required value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} disabled={busy}/></label></div>
    <div className="feed-card-actions"><button type="button" className="button" disabled={busy||disabled} onClick={()=>void purchase()}>{busy?'Recording purchase…':'Confirm purchase & move to My Properties'}</button><button type="button" className="text-link" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button></div>
  </>}{error&&<p className="error" role="alert">{error}</p>}</section>;
}
