import type { Env } from './types.js';

export type ResidencyCheck={key:string;ok:boolean;required:boolean;label:string};
export type ResidencyStatus={mode:'eu_strict'|'standard';ready:boolean;checks:ResidencyCheck[];mailProvider:'brevo'|'resend'|'none';blockers:string[]};

function yes(v:unknown):boolean{return ['1','true','yes','eu'].includes(String(v??'').trim().toLowerCase());}
export function configuredMailProvider(env:Env):'brevo'|'resend'|'none'{
  const explicit=String(env.MAIL_PROVIDER||'').trim().toLowerCase();
  if(explicit==='brevo')return env.BREVO_API_KEY?'brevo':'none';
  if(explicit==='resend')return env.RESEND_API_KEY?'resend':'none';
  if(env.BREVO_API_KEY)return'brevo';
  if(env.RESEND_API_KEY)return'resend';
  return'none';
}
export function euStrict(env:Env):boolean{return String(env.DATA_RESIDENCY_MODE||'eu_strict').trim().toLowerCase()!=='standard';}

export function dataResidencyStatus(env:Env):ResidencyStatus{
  const strict=euStrict(env),provider=configuredMailProvider(env),checks:ResidencyCheck[]=[
    {key:'d1_eu',ok:yes(env.EU_D1_JURISDICTION_ATTESTED),required:strict,label:'Produktive D1-Datenbank wurde mit Cloudflare-Jurisdiktion eu neu angelegt und verifiziert'},
    {key:'r2_eu',ok:yes(env.EU_R2_JURISDICTION_ATTESTED),required:strict,label:'Produktiver R2-Datei-/Dokumentspeicher wurde mit Cloudflare-Jurisdiktion eu neu angelegt und verifiziert'},
    {key:'backup_eu',ok:yes(env.EU_BACKUP_STORAGE_ATTESTED),required:strict,label:'Produktive Backups verbleiben in EU-jurisdiktionalem Speicher'},
    {key:'worker_eu',ok:yes(env.EU_WORKER_PROCESSING_ATTESTED),required:false,label:'Worker-Verarbeitung ist über Cloudflare Regional Services auf EU begrenzt'},
    {key:'mail_eu',ok:provider==='brevo',required:strict,label:'Transaktions- und Eingangsmail nutzt den EU-gehosteten Brevo-Pfad'},
  ];
  const blockers=checks.filter(x=>x.required&&!x.ok).map(x=>x.label);
  return{mode:strict?'eu_strict':'standard',ready:blockers.length===0,checks,mailProvider:provider,blockers};
}

export function assertEuSafeMail(env:Env):void{
  if(euStrict(env)&&configuredMailProvider(env)!=='brevo')throw new Error('EU_STRICT_MAIL_PROVIDER_REQUIRED');
}
