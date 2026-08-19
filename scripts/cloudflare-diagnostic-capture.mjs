import { writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm=process.platform==='win32'?'npm.cmd':'npm';
const npx=process.platform==='win32'?'npx.cmd':'npx';
const parts=[];
function run(label,cmd,args){
  const started=Date.now();
  const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  const text=`\n===== ${label} =====\nstatus=${r.status} signal=${r.signal||''} duration_ms=${Date.now()-started}\n${r.stdout||''}\n${r.stderr||''}`;
  parts.push(text.slice(-120000));
  return r.status??1;
}

run('TYPECHECK',npm,['run','typecheck']);
for(const test of [
  'tests/exam-documentation-department-lead.mjs',
  'tests/full-education-operations.mjs',
  'tests/planning-constraints.mjs',
  'tests/education-operating-system.mjs',
  'tests/education-os-readiness-guardrails.mjs',
  'tests/education-os-operational-depth.mjs',
  'tests/education-os-privacy-storage.mjs',
  'tests/education-os-circuit-breaker.mjs'
]) run(`TEST ${test}`,process.execPath,[test]);
for(const file of readdirSync('public').filter(x=>x.endsWith('.js'))) run(`JS ${file}`,process.execPath,['--check',`public/${file}`]);
run('RELEASE CHECK',process.execPath,['scripts/release-check.mjs']);
run('D1 LOCAL MIGRATIONS',npx,['wrangler','d1','migrations','apply','DB','--local']);
const report=`commit=${process.env.WORKERS_CI_COMMIT_SHA||'unknown'}\nbranch=${process.env.WORKERS_CI_BRANCH||'unknown'}\ngenerated=${new Date().toISOString()}\n${parts.join('\n')}`;
writeFileSync('scripts/diagnostic-result.ts',`export const diagnostic=${JSON.stringify(report)};\n`,'utf8');
console.log('Diagnostic capture completed; intentionally allowing isolated preview deployment.');
