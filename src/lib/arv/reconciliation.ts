/** Reconcile only evidence-backed indications. Bounds are observed indications, not a premium. */
export function reconcileIndications(indications:{value:number;weight:number}[],weakEvidence:boolean) {
  if(!indications.length||indications.some(c=>!Number.isFinite(c.value)||c.value<=0||!Number.isFinite(c.weight)||c.weight<0))throw new Error('Invalid adjusted indications.');
  const sorted=[...indications].sort((a,b)=>a.value-b.value);const total=sorted.reduce((sum,c)=>sum+c.weight,0);
  if(total<=0)throw new Error('Reconciliation weights must have positive mass.');
  const mean=sorted.reduce((sum,c)=>sum+c.value*c.weight,0)/total;
  const quantile=(q:number)=>{let cumulative=0;for(const item of sorted){cumulative+=item.weight/total;if(cumulative>=q)return item.value;}return sorted.at(-1)!.value;};
  const lower=weakEvidence?sorted[0].value:quantile(0.15),upper=weakEvidence?sorted.at(-1)!.value:quantile(0.85);
  return {conservativeArv:Math.floor(Math.min(lower,mean)/100)*100,likelyArv:Math.round(mean/100)*100,highArv:Math.ceil(Math.max(upper,mean)/100)*100};
}
