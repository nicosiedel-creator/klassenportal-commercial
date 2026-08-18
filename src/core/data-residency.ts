import type { Env } from './types.js';

export type ResidencyCheck={key:string;ok:boolean;required:boolean;label:string};
export type ResidencyStatus={mode:'eu_strict'|'standard';ready:boolean;checks:ResidencyCheck[];mailProvider:'brevo'|'resend'|'none';blockers:string[];warnings:string[]};

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
function explicitEuMail(env:Env):boolean{return String(env.MAIL_PROVIDER||'').trim().toLowerCase()==='brevo'&&!!String(env.BREVO_API_KEY||'').trim();}

export function dataResidencyStatus(env:Env):ResidencyStatus{
  const strict=euStrict(env),provider=configuredMailProvider(env),checks:ResidencyCheck[]=[
    {key:'d1_eu',ok:yes(env.EU_D1_JURISDICTION_ATTESTED),required:strict,label:'Produktive D1-Datenbank wurde mit Cloudflare-Jurisdiktion eu neu angelegt und verifiziert'},
    {key:'r2_eu',ok:yes(env.EU_R2_JURISDICTION_ATTESTED),required:strict,label:'Produktiver R2-Datei-/Dokumentspeicher wurde mit Cloudflare-Jurisdiktion eu neu angelegt und verifiziert'},
    {key:'backup_eu',ok:yes(env.EU_BACKUP_STORAGE_ATTESTED),required:strict,label:'Produktive Backups verbleiben in EU-jurisdiktionalem Speicher'},
    {key:'worker_eu',ok:yes(env.EU_WORKER_PROCESSING_ATTESTED),required:false,label:'Worker-Verarbeitung ist über Cloudflare Regional Services auf EU begrenzt'},
    {key:'metadata_eu',ok:yes(env.EU_METADATA_BOUNDARY_ATTESTED),required:false,label:'Cloudflare Customer Metadata Boundary ist für Logs/Analytics auf EU begrenzt'},
    {key:'mail_eu',ok:explicitEuMail(env),required:strict,label:'Transaktions- und Eingangsmail nutzt ausdrücklich MAIL_PROVIDER=brevo mit EU-gehostetem Brevo-Pfad'},
  ];
  const blockers=checks.filter(x=>x.required&&!x.ok).map(x=>x.label),warnings=checks.filter(x=>!x.required&&!x.ok).map(x=>x.label);
  return{mode:strict?'eu_strict':'standard',ready:blockers.length===0,checks,mailProvider:provider,blockers,warnings};
}

export function assertEuSafeMail(env:Env):void{
  if(euStrict(env)&&!explicitEuMail(env))throw new Error('EU_STRICT_MAIL_PROVIDER_REQUIRED');
}
