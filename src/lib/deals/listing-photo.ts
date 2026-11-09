/** Validate display URLs. Server-side archival additionally restricts fetches to known image CDNs. */
export function listingPhotoUrl(value:string|undefined):string|null {
  if(!value||value.length>4096)return null;
  try {
    const url=new URL(value),host=url.hostname.toLowerCase().replace(/\.$/,'');
    if(url.protocol!=='https:'||url.username||url.password||url.port&&!['443'].includes(url.port)||!host.includes('.')||host.includes(':')||/(?:^|\.)(?:localhost|local|internal)$/.test(host))return null;
    if(/^\d+\.\d+\.\d+\.\d+$/.test(host)){
      const [a,b]=host.split('.').map(Number);
      if(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224)return null;
    }
    return url.href;
  }catch{return null;}
}
