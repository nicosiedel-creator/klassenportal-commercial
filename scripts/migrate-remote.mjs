import { execFileSync } from 'node:child_process';

const WRANGLER=['wrangler'];
const npx=process.platform==='win32'?'npx.cmd':'npx';
const branch=String(process.env.WORKERS_CI_BRANCH||'').trim();
const workersBuild=String(process.env.WORKERS_CI||'')==='1';
const productionBranch='main';
const brandingMigration='0042_branding_palette.sql';
const brandingColumns={
  accent_color:"TEXT NOT NULL DEFAULT '#7c3aed'",
  surface_color:"TEXT NOT NULL DEFAULT '#f3f0ea'",
  text_color:"TEXT NOT NULL DEFAULT '#172033'",
};

function run(args,{capture=false}={}){
  return execFileSync(npx,[...WRANGLER,...args],{
    encoding:'utf8',
    stdio:capture?['ignore','pipe','inherit']:'inherit',
  })||'';
}

function parseJson(text){
  const clean=String(text||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  if(!clean)return null;
  const starts=[clean.indexOf('['),clean.indexOf('{')].filter(x=>x>=0).sort((a,b)=>a-b);
  for(const start of starts){
    try{return JSON.parse(clean.slice(start));}catch{}
  }
  throw new Error('WRANGLER_JSON_PARSE_FAILED');
}

function rowsFrom(value){
  const rows=[];
  const seen=new Set();
  function walk(x){
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){
      for(const item of x)walk(item);
      return;
    }
    if(Array.isArray(x.results)){
      for(const row of x.results){
        if(row&&typeof row==='object'){
          const key=JSON.stringify(row);
          if(!seen.has(key)){seen.add(key);rows.push(row);}
        }
      }
    }
    for(const [key,val] of Object.entries(x))if(key!=='results')walk(val);
  }
  walk(value);
  return rows;
}

function queryRows(sql){
  const out=run(['d1','execute','DB','--remote','--json','--command',sql],{capture:true});
  return rowsFrom(parseJson(out));
}

function applyNormalMigrations(){
  run(['d1','migrations','apply','DB','--remote']);
}

if(workersBuild&&branch&&branch!==productionBranch){
  console.log(`Skipping remote D1 migrations on non-production Workers Build branch: ${branch}`);
  process.exit(0);
}

let currentColumns=[];
try{
  currentColumns=queryRows("SELECT name FROM pragma_table_info('tenant_settings') WHERE name IN ('accent_color','surface_color','text_color') ORDER BY name;")
    .map(row=>String(row.name||''))
    .filter(Boolean);
}catch{
  console.log('Remote tenant_settings schema is not yet queryable; using normal Wrangler migrations.');
  applyNormalMigrations();
  process.exit(0);
}

let migrationApplied=false;
try{
  migrationApplied=queryRows(`SELECT name FROM d1_migrations WHERE name='${brandingMigration}';`)
    .some(row=>String(row.name||'')===brandingMigration);
}catch{
  console.log('Remote d1_migrations history is not yet queryable; using normal Wrangler migrations.');
  applyNormalMigrations();
  process.exit(0);
}

const present=new Set(currentColumns);
if(!migrationApplied&&present.size>0){
  console.log(`Reconciling known branding schema drift before ${brandingMigration}.`);
  for(const [name,definition] of Object.entries(brandingColumns)){
    if(present.has(name))continue;
    console.log(`Adding missing branding column ${name}.`);
    run(['d1','execute','DB','--remote','--yes','--command',`ALTER TABLE tenant_settings ADD COLUMN ${name} ${definition};`]);
  }

  run(['d1','execute','DB','--remote','--yes','--command',
    "UPDATE tenant_settings SET background_color='#ece8df' WHERE lower(background_color) IN ('#ffffff','#fefefe','#fafafa','#f9fafb','#f8fafc');"
  ]);
  run(['d1','execute','DB','--remote','--yes','--command',
    `INSERT INTO d1_migrations (name) SELECT '${brandingMigration}' WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name='${brandingMigration}');`
  ]);

  const verifiedColumns=new Set(queryRows("SELECT name FROM pragma_table_info('tenant_settings') WHERE name IN ('accent_color','surface_color','text_color') ORDER BY name;")
    .map(row=>String(row.name||'')));
  const verifiedMigration=queryRows(`SELECT name FROM d1_migrations WHERE name='${brandingMigration}';`)
    .some(row=>String(row.name||'')===brandingMigration);
  if(Object.keys(brandingColumns).some(name=>!verifiedColumns.has(name))||!verifiedMigration){
    throw new Error('BRANDING_MIGRATION_RECONCILIATION_FAILED');
  }
  console.log(`Reconciled ${brandingMigration} without overwriting existing branding values.`);
}

applyNormalMigrations();
