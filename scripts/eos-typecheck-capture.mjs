import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm=process.platform==='win32'?'npm.cmd':'npm';
const result=spawnSync(npm,['run','typecheck'],{
  encoding:'utf8',
  maxBuffer:4*1024*1024,
  env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'},
});
const diagnostic={
  check:'typecheck',
  passed:!result.error&&result.status===0,
  status:result.status,
  signal:result.signal||null,
  spawn_error:result.error?result.error.name:null,
  commit:String(process.env.WORKERS_CI_COMMIT_SHA||''),
  generated_at:new Date().toISOString(),
};
writeFileSync('scripts/eos-typecheck-result.ts',`export const result=${JSON.stringify(diagnostic)} as const;\n`,'utf8');
console.log(`EOS_TYPECHECK_CAPTURE passed=${diagnostic.passed} status=${diagnostic.status}`);
process.exit(0);
