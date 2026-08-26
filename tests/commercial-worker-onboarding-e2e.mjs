import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const npx=process.platform==='win32'?'npx.cmd':'npx';
const config='wrangler.browser-e2e-runtime.json';
const base='http://127.0.0.1:8791';
const scratch=mkdtempSync(join(tmpdir(),'kp-commercial-runtime-'));
const envFile=join(scratch,'e2e.env');
const logFile=join(scratch,'wrangler.log');
let worker=null,logFd=null;

function run(cmd,args,options={}){
  const result=spawnSync(cmd,args,{encoding:'utf8',stdio:options.capture?['ignore','pipe','pipe']:'inherit',env:{...process.env,...options.env}});
  if(result.error)throw result.error;
  if((result.status??1)!==0)throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${result.stderr||result.stdout||''}`);
  return result.stdout||'';
}
function parseEnvFile(){
  const vars={};
  for(const line of readFileSync(envFile,'utf8').split(/\r?\n/)){
    const i=line.indexOf('=');if(i<1)continue;vars[line.slice(0,i)]=line.slice(i+1);
  }
  return vars;
}
async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function api(path,{method='GET',body,headers={}}={}){
  const requestHeaders={...headers};
  if(body!==undefined)requestHeaders['content-type']='application/json';
  if(['POST','PUT','PATCH','DELETE'].includes(method))requestHeaders.origin=base;
  const response=await fetch(base+path,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{}
  return{status:response.status,text,data,headers:response.headers};
}
function onboardingBody(email,password,course){
  return{admin_name:'Runtime Acceptance Admin',admin_email:email,admin_password:password,admin_password_confirm:password,commercial_acceptance:'1',commercial_cost_confirmation:'1',first_course_name:course,first_course_code:course==='Parallelkurs'?'PAR-01':'E2E-01',access_mode:'login'};
}
async function ready(){
  for(let i=0;i<60;i++){
    if(worker?.exitCode!==null)break;
    try{const r=await fetch(base+'/plattform-admin');if(r.status===200)return;}catch{}
    await sleep(500);
  }
  const tail=readFileSync(logFile,'utf8').slice(-12000);
  throw new Error(`Local Worker did not become ready.\n${tail}`);
}
async function surfaceAndAssetAudit(){
  const surfaces=['/','/produkt','/plattform-admin','/kunden-admin','/klassen-admin','/dozentenportal','/testcenter.html','/impressum','/datenschutz','/agb','/avv','/unterauftragsverarbeiter','/datenportabilitaet','/rechtsverstoss-melden','/passwort-vergessen'];
  const htmlBodies=[];
  for(const path of surfaces){
    const r=await api(path);assert.notEqual(r.status,404,`${path} must not return 404`);assert.ok(r.status<500,`${path} returned ${r.status}`);assert.ok(r.text.trim().length>20,`${path} rendered empty`);assert.doesNotMatch(r.text,/error\s*1042|worker threw exception|internal server error/i,`${path} rendered a server error`);htmlBodies.push([path,r.text]);
  }
  const publicFiles=readdirSync('public');
  for(const name of publicFiles.filter(x=>/\.(?:html|js|css)$/i.test(x))){
    const r=await api('/'+name);assert.notEqual(r.status,404,`asset /${name} missing`);assert.ok(r.status<500,`asset /${name} returned ${r.status}`);assert.ok(r.text.length>0,`asset /${name} empty`);if(name.endsWith('.html'))htmlBodies.push(['/'+name,r.text]);
  }
  const internal=new Set();
  for(const [,html] of htmlBodies){
    for(const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)){
      const href=match[1].trim();if(!href||href.startsWith('#')||/^(?:mailto:|tel:|javascript:)/i.test(href))continue;
      let url;try{url=new URL(href,base);}catch{throw new Error(`Invalid href: ${href}`);}if(url.origin===base)internal.add(url.pathname+url.search);
    }
  }
  for(const path of internal){const r=await api(path);assert.notEqual(r.status,404,`internal link ${path} returned 404`);assert.ok(r.status<500,`internal link ${path} returned ${r.status}`);}
  console.log(`Runtime surface audit: ${surfaces.length} routed surfaces, ${publicFiles.filter(x=>/\.(?:html|js|css)$/i.test(x)).length} top-level assets, ${internal.size} internal links OK.`);
}
async function securityAndFreezeAudit(){
  let r=await api('/api/public/product');assert.equal(r.status,200,'public product contract must load');
  r=await api('/api/platform/onboarding-invitations');assert.ok([401,403].includes(r.status),`unauthenticated onboarding list must be protected, got ${r.status}`);
  r=await api('/api/onboarding/runtime-acceptance-invalid-token-000000000000');assert.notEqual(r.status,200,'invalid onboarding token must fail');assert.equal(r.data?.error,'ONBOARDING_NOT_FOUND');
  r=await api('/api/payments/checkout-status?session_id=cs_test_runtime_acceptance');assert.equal(r.status,503);assert.equal(r.data?.error,'PAYMENT_DISABLED');
  r=await api('/api/payments/stripe/webhook',{method:'POST',body:{}});assert.equal(r.status,200);assert.equal(r.data?.ignored,true);assert.equal(r.data?.paymentProcessing,'disabled');
  console.log('Runtime auth boundary + payment freeze: OK.');
}
async function acceptedOfferAudit(env){
  const token=env.E2E_ONBOARDING_PRIMARY_TOKEN,email=env.E2E_ONBOARDING_PRIMARY_ADMIN,password=env.E2E_ONBOARDING_PRIMARY_PASSWORD;
  assert.ok(token&&email&&password,'primary fixture environment missing');
  const path='/api/onboarding/'+encodeURIComponent(token),body=onboardingBody(email,password,'E2E Erstkurs');
  let r=await api(path);assert.equal(r.status,200);assert.equal(r.data?.invitation?.status,'open');assert.ok(r.data?.invitation?.locked_offer?.quote_number,'accepted offer must be locked into onboarding');
  r=await api(path,{method:'POST',body:{...body,admin_password_confirm:'Absichtlich-Anders-2026!'}});assert.equal(r.status,400);assert.equal(r.data?.error,'PASSWORD_CONFIRMATION_MISMATCH');
  r=await api(path,{method:'POST',body:{...body,commercial_cost_confirmation:undefined}});assert.equal(r.status,400);assert.equal(r.data?.error,'DOUBLE_COST_CONFIRMATION_REQUIRED');
  r=await api(path,{method:'POST',body:{...body,admin_email:'ungueltig'}});assert.equal(r.status,400);assert.equal(r.data?.error,'ONBOARDING_REQUIRED_FIELDS');
  r=await api(path);assert.equal(r.status,200);assert.equal(r.data?.invitation?.status,'open','negative checks must not consume invitation');
  r=await api(path,{method:'POST',body});assert.equal(r.status,200,`accepted offer activation failed: ${r.text}`);assert.equal(r.data?.ok,true);assert.equal(r.data?.commercial?.status,'active');assert.equal(r.data?.commercial?.paymentProcessing,'disabled');assert.ok(r.data?.tenant_id);assert.equal(r.data?.login_email,email);
  const login=await api('/api/auth/login',{method:'POST',body:{email,password}});assert.equal(login.status,200,`new tenant admin login failed: ${login.text}`);const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'login must return a session cookie');
  const me=await api('/api/auth/me',{headers:{cookie}});assert.equal(me.status,200);assert.equal(String(me.data?.user?.email||'').toLowerCase(),email.toLowerCase());
  r=await api(path,{method:'POST',body:{}});assert.notEqual(r.status,200,'completed onboarding replay must fail');assert.equal(r.data?.error,'ONBOARDING_UNAVAILABLE');
  console.log('Accepted offer -> tenant -> manual commerce -> login -> replay protection: OK.');
}
async function concurrencyAudit(env){
  const token=env.E2E_ONBOARDING_RACE_TOKEN,email=env.E2E_ONBOARDING_RACE_ADMIN,password=env.E2E_ONBOARDING_RACE_PASSWORD;
  assert.ok(token&&email&&password,'race fixture environment missing');
  const path='/api/onboarding/'+encodeURIComponent(token),body=onboardingBody(email,password,'Parallelkurs');
  const results=await Promise.all([api(path,{method:'POST',body}),api(path,{method:'POST',body})]);
  const winners=results.filter(x=>x.status===200&&x.data?.ok===true),losers=results.filter(x=>x.status!==200);
  assert.equal(winners.length,1,`double activation must have exactly one winner: ${results.map(x=>x.status+'/'+(x.data?.error||x.data?.ok)).join(' | ')}`);assert.equal(losers.length,1);
  assert.ok(['ONBOARDING_ALREADY_IN_PROGRESS','ONBOARDING_UNAVAILABLE'].includes(String(losers[0].data?.error||'')),`unsafe race loser: ${losers[0].status}/${losers[0].data?.error}`);assert.equal(winners[0].data?.commercial?.paymentProcessing,'disabled');
  const completed=await api(path);assert.equal(completed.status,200);assert.equal(completed.data?.invitation?.status,'completed');
  console.log('Concurrent double-click / duplicate-tenant protection: OK.');
}

try{
  const configJson=JSON.parse(readFileSync('wrangler.jsonc','utf8'));configJson.vars={...configJson.vars,APP_ORIGIN:base,PAYMENTS_ENABLED:'false'};delete configJson.routes;writeFileSync(config,JSON.stringify(configJson,null,2));
  run(npx,['wrangler','d1','migrations','apply','DB','--local','--config',config]);
  writeFileSync(envFile,'');
  run(process.execPath,['scripts/commercial-onboarding-e2e-state.mjs','seed',config],{env:{GITHUB_ENV:envFile,PAYMENTS_ENABLED:'false'}});
  const fixtureEnv=parseEnvFile();
  logFd=openSync(logFile,'a');worker=spawn(npx,['wrangler','dev','--config',config,'--local','--ip','127.0.0.1','--port','8791','--local-upstream','127.0.0.1','--upstream-protocol','http'],{env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1',PAYMENTS_ENABLED:'false'},stdio:['ignore',logFd,logFd]});
  await ready();
  await Promise.all([surfaceAndAssetAudit(),securityAndFreezeAudit()]);
  await acceptedOfferAudit(fixtureEnv);
  await concurrencyAudit(fixtureEnv);
  run(process.execPath,['scripts/commercial-onboarding-e2e-state.mjs','verify',config],{env:{PAYMENTS_ENABLED:'false'}});
  console.log('Commercial local Worker + migrated D1 runtime acceptance: OK');
}catch(error){
  try{console.error(readFileSync(logFile,'utf8').slice(-16000));}catch{}
  throw error;
}finally{
  try{worker?.kill('SIGTERM');}catch{}
  if(logFd!==null)try{closeSync(logFd);}catch{}
  try{rmSync(config,{force:true});}catch{}
  try{rmSync(scratch,{recursive:true,force:true});}catch{}
}
