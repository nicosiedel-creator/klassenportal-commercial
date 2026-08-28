import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { reconciledMigrations,reconcileKnownRuntimeSchemaDrift } from '../scripts/reconcile-runtime-schema-drift.mjs';
import { d1TriggerCompatFiles,patchD1TriggerParserSql,withD1MigrationFilesForWorkersBuild } from '../scripts/d1-migration-compat.mjs';

const script=await readFile('scripts/migrate-remote.mjs','utf8');
const reconciler=await readFile('scripts/reconcile-runtime-schema-drift.mjs','utf8');
const deployWrapper=await readFile('scripts/cloudflare-deploy.mjs','utf8');
const deployGuard=await readFile('scripts/workers-ci-guard.mjs','utf8');
const pkg=JSON.parse(await readFile('package.json','utf8'));

assert.equal(pkg.scripts['db:migrate'],'node scripts/migrate-remote.mjs','remote migrations must go through guarded reconciler');
assert.equal(pkg.scripts.deploy,'node scripts/cloudflare-deploy.mjs','production deploy must use the guarded wrapper');
assert.ok(deployWrapper.includes("['scripts/workers-ci-guard.mjs']"),'production deploy wrapper must run the release/cutover guard first');
assert.ok(deployWrapper.includes("['wrangler','deploy']"),'production deploy wrapper must deploy only after the guard succeeds');
assert.ok(deployGuard.includes("['run','db:migrate']"),'production deploy guard must keep the guarded remote migration step');
// Wrangler runs the build command for `wrangler dev` as well. Without an explicit deployment
// marker a local development server would migrate the production database.
assert.ok(deployWrapper.includes("KP_LOCAL_PRODUCTION_DEPLOY:'1'"),'only the deploy wrapper may ask for a local remote production migration');
assert.ok(deployGuard.includes("process.env.KP_LOCAL_PRODUCTION_DEPLOY==='1'"),'the guard must require the deployment marker before touching production D1');
assert.match(deployGuard,/else\{\s*(\/\/[^\n]*\n\s*)*console\.log\('Skipping remote D1 migrations: this build is not a production deployment/,'a build without the deployment marker must skip the remote migration');
assert.ok(script.includes("process.env.WORKERS_CI_BRANCH"),'Workers Builds branch must be inspected');
assert.ok(script.includes("process.env.WORKERS_CI"),'Workers Builds execution must be detected');
assert.ok(script.includes("branch!==productionBranch"),'non-production branches must skip remote D1 migrations');
assert.ok(script.includes("productionBranch='main'"),'remote production migrations must be pinned to main');
assert.ok(script.includes('withD1MigrationFilesForWorkersBuild'),'production Workers build must scope D1 trigger compatibility to the Wrangler migration execution');
assert.ok(script.includes("0042_branding_palette.sql"),'known branding migration drift must remain explicit');
for(const column of ['accent_color','surface_color','text_color'])assert.ok(script.includes(column),`branding reconciliation missing ${column}`);
assert.deepEqual(reconciledMigrations,['0044_legal_documents_and_pilot.sql','0045_platform_offers.sql','0046_integrated_legal_documents.sql','0058_assignments_gradebook.sql']);
for(const name of reconciledMigrations)assert.ok(reconciler.includes(name),`runtime drift reconciliation missing ${name}`);
for(const token of ['representative','commercial_offer_acceptances','documents_enabled','submission_mode','assignment_submissions'])assert.ok(reconciler.includes(token),`runtime reconciliation missing ${token}`);
assert.ok(reconciler.includes('INSERT INTO d1_migrations (name) SELECT'),'reconciled migration must be recorded only after schema repair');
assert.ok(reconciler.includes('WHERE NOT EXISTS'),'migration history reconciliation must be idempotent');
assert.ok(script.includes("['d1','migrations','apply','DB','--remote']"),'normal Wrangler migrations must continue after reconciliation');
assert.ok(!reconciler.includes('DROP TABLE')&&!reconciler.includes('DELETE FROM d1_migrations'),'reconciliation must never destroy schema or migration history');

// Cloudflare D1 remote has a known parser failure for unparenthesized CASE..END
// inside CREATE TRIGGER. Keep historical migrations unchanged in git and patch only
// the ephemeral production Workers build copies while Wrangler applies them.
assert.deepEqual(d1TriggerCompatFiles,[
  {path:'migrations/0048_enterprise_hierarchy_sso_scim_api.sql',expectedCases:4},
  {path:'migrations/0057_timetable_hierarchy_targeting.sql',expectedCases:2},
]);
for(const item of d1TriggerCompatFiles){
  const source=await readFile(item.path,'utf8');
  assert.equal((source.match(/SELECT CASE WHEN/g)||[]).length,item.expectedCases,`${item.path} source trigger count changed unexpectedly`);
  const patched=patchD1TriggerParserSql(source,item.expectedCases);
  assert.equal((patched.match(/SELECT CASE WHEN/g)||[]).length,0,`${item.path} retains D1-incompatible trigger CASE syntax`);
  assert.equal((patched.match(/SELECT \(CASE WHEN/g)||[]).length,item.expectedCases,`${item.path} D1 trigger CASE patch count mismatch`);
  assert.ok(patched.includes('RAISE(ABORT'),`${item.path} trigger protections must remain intact`);
}
assert.throws(()=>patchD1TriggerParserSql('SELECT CASE WHEN 1 THEN 1 END;',2),/D1_TRIGGER_COMPAT_UNEXPECTED_CASE_COUNT/,'compatibility patch must fail closed if a migration changes unexpectedly');

// The deployment guard runs remote migration in the same checkout before the
// wrapper invokes Wrangler. Compatibility changes therefore must always be
// restored before control returns, including when the remote migration throws.
const fakeFiles=[{path:'memory/0048.sql',expectedCases:1}];
const fakeOriginal="CREATE TRIGGER t BEFORE INSERT ON x BEGIN SELECT CASE WHEN 1 THEN RAISE(ABORT,'X') END; END;";
const makeIo=()=>{
  const store=new Map([[fakeFiles[0].path,fakeOriginal]]);
  return {
    store,
    read:async path=>store.get(path),
    write:async(path,value)=>{store.set(path,value);},
  };
};
const successIo=makeIo();
await withD1MigrationFilesForWorkersBuild(async()=>{
  const during=successIo.store.get(fakeFiles[0].path);
  assert.equal((during.match(/SELECT CASE WHEN/g)||[]).length,0,'compatibility source must be patched during remote migration');
  assert.equal((during.match(/SELECT \(CASE WHEN/g)||[]).length,1,'compatibility source must use D1-safe trigger syntax during remote migration');
},{files:fakeFiles,read:successIo.read,write:successIo.write});
assert.equal(successIo.store.get(fakeFiles[0].path),fakeOriginal,'compatibility source must be restored after successful migration');

const failureIo=makeIo();
await assert.rejects(
  ()=>withD1MigrationFilesForWorkersBuild(async()=>{
    assert.equal((failureIo.store.get(fakeFiles[0].path).match(/SELECT \(CASE WHEN/g)||[]).length,1);
    throw new Error('SIMULATED_REMOTE_MIGRATION_FAILURE');
  },{files:fakeFiles,read:failureIo.read,write:failureIo.write}),
  /SIMULATED_REMOTE_MIGRATION_FAILURE/,
  'remote migration failure must remain visible after source restoration',
);
assert.equal(failureIo.store.get(fakeFiles[0].path),fakeOriginal,'compatibility source must be restored even after failed migration');

const preview=spawnSync(process.execPath,['scripts/migrate-remote.mjs'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,WORKERS_CI:'1',WORKERS_CI_BRANCH:'preview-validation'}});
assert.equal(preview.status,0,preview.stderr||'preview migration guard failed');
assert.match(preview.stdout,/Skipping remote D1 migrations on non-production Workers Build branch/,'preview execution must stop before remote D1 access');

// Simulate the production drift class: runtime guards already created schema,
// while d1_migrations has not recorded the corresponding migration files yet.
const db=new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE legal_configuration (id INTEGER PRIMARY KEY,representative TEXT,legal_form TEXT,documents_enabled INTEGER NOT NULL DEFAULT 0);
  INSERT INTO legal_configuration(id,representative,legal_form,documents_enabled) VALUES(1,'Bestehende Vertretung','GmbH',1);
  CREATE TABLE seller_billing_profile (id INTEGER PRIMARY KEY);
  CREATE TABLE commercial_quotes (id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL,subject TEXT,offer_kind TEXT NOT NULL DEFAULT 'paid',billing_cycle TEXT NOT NULL DEFAULT 'monthly',manual_pricing INTEGER NOT NULL DEFAULT 0,accepted_terms INTEGER NOT NULL DEFAULT 0,accepted_dpa INTEGER NOT NULL DEFAULT 0);
  INSERT INTO commercial_quotes(id,status,created_at,subject) VALUES('q1','draft','2026-08-18T00:00:00Z','Bestehendes Angebot');
  CREATE TABLE onboarding_invitations (id TEXT PRIMARY KEY);
  CREATE TABLE homework (id TEXT PRIMARY KEY,submission_mode TEXT NOT NULL DEFAULT 'info');
  INSERT INTO homework(id,submission_mode) VALUES('hw1','file');
`);
const queryRows=sql=>db.prepare(sql).all();
const run=sql=>db.exec(sql);
const first=await reconcileKnownRuntimeSchemaDrift({queryRows,run});
assert.deepEqual(first,['0044','0045','0046','0058']);
const history=db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(x=>x.name);
assert.deepEqual(history,reconciledMigrations);
assert.equal(db.prepare('SELECT representative FROM legal_configuration WHERE id=1').get().representative,'Bestehende Vertretung');
assert.equal(db.prepare("SELECT subject FROM commercial_quotes WHERE id='q1'").get().subject,'Bestehendes Angebot');
assert.equal(db.prepare("SELECT submission_mode FROM homework WHERE id='hw1'").get().submission_mode,'file');
for(const table of ['pilot_programs','commercial_offer_acceptances','commercial_offer_events','legal_document_events','legal_content_reports','assignment_submissions','assignment_submission_files','gradebook_items','gradebook_scores','gradebook_events'])assert.ok(db.prepare(`SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?`).get(table)?.ok,`missing reconciled table ${table}`);
for(const trigger of ['trg_pilot_no_auto_paid_insert','trg_reconcile_quotes_values_insert','trg_reconcile_offer_event_values_insert','trg_reconcile_legal_config_values_insert','trg_reconcile_legal_report_values_insert'])assert.ok(db.prepare(`SELECT 1 ok FROM sqlite_master WHERE type='trigger' AND name=?`).get(trigger)?.ok,`missing reconciled guard trigger ${trigger}`);
const second=await reconcileKnownRuntimeSchemaDrift({queryRows,run});
assert.deepEqual(second,[],'reconciliation must be idempotent once migration history is recorded');

console.log('Production-only remote D1 guard, runtime-schema drift reconciliation, transactional D1 trigger compatibility and double-build restoration checks: OK');
