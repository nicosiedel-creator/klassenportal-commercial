import { writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm=process.platform==='win32'?'npm.cmd':'npm';
const npx=process.platform==='win32'?'npx.cmd':'npx';
const parts=[];
const sensitiveName=/(authorization|bearer|password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|cookie)/i;
const errorLine=/(error|failed|failure|assert|exception|ERR_|TS\d{4}|migration|syntax)/i;
function redact(value){
  return String(value||'')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|secret|password|code)=)[^&\s]+/gi,'$1[REDACTED]')
    .replace(/\b((?:authorization|password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|cookie)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]')
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g,'[REDACTED_STRIPE_KEY]');
}
function safeDiagnostic(raw){
  const lines=redact(raw).split(/\r?\n/).filter(Boolean);
  const selected=lines.filter(line=>errorLine.test(line)&&!sensitiveName.test(line));
  return selected.slice(-80).join('\n').slice(-12000);
}
function run(label,cmd,args){
  const started=Date.now();
  const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  const safe=safeDiagnostic(`${r.stdout||''}\n${r.stderr||''}`);
  parts.push(`\n===== ${label} =====\nstatus=${r.status} signal=${r.signal||''} duration_ms=${Date.now()-started}${safe?`\n${safe}`:''}`);
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
  'tests/education-os-circuit-breaker.mjs',
  'tests/diagnostic-output-security.mjs'
]) run(`TEST ${test}`,process.execPath,[test]);
for(const file of readdirSync('public').filter(x=>x.endsWith('.js'))) run(`JS ${file}`,process.execPath,['--check',`public/${file}`]);
run('RELEASE CHECK',process.execPath,['scripts/release-check.mjs']);
run('D1 LOCAL MIGRATIONS',npx,['wrangler','d1','migrations','apply','DB','--local']);
const report=`commit=${process.env.WORKERS_CI_COMMIT_SHA||'unknown'}\nbranch=${process.env.WORKERS_CI_BRANCH||'unknown'}\ngenerated=${new Date().toISOString()}\n${parts.join('\n')}`;
writeFileSync('scripts/diagnostic-result.ts',`export const diagnostic=${JSON.stringify(report)};\n`,'utf8');
console.log('Diagnostic capture completed with allowlisted error output and secret redaction.');
