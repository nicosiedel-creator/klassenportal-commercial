import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EU_D1_FREEZE_PREFIX,EU_D1_MARKER_TABLE,EU_D1_SOURCE,EU_D1_TARGET,EU_D1_TARGET_ID,
  assertMatchingExports,assertSchemaOnlyTarget,freezeSql,parseWranglerJson,resetSchemaSql,sqlIdentifier,sqlText,thawSql,wranglerRows,
} from './eu-d1-cutover-lib.mjs';

const branch=String(process.env.WORKERS_CI_BRANCH||'').trim();
if(String(process.env.WORKERS_CI||'')!=='1'||branch!=='main'){
  console.log(`Skipping EU D1 production cutover outside the main Workers Build${branch?`: ${branch}`:''}.`);
  process.exit(0);
}

const npx=process.platform==='win32'?'npx.cmd':'npx';
function run(args,{capture=false}={}){
  return execFileSync(npx,['wrangler',...args],{encoding:'utf8',stdio:capture?['ignore','pipe','inherit']:'inherit'})||'';
}
function query(database,sql){
  return wranglerRows(parseWranglerJson(run(['d1','execute',database,'--remote','--json','--command',sql],{capture:true})));
}
function executeFile(database,file){run(['d1','execute',database,'--remote','--yes','--file',file]);}
function exportDatabase(database,file){run(['d1','export',database,'--remote','--output',file]);}
function marker(){
  const exists=query(EU_D1_TARGET,`SELECT name FROM sqlite_master WHERE type='table' AND name=${sqlText(EU_D1_MARKER_TABLE)};`).some(row=>row.name===EU_D1_MARKER_TABLE);
  if(!exists)return null;
  return query(EU_D1_TARGET,`SELECT source_database,target_database_id,source_export_sha256 FROM ${EU_D1_MARKER_TABLE} WHERE id=1;`)[0]||null;
}

const existing=marker();
if(existing){
  if(existing.source_database!==EU_D1_SOURCE||existing.target_database_id!==EU_D1_TARGET_ID||!/^[a-f0-9]{64}$/.test(String(existing.source_export_sha256||'')))throw new Error('EU_D1_CUTOVER_MARKER_INVALID');
  console.log(`Verified existing EU D1 cutover marker for ${EU_D1_TARGET_ID}; source remains frozen and import is not repeated.`);
  process.exit(0);
}

let targetTables=query(EU_D1_TARGET,`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;`).map(row=>String(row.name));
if(targetTables.length){
  const targetViews=query(EU_D1_TARGET,`SELECT name FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;`).map(row=>String(row.name));
  const countSql=targetTables.map(name=>`SELECT ${sqlText(name)} name,COUNT(*) n FROM ${sqlIdentifier(name)}`).join(' UNION ALL '),counts=Object.fromEntries(query(EU_D1_TARGET,countSql).map(row=>[String(row.name),Number(row.n||0)]));
  const migrationNames=query(EU_D1_TARGET,'SELECT name FROM d1_migrations ORDER BY name;').map(row=>String(row.name));
  const expectedMigrationNames=readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort();
  const userIds=query(EU_D1_TARGET,'SELECT id FROM users ORDER BY id;').map(row=>String(row.id));
  assertSchemaOnlyTarget({tables:targetTables,counts,migrationNames,expectedMigrationNames,userIds});
  const resetFile=join(mkdtempSync(join(tmpdir(),'klassenportal-eu-d1-reset-')),'reset-target.sql');
  writeFileSync(resetFile,resetSchemaSql(targetTables,targetViews),'utf8');
  console.log(`Resetting the verified schema-only EU D1 target left by the interrupted ${EU_D1_TARGET_ID} deployment.`);
  executeFile(EU_D1_TARGET,resetFile);
  targetTables=query(EU_D1_TARGET,`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;`).map(row=>String(row.name));
  if(targetTables.length)throw new Error(`EU_D1_TARGET_SCHEMA_RESET_FAILED:${targetTables.join(',')}`);
}
const sourceTables=query(EU_D1_SOURCE,`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND COALESCE(sql,'') NOT LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name;`).map(row=>String(row.name));
if(!sourceTables.length)throw new Error('EU_D1_SOURCE_EMPTY');

const work=mkdtempSync(join(tmpdir(),'klassenportal-eu-d1-'));
const freezeFile=join(work,'freeze-source.sql'),thawFile=join(work,'thaw-target.sql'),sourceExport=join(work,'source.sql'),targetExport=join(work,'target.sql'),markerFile=join(work,'marker.sql');
writeFileSync(freezeFile,freezeSql(sourceTables),'utf8');
writeFileSync(thawFile,thawSql(sourceTables),'utf8');
let sourceFrozen=false,targetVerified=false;
try{
  console.log(`Freezing ${sourceTables.length} source tables before the exact D1 snapshot.`);
  sourceFrozen=true;executeFile(EU_D1_SOURCE,freezeFile);
  const expectedTriggers=sourceTables.length*3,actualTriggers=Number(query(EU_D1_SOURCE,`SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE ${sqlText(`${EU_D1_FREEZE_PREFIX}%`)};`)[0]?.n||0);
  if(actualTriggers!==expectedTriggers)throw new Error(`EU_D1_SOURCE_FREEZE_INCOMPLETE:${actualTriggers}:${expectedTriggers}`);
  exportDatabase(EU_D1_SOURCE,sourceExport);
  executeFile(EU_D1_TARGET,sourceExport);
  exportDatabase(EU_D1_TARGET,targetExport);
  const sourceSql=readFileSync(sourceExport,'utf8'),targetSql=readFileSync(targetExport,'utf8'),digest=assertMatchingExports(sourceSql,targetSql);
  targetVerified=true;
  executeFile(EU_D1_TARGET,thawFile);
  const remainingTargetTriggers=Number(query(EU_D1_TARGET,`SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE ${sqlText(`${EU_D1_FREEZE_PREFIX}%`)};`)[0]?.n||0);
  if(remainingTargetTriggers!==0)throw new Error('EU_D1_TARGET_THAW_FAILED');
  const commit=String(process.env.WORKERS_CI_COMMIT_SHA||'').trim();
  writeFileSync(markerFile,`CREATE TABLE ${EU_D1_MARKER_TABLE} (id INTEGER PRIMARY KEY CHECK(id=1),source_database TEXT NOT NULL,target_database_id TEXT NOT NULL,source_export_sha256 TEXT NOT NULL,cutover_commit TEXT NOT NULL,verified_at TEXT NOT NULL);\nINSERT INTO ${EU_D1_MARKER_TABLE}(id,source_database,target_database_id,source_export_sha256,cutover_commit,verified_at) VALUES(1,${sqlText(EU_D1_SOURCE)},${sqlText(EU_D1_TARGET_ID)},${sqlText(digest)},${sqlText(commit)},${sqlText(new Date().toISOString())});\n`,'utf8');
  executeFile(EU_D1_TARGET,markerFile);
  const verified=marker();
  if(!verified||verified.source_export_sha256!==digest)throw new Error('EU_D1_CUTOVER_MARKER_WRITE_FAILED');
  console.log(`EU D1 cutover verified byte-for-byte (${digest}); old source is write-frozen and target is ready.`);
}catch(error){
  if(sourceFrozen&&!targetVerified){
    try{executeFile(EU_D1_SOURCE,thawFile);console.error('Restored source writes because the target was not verified.');}
    catch(cleanupError){console.error('CRITICAL: source freeze cleanup failed.',cleanupError);}
  }
  throw error;
}
