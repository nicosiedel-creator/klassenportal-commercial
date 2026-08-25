import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EU_D1_FREEZE_PREFIX,EU_D1_MARKER_TABLE,EU_D1_SOURCE,EU_D1_TARGET,EU_D1_TARGET_ID,
  assertMatchingExports,assertSchemaOnlyTarget,freezeSql,inspectD1Export,parseWranglerJson,resetSchemaSql,sqlIdentifier,sqlText,thawSql,wranglerRows,
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

const work=mkdtempSync(join(tmpdir(),'klassenportal-eu-d1-'));
const markerFile=join(work,'marker.sql'),targetThawFile=join(work,'thaw-target.sql');
function freezeTriggerNames(database){
  return query(database,`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE ${sqlText(`${EU_D1_FREEZE_PREFIX}%`)} ORDER BY name;`).map(row=>String(row.name));
}
function thawVerifiedTarget(){
  const names=freezeTriggerNames(EU_D1_TARGET);
  if(!names.length)return;
  writeFileSync(targetThawFile,`${names.map(name=>`DROP TRIGGER IF EXISTS ${sqlIdentifier(name)};`).join('\n')}\n`,'utf8');
  executeFile(EU_D1_TARGET,targetThawFile);
  const remaining=freezeTriggerNames(EU_D1_TARGET);
  if(remaining.length)throw new Error(`EU_D1_TARGET_THAW_FAILED:${remaining.length}`);
}
function finalizeVerifiedTarget(digest){
  const commit=String(process.env.WORKERS_CI_COMMIT_SHA||'').trim();
  writeFileSync(markerFile,`CREATE TABLE ${EU_D1_MARKER_TABLE} (id INTEGER PRIMARY KEY CHECK(id=1),source_database TEXT NOT NULL,target_database_id TEXT NOT NULL,source_export_sha256 TEXT NOT NULL,cutover_commit TEXT NOT NULL,verified_at TEXT NOT NULL);\nINSERT INTO ${EU_D1_MARKER_TABLE}(id,source_database,target_database_id,source_export_sha256,cutover_commit,verified_at) VALUES(1,${sqlText(EU_D1_SOURCE)},${sqlText(EU_D1_TARGET_ID)},${sqlText(digest)},${sqlText(commit)},${sqlText(new Date().toISOString())});\n`,'utf8');
  executeFile(EU_D1_TARGET,markerFile);
  const verified=marker();
  if(!verified||verified.source_export_sha256!==digest)throw new Error('EU_D1_CUTOVER_MARKER_WRITE_FAILED');
  thawVerifiedTarget();
}
const existing=marker();
if(existing){
  if(existing.source_database!==EU_D1_SOURCE||existing.target_database_id!==EU_D1_TARGET_ID||!/^[a-f0-9]{64}$/.test(String(existing.source_export_sha256||'')))throw new Error('EU_D1_CUTOVER_MARKER_INVALID');
  thawVerifiedTarget();
  console.log(`Verified existing EU D1 cutover marker for ${EU_D1_TARGET_ID}; target writes are enabled, source remains frozen and import is not repeated.`);
  process.exit(0);
}

const sourceTables=query(EU_D1_SOURCE,`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND COALESCE(sql,'') NOT LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name;`).map(row=>String(row.name));
if(!sourceTables.length)throw new Error('EU_D1_SOURCE_EMPTY');
const expectedFreezeTriggers=sourceTables.length*3,sourceFreezeTriggers=freezeTriggerNames(EU_D1_SOURCE);
if(sourceFreezeTriggers.length&&sourceFreezeTriggers.length!==expectedFreezeTriggers)throw new Error(`EU_D1_SOURCE_FREEZE_PARTIAL:${sourceFreezeTriggers.length}:${expectedFreezeTriggers}`);
let targetTables=query(EU_D1_TARGET,`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;`).map(row=>String(row.name));
const targetFreezeTriggers=freezeTriggerNames(EU_D1_TARGET);
if(targetFreezeTriggers.length){
  if(sourceFreezeTriggers.length!==expectedFreezeTriggers||targetFreezeTriggers.length!==expectedFreezeTriggers)throw new Error(`EU_D1_INTERRUPTED_TARGET_FREEZE_MISMATCH:${sourceFreezeTriggers.length}:${targetFreezeTriggers.length}:${expectedFreezeTriggers}`);
  const recoverySourceExport=join(work,'recovery-source.sql'),recoveryTargetExport=join(work,'recovery-target.sql');
  exportDatabase(EU_D1_SOURCE,recoverySourceExport);
  exportDatabase(EU_D1_TARGET,recoveryTargetExport);
  const digest=assertMatchingExports(readFileSync(recoverySourceExport,'utf8'),readFileSync(recoveryTargetExport,'utf8'));
  finalizeVerifiedTarget(digest);
  console.log(`Recovered the previously imported exact EU D1 snapshot (${digest}); target writes are enabled and source remains frozen.`);
  process.exit(0);
}
if(targetTables.length){
  const targetPreflightExport=join(work,'target-preflight.sql');
  exportDatabase(EU_D1_TARGET,targetPreflightExport);
  const snapshot=inspectD1Export(readFileSync(targetPreflightExport,'utf8'));
  if(JSON.stringify(snapshot.tables)!==JSON.stringify(targetTables))throw new Error('EU_D1_TARGET_EXPORT_SCHEMA_MISMATCH');
  const expectedMigrationNames=readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort();
  assertSchemaOnlyTarget({...snapshot,expectedMigrationNames});
  const resetFile=join(work,'reset-target.sql');
  writeFileSync(resetFile,resetSchemaSql(snapshot.tables,snapshot.views),'utf8');
  console.log(`Resetting the verified schema-only EU D1 target left by the interrupted ${EU_D1_TARGET_ID} deployment.`);
  executeFile(EU_D1_TARGET,resetFile);
  targetTables=query(EU_D1_TARGET,`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;`).map(row=>String(row.name));
  if(targetTables.length)throw new Error(`EU_D1_TARGET_SCHEMA_RESET_FAILED:${targetTables.join(',')}`);
}

const freezeFile=join(work,'freeze-source.sql'),sourceThawFile=join(work,'thaw-source.sql'),sourceExport=join(work,'source.sql'),targetExport=join(work,'target.sql');
writeFileSync(freezeFile,freezeSql(sourceTables),'utf8');
writeFileSync(sourceThawFile,thawSql(sourceTables),'utf8');
const sourceWasFrozen=sourceFreezeTriggers.length===expectedFreezeTriggers;
let sourceFrozen=sourceWasFrozen,targetImportCompleted=false,targetVerified=false;
try{
  console.log(`Freezing ${sourceTables.length} source tables before the exact D1 snapshot.`);
  if(!sourceFrozen){executeFile(EU_D1_SOURCE,freezeFile);sourceFrozen=true;}
  const actualTriggers=freezeTriggerNames(EU_D1_SOURCE).length;
  if(actualTriggers!==expectedFreezeTriggers)throw new Error(`EU_D1_SOURCE_FREEZE_INCOMPLETE:${actualTriggers}:${expectedFreezeTriggers}`);
  exportDatabase(EU_D1_SOURCE,sourceExport);
  executeFile(EU_D1_TARGET,sourceExport);
  targetImportCompleted=true;
  exportDatabase(EU_D1_TARGET,targetExport);
  const sourceSql=readFileSync(sourceExport,'utf8'),targetSql=readFileSync(targetExport,'utf8'),digest=assertMatchingExports(sourceSql,targetSql);
  targetVerified=true;
  finalizeVerifiedTarget(digest);
  console.log(`EU D1 cutover verified byte-for-byte (${digest}); old source is write-frozen and target is ready.`);
}catch(error){
  let importedCopyDetected=targetImportCompleted||targetVerified;
  if(sourceFrozen&&!sourceWasFrozen&&!importedCopyDetected){
    try{importedCopyDetected=freezeTriggerNames(EU_D1_TARGET).length===expectedFreezeTriggers;}catch{}
  }
  if(sourceFrozen&&!sourceWasFrozen&&!importedCopyDetected){
    try{executeFile(EU_D1_SOURCE,sourceThawFile);console.error('Restored source writes because no imported target snapshot was detected.');}
    catch(cleanupError){console.error('CRITICAL: source freeze cleanup failed.',cleanupError);}
  }
  throw error;
}
