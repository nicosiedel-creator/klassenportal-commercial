import type { Env } from './types.js';

const requiredBrandingColumns={
  accent_color:"TEXT NOT NULL DEFAULT '#7c3aed'",
  surface_color:"TEXT NOT NULL DEFAULT '#f3f0ea'",
  text_color:"TEXT NOT NULL DEFAULT '#172033'",
} as const;

let ensured:Promise<void>|null=null;

function supportsDirectD1(env:Env):boolean{
  const statement=env.DB.prepare('SELECT 1');
  return typeof statement.all==='function'&&typeof statement.run==='function';
}

async function settingsColumns(env:Env):Promise<Set<string>>{
  const rows=await env.DB.prepare('PRAGMA table_info(tenant_settings)').all<{name:string}>();
  return new Set((rows.results??[]).map(x=>String(x.name)));
}

async function addColumnSafely(env:Env,name:keyof typeof requiredBrandingColumns,definition:string):Promise<void>{
  try{await env.DB.prepare(`ALTER TABLE tenant_settings ADD COLUMN ${name} ${definition}`).run();}
  catch(e){
    const current=await settingsColumns(env);
    if(!current.has(name))throw e;
  }
}

export async function brandingSchemaStatus(env:Env){
  if(!supportsDirectD1(env))return{ready:true,missing:[],adapterManaged:true};
  const current=await settingsColumns(env);
  const missing=Object.keys(requiredBrandingColumns).filter(x=>!current.has(x));
  return{ready:missing.length===0,missing,adapterManaged:false};
}

export async function ensureBrandingSchema(env:Env):Promise<void>{
  if(!supportsDirectD1(env))return;
  if(ensured)return ensured;
  ensured=(async()=>{
    let current=await settingsColumns(env);
    for(const [name,definition] of Object.entries(requiredBrandingColumns) as [keyof typeof requiredBrandingColumns,string][]){
      if(current.has(name))continue;
      await addColumnSafely(env,name,definition);
      current=await settingsColumns(env);
    }
    // Diese Funktion repariert ausschliesslich Schema, sie fasst keine Kundendaten an.
    // Frueher lief hier zusaetzlich eine Palettennormalisierung als UPDATE ohne tenant_id, also
    // ueber alle Mandanten - ausgeloest aus Lesepfaden wie getSettings und der oeffentlichen
    // Kursportalseite, ohne Auditeintrag. Dieselbe Normalisierung steht bereits in Migration
    // 0042_branding_palette.sql; Datenkorrekturen gehoeren dorthin, nicht in eine Laufzeitwache.
  })().catch(error=>{ensured=null;throw error;});
  return ensured;
}
