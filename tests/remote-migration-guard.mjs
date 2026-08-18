import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const script=await readFile('scripts/migrate-remote.mjs','utf8');
const pkg=JSON.parse(await readFile('package.json','utf8'));

assert.equal(pkg.scripts['db:migrate'],'node scripts/migrate-remote.mjs','remote migrations must go through guarded reconciler');
assert.ok(String(pkg.scripts.deploy||'').includes('npm run db:migrate'),'production deploy must keep the guarded remote migration step');
assert.ok(script.includes("process.env.WORKERS_CI_BRANCH"),'Workers Builds branch must be inspected');
assert.ok(script.includes("process.env.WORKERS_CI"),'Workers Builds execution must be detected');
assert.ok(script.includes("branch!==productionBranch"),'non-production branches must skip remote D1 migrations');
assert.ok(script.includes("productionBranch='main'"),'remote production migrations must be pinned to main');
assert.ok(script.includes("0042_branding_palette.sql"),'known branding migration drift must be explicit');
for(const column of ['accent_color','surface_color','text_color'])assert.ok(script.includes(column),`branding reconciliation missing ${column}`);
assert.ok(script.includes('SELECT name FROM d1_migrations'),'migration history must be verified before reconciliation');
assert.ok(script.includes('INSERT INTO d1_migrations (name) SELECT'),'reconciled migration must be recorded only after schema repair');
assert.ok(script.includes('WHERE NOT EXISTS'),'migration history reconciliation must be idempotent');
assert.ok(script.includes("['d1','migrations','apply','DB','--remote']"),'normal Wrangler migrations must continue after reconciliation');
assert.ok(!script.includes('DROP TABLE')&&!script.includes('DELETE FROM d1_migrations'),'reconciliation must never destroy schema or migration history');

const preview=spawnSync(process.execPath,['scripts/migrate-remote.mjs'],{
  cwd:process.cwd(),
  encoding:'utf8',
  env:{...process.env,WORKERS_CI:'1',WORKERS_CI_BRANCH:'preview-validation'},
});
assert.equal(preview.status,0,preview.stderr||'preview migration guard failed');
assert.match(preview.stdout,/Skipping remote D1 migrations on non-production Workers Build branch/,'preview execution must stop before remote D1 access');

console.log('Production-only remote D1 migration guard and branding drift reconciliation checks: OK');
