import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const env={...process.env,WORKERS_CI_GUARD_ACTIVE:'1'};
const failures=[];
for(const name of readdirSync('public').filter(x=>x.endsWith('.js')).sort()){
  const r=spawnSync(process.execPath,['--check',`public/${name}`],{encoding:'utf8',env});
  if(r.error||r.status!==0)failures.push({name,status:r.status,error:r.error?.message||'',stderr:String(r.stderr||'').slice(0,4000)});
}
writeFileSync('public/browser-syntax-diagnostic.json',JSON.stringify({commit:process.env.WORKERS_CI_COMMIT_SHA||null,checkedAt:new Date().toISOString(),failures},null,2));
console.log(`Browser syntax diagnostic complete: ${failures.length} failure(s).`);
process.exit(0);
