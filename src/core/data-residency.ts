import type { Env } from './types.js';

export type ResidencyCheck={key:string;ok:boolean;required:boolean;label:string};
export type ResidencyStatus={mode:'eu_strict'|'standard';ready:boolean;checks:ResidencyCheck[];mailProvider:'cloudflare_email'|'none';blockers:string[];warnings:string[]};

function yes(v:unknown):boolean{return ['1','true','yes','eu'].includes(String(v??'').trim().toLowerCase());}
export function configuredMailProvider(env:Env):'cloudflare_email'|'none'{
  return !!env.EMAIL&&typeof env.EMAIL.send==='function'&&!!String(env.MAIL_FROM||'').trim()?'cloudflare_email':'none';
}
export function euStrict(env:Env):boolean{return String(env.DATA_RESIDENCY_MODE||'eu_strict').trim().toLowerCase()!=='standard';}

export function dataResidencyStatus(env:Env):ResidencyStatus{
  const strict=euStrict(env),provider=configuredMailProvider(env),mailConfigured=provider==='cloudflare_email',r2Eu=yes(env.EU_R2_JURISDICTION_ATTESTED),checks:ResidencyCheck[]=[
    {key:'d1_eu',ok:yes(env.EU_D1_JURISDICTION_ATTESTED),required:strict,label:'Produktive D1-Datenbank wurde mit Cloudflare-Jurisdiktion eu neu angelegt und verifiziert'},
    {key:'r2_eu',ok:r2Eu,required:strict,label:'Produktiver R2-Datei-/Dokumentspeicher wurde mit Cloudflare-Jurisdiktion eu neu angelegt und verifiziert'},
    {key:'backup_eu',ok:r2Eu,required:strict,label:'Produktive Backups werden ausschließlich über das verifizierte EU-R2-FILES-Binding gespeichert'},
    {key:'worker_eu',ok:yes(env.EU_WORKER_PROCESSING_ATTESTED),required:false,label:'Worker-Verarbeitung ist über Cloudflare Regional Services auf EU begrenzt'},
    {key:'metadata_eu',ok:yes(env.EU_METADATA_BOUNDARY_ATTESTED),required:false,label:'Cloudflare Customer Metadata Boundary ist für Logs/Analytics auf EU begrenzt'},
    {key:'mail_configured',ok:mailConfigured,required:true,label:'Cloudflare Email Service ist für Transaktions-E-Mail mit verifiziertem Absender konfiguriert'},
    {key:'mail_eu',ok:false,required:false,label:'Für Cloudflare Email Service ist keine ausschließliche EU-Verarbeitung behauptet; internationale technische Verarbeitung kann nicht allein aus D1/R2-Jurisdiktion abgeleitet werden'},
  ];
  const blockers=checks.filter(x=>x.required&&!x.ok).map(x=>x.label),warnings=checks.filter(x=>!x.required&&!x.ok).map(x=>x.label);
  return{mode:strict?'eu_strict':'standard',ready:blockers.length===0,checks,mailProvider:provider,blockers,warnings};
}

export function assertEuSafeMail(env:Env):void{
  if(configuredMailProvider(env)!=='cloudflare_email')throw new Error('CLOUDFLARE_EMAIL_REQUIRED');
  try{const u=new URL(String(env.APP_ORIGIN||''));if(u.protocol!=='https:')throw new Error();}catch{throw new Error('APP_ORIGIN_INVALID');}
}
