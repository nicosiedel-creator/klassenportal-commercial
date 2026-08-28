import { spawnSync } from 'node:child_process';

function run(command,args,env=process.env){
  const result=spawnSync(command,args,{stdio:'inherit',env});
  if(result.error){console.error(`Deployment command could not start: ${command}.`);console.error(result.error.message);process.exit(1);}
  if((result.status??1)!==0)process.exit(result.status??1);
}

run(process.execPath,['scripts/workers-ci-guard.mjs'],{...process.env,KP_LOCAL_PRODUCTION_DEPLOY:'1'});
const npx=process.platform==='win32'?'npx.cmd':'npx';
run(npx,['wrangler','deploy'],{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'});
