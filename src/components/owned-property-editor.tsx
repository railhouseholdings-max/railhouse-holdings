'use client';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { OWNED_FIELDS } from '@/lib/persistence/owned-fields';
const headings:Record<string,string>={property:'Property facts',finance:'Acquisition, renovation & invested capital',operations:'Rent & operating costs',loan:'Financing',valuation:'Valuation',lease:'Signed lease (leave blank without a lease)'};
export function OwnedPropertyEditor({id,revision,initial}:{id:string;revision:number;initial:Record<string,string|number|null>}) {
  const [values,setValues]=useState(initial),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const first=useRef<HTMLInputElement>(null);const router=useRouter();
  const save=async()=>{
    if(!editing||busy)return;setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/properties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision,values})});
      const body=await response.json();if(!response.ok)throw new Error(body.error??'Could not save property.');
      setEditing(false);setMessage('Saved and locked. Dashboard and portfolio now use these records.');router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:'Could not save property.');}finally{setBusy(false);}
  };
  return <section className="panel owned-property-editor"><h2>Recorded property values</h2><p className="note">{editing?'Editing unlocked. Blank means not recorded. Review changes before saving.':'Locked to prevent accidental changes. Use Edit property at the bottom to unlock these fields.'} Target rent is a projection; only enter signed lease rent when supported by a lease.</p>
    <fieldset disabled={!editing||busy} className="owned-fields">{Object.entries(headings).map(([group,title])=><details key={group} open={group==='property'}><summary>{title}</summary><div className="input-grid">{OWNED_FIELDS.filter(f=>f[0]===group).map(([section,key,label,type],i)=>{const path=`${section}.${key}`;return <label className="field" key={path}><span>{label}</span>{type==='status'?<select value={String(values[path]??'Owned')} onChange={e=>setValues({...values,[path]:e.target.value})}>{['Owned','Rented','Rehab','Vacant'].map(v=><option key={v}>{v}</option>)}</select>:<input ref={group==='property'&&i===0?first:undefined} type={type==='date'?'date':type==='text'?'text':'number'} inputMode={type==='text'||type==='date'?undefined:'decimal'} step={type==='text'||type==='date'?undefined:'any'} min={type==='signed'?undefined:0} maxLength={500} value={values[path]??''} onChange={e=>setValues({...values,[path]:type==='text'||type==='date'?e.target.value:e.target.value===''?null:Number(e.target.value)})}/>}</label>;})}</div></details>)}</fieldset>
    <div className="feed-card-actions">{editing?<><button type="button" className="button" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save & lock property'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setValues(initial);setEditing(false);setMessage('Changes discarded. Property locked.');}}>Cancel & lock</button></>:<button type="button" className="button secondary" onClick={()=>{setEditing(true);setMessage('');requestAnimationFrame(()=>{first.current?.focus();first.current?.scrollIntoView({behavior:'smooth',block:'center'});});}}>Edit property</button>}</div><p className="note" role="status">{message}</p>
  </section>;
}
