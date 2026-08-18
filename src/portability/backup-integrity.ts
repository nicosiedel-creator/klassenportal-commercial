export async function sha256Text(value:string):Promise<string>{
  const bytes=new TextEncoder().encode(value),digest=await crypto.subtle.digest('SHA-256',bytes);
  return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export function normalizeEtag(value:unknown):string{
  let v=String(value??'').trim();if(v.startsWith('W/'))v=v.slice(2).trim();
  if(v.startsWith('"')&&v.endsWith('"')&&v.length>=2)v=v.slice(1,-1);
  return v;
}

export function etagMatches(expected:unknown,actual:unknown):boolean{
  const a=normalizeEtag(expected),b=normalizeEtag(actual);return!!a&&!!b&&a===b;
}
