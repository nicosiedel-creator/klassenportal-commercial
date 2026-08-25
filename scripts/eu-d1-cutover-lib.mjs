import { createHash } from 'node:crypto';

export const EU_D1_SOURCE='klassenportal-commercial';
export const EU_D1_TARGET='klassenportal-commercial-eu';
export const EU_D1_TARGET_ID='a060de73-a4f6-4410-b4f2-25f5bee87754';
export const EU_D1_MARKER_TABLE='platform_eu_storage_cutover';
export const EU_D1_FREEZE_PREFIX='kp_eu_cutover_freeze_';
export const EU_D1_SCHEMA_ONLY_COUNTS={
  accounting_settings:1,
  billing_provider_state:1,
  commerce_policy:1,
  d1_migrations:69,
  legal_configuration:1,
  managed_setup_options:5,
  module_commerce_rules:5,
  plan_commerce_rules:3,
  plans:3,
  seller_billing_profile:1,
  stripe_provider_modes:2,
  users:2,
};
export const EU_D1_SCHEMA_ONLY_USERS=['system_intake_service','system_workflow_service'];
export const EU_D1_COMPOUND_SELECT_BATCH_SIZE=40;

export function sqlIdentifier(value){return `"${String(value).replaceAll('"','""')}"`;}
export function sqlText(value){return `'${String(value).replaceAll("'","''")}'`;}
export function chunkD1CompoundTerms(values,size=EU_D1_COMPOUND_SELECT_BATCH_SIZE){
  const width=Number(size);
  if(!Number.isSafeInteger(width)||width<1)throw new Error('EU_D1_COMPOUND_SELECT_BATCH_INVALID');
  const chunks=[];
  for(let index=0;index<values.length;index+=width)chunks.push(values.slice(index,index+width));
  return chunks;
}
export function freezeTriggerNames(table){
  const suffix=createHash('sha256').update(String(table)).digest('hex').slice(0,20);
  return ['insert','update','delete'].map(action=>`${EU_D1_FREEZE_PREFIX}${action[0]}_${suffix}`);
}
export function freezeSql(tables){
  const statements=['PRAGMA foreign_keys=OFF;'];
  for(const table of tables){
    const [insertName,updateName,deleteName]=freezeTriggerNames(table),target=sqlIdentifier(table);
    statements.push(`CREATE TRIGGER IF NOT EXISTS ${sqlIdentifier(insertName)} BEFORE INSERT ON ${target} BEGIN SELECT RAISE(ABORT,'EU_CUTOVER_SOURCE_FROZEN'); END;`);
    statements.push(`CREATE TRIGGER IF NOT EXISTS ${sqlIdentifier(updateName)} BEFORE UPDATE ON ${target} BEGIN SELECT RAISE(ABORT,'EU_CUTOVER_SOURCE_FROZEN'); END;`);
    statements.push(`CREATE TRIGGER IF NOT EXISTS ${sqlIdentifier(deleteName)} BEFORE DELETE ON ${target} BEGIN SELECT RAISE(ABORT,'EU_CUTOVER_SOURCE_FROZEN'); END;`);
  }
  return `${statements.join('\n')}\n`;
}
export function thawSql(tables){
  return `${tables.flatMap(freezeTriggerNames).map(name=>`DROP TRIGGER IF EXISTS ${sqlIdentifier(name)};`).join('\n')}\n`;
}
export function assertSchemaOnlyTarget({tables,counts,migrationNames,expectedMigrationNames,userIds}){
  const expectedTables=new Set(Object.keys(EU_D1_SCHEMA_ONLY_COUNTS)),actualCounts=new Map(Object.entries(counts||{}).map(([name,count])=>[String(name),Number(count)]));
  for(const table of tables){const count=actualCounts.get(String(table))??0;if(count>0&&!expectedTables.has(String(table)))throw new Error(`EU_D1_TARGET_NOT_EMPTY:${table}:${count}`);}
  for(const [table,expected] of Object.entries(EU_D1_SCHEMA_ONLY_COUNTS))if((actualCounts.get(table)??0)!==expected)throw new Error(`EU_D1_TARGET_SCHEMA_ONLY_COUNT_MISMATCH:${table}:${actualCounts.get(table)??0}:${expected}`);
  const actualMigrations=[...(migrationNames||[])].map(String).sort(),expectedMigrations=[...(expectedMigrationNames||[])].map(String).sort();
  if(JSON.stringify(actualMigrations)!==JSON.stringify(expectedMigrations))throw new Error('EU_D1_TARGET_SCHEMA_ONLY_MIGRATIONS_MISMATCH');
  const actualUsers=[...(userIds||[])].map(String).sort();
  if(JSON.stringify(actualUsers)!==JSON.stringify(EU_D1_SCHEMA_ONLY_USERS))throw new Error('EU_D1_TARGET_SCHEMA_ONLY_USERS_MISMATCH');
  return true;
}
export function resetSchemaSql(tables,views=[]){
  const statements=['PRAGMA foreign_keys=OFF;',...views.map(name=>`DROP VIEW IF EXISTS ${sqlIdentifier(name)};`),...tables.map(name=>`DROP TABLE IF EXISTS ${sqlIdentifier(name)};`)];
  return `${statements.join('\n')}\n`;
}
export function normalizeD1Export(value){
  return String(value).replace(/\r\n/g,'\n').replace(/^--.*$/gm,'').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
}
export function exportDigest(value){return createHash('sha256').update(normalizeD1Export(value)).digest('hex');}
export function assertMatchingExports(source,target){
  const sourceDigest=exportDigest(source),targetDigest=exportDigest(target);
  if(sourceDigest!==targetDigest)throw new Error(`EU_D1_EXPORT_MISMATCH:${sourceDigest}:${targetDigest}`);
  return sourceDigest;
}
export function parseWranglerJson(text){
  const clean=String(text||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const starts=[clean.indexOf('['),clean.indexOf('{')].filter(x=>x>=0).sort((a,b)=>a-b);
  for(const start of starts){try{return JSON.parse(clean.slice(start));}catch{}}
  throw new Error('WRANGLER_JSON_PARSE_FAILED');
}
export function wranglerRows(value){
  const rows=[],seen=new Set();
  function walk(x){
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){for(const item of x)walk(item);return;}
    if(Array.isArray(x.results))for(const row of x.results)if(row&&typeof row==='object'){const key=JSON.stringify(row);if(!seen.has(key)){seen.add(key);rows.push(row);}}
    for(const [key,val] of Object.entries(x))if(key!=='results')walk(val);
  }
  walk(value);return rows;
}
