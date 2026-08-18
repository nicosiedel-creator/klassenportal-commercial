import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { reconciledMigrations,reconcileKnownRuntimeSchemaDrift } from '../scripts/reconcile-runtime-schema-drift.mjs';

const script=await readFile('scripts/migrate-remote.mjs','utf8');
const reconciler=await readFile('scripts/reconcile-runtime-schema-drift.mjs','utf8');
const pkg=JSON.parse(await readFile('package.json','utf8'));

assert.equal(pkg.scripts['db:migrate'],'node scripts/migrate-remote.mjs','remote migrations must go through guarded reconciler');
assert.ok(String(pkg.scripts.deploy||'').includes('npm run db:migrate'),'production deploy must keep the guarded remote migration step');
assert.ok(script.includes("process.env.WORKERS_CI_BRANCH"),'Workers Builds branch must be inspected');
assert.ok(script.includes("process.env.WORKERS_CI"),'Workers Builds execution must be detected');
assert.ok(script.includes("branch!==productionBranch"),'non-production branches must skip remote D1 migrations');
assert.ok(script.includes("productionBranch='main'"),'remote production migrations must be pinned to main');
assert.ok(script.includes("0042_branding_palette.sql"),'known branding migration drift must remain explicit');
for(const column of ['accent_color','surface_color','text_color'])assert.ok(script.includes(column),`branding reconciliation missing ${column}`);
assert.deepEqual(reconciledMigrations,[
  '0044_legal_documents_and_pilot.sql','0045_platform_offers.sql','0046_integrated_legal_documents.sql','0058_assignments_gradebook.sql'
]);
for(const name of reconciledMigrations)assert.ok(reconciler.includes(name),`runtime drift reconciliation missing ${name}`);
for(const token of ['representative','commercial_offer_acceptances','documents_enabled','submission_mode','assignment_submissions'])assert.ok(reconciler.includes(token),`runtime reconciliation missing ${token}`);
assert.ok(reconciler.includes('INSERT INTO d1_migrations (name) SELECT'),'reconciled migration must be recorded only after schema repair');
assert.ok(reconciler.includes('WHERE NOT EXISTS'),'migration history reconciliation must be idempotent');
assert.ok(script.includes("['d1','migrations','apply','DB','--remote']"),'normal Wrangler migrations must continue after reconciliation');
assert.ok(!reconciler.includes('DROP TABLE')&&!reconciler.includes('DELETE FROM d1_migrations'),'reconciliation must never destroy schema or migration history');

const preview=spawnSync(process.execPath,['scripts/migrate-remote.mjs'],{
  cwd:process.cwd(),encoding:'utf8',env:{...process.env,WORKERS_CI:'1',WORKERS_CI_BRANCH:'preview-validation'},
});
assert.equal(preview.status,0,preview.stderr||'preview migration guard failed');
assert.match(preview.stdout,/Skipping remote D1 migrations on non-production Workers Build branch/,'preview execution must stop before remote D1 access');

// Simulate the exact production drift class: runtime guards already created some
// columns, while d1_migrations has not recorded their migration files yet.
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
const second=await reconcileKnownRuntimeSchemaDrift({queryRows,run});
assert.deepEqual(second,[],'reconciliation must be idempotent once migration history is recorded');

console.log('Production-only remote D1 guard and full runtime-schema drift reconciliation checks: OK');
