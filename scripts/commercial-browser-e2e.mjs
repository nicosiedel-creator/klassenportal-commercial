import { chromium } from 'playwright';

const base=(process.env.COMMERCIAL_BASE_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const mode=String(process.env.E2E_TARGET_MODE||'candidate').trim();
const adminEmail=String(process.env.E2E_PLATFORM_EMAIL||'').trim();
const adminPassword=String(process.env.E2E_PLATFORM_PASSWORD||'');
const fail=(msg)=>{throw new Error(msg);};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[],consoleErrors=[],failedRequests=[],httpErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('requestfailed',request=>failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText||'failed'}`));
page.on('response',response=>{if(response.status()>=400)httpErrors.push({status:response.status(),url:response.url()});});

async function route(path,{allowStatuses=[200],waitForResponsePath=null}={}){
  const backgroundResponse=waitForResponsePath?page.waitForResponse(response=>{
    try{return new URL(response.url()).pathname===waitForResponsePath;}catch{return false;}
  },{timeout:10000}):null;
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  if(!response)fail(`No response for ${path}`);
  if(!allowStatuses.includes(response.status()))fail(`${path} returned unexpected ${response.status()}`);
  if(backgroundResponse){
    const bootstrap=await backgroundResponse;
    if(bootstrap.status()>=400)fail(`${waitForResponsePath} bootstrap returned unexpected ${bootstrap.status()}`);
    console.log(`browser bootstrap ${waitForResponsePath}: ${bootstrap.status()}`);
  }
  const text=(await page.locator('body').innerText()).slice(0,5000);
  if(/error\s*1042|worker threw exception|internal server error/i.test(text))fail(`${path} rendered a Cloudflare/server error`);
  console.log(`browser route ${path}: ${response.status()}`);
  return text;
}

async function api(path,{method='GET',body}={}){
  const response=await fetch(base+path,{method,headers:body===undefined?undefined:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  let data=null;try{data=await response.json();}catch{}
  return{status:response.status,data};
}

async function candidateSurface(){
  const platform=await route('/plattform-admin');
  if(!/Plattform|Anmeld|Login/i.test(platform))fail('/plattform-admin did not render the platform entry surface');
  const email=page.locator('input[type="email"],input[name="email"],input[name="login"]').first();
  const password=page.locator('input[type="password"]').first();
  const submit=page.locator('button[type="submit"]').first();
  if(!(await email.count())||!(await password.count())||!(await submit.count()))fail('platform login controls not found on the PR candidate');

  const product=await route('/produkt',{waitForResponsePath:'/api/public/product'});
  if(!/Klassenportal/i.test(product))fail('/produkt did not render the product surface');
  for(const path of ['/kunden-admin','/dozentenportal']){
    const text=await route(path);
    if(!text.trim())fail(`${path} rendered an empty shell`);
  }

  const productApi=await api('/api/public/product');
  if(productApi.status!==200)fail(`/api/public/product candidate contract returned ${productApi.status}`);
  const invitation=await api('/api/platform/onboarding-invitations');
  if(![401,403].includes(invitation.status))fail(`unauthenticated onboarding invitations must be protected, got ${invitation.status}`);
  const frozenCheckout=await api('/api/payments/checkout-status?session_id=cs_test_browser_candidate');
  if(frozenCheckout.status!==503)fail(`candidate checkout must remain frozen, got ${frozenCheckout.status}`);
  if(frozenCheckout.data?.error!=='PAYMENT_DISABLED')fail('candidate checkout did not return PAYMENT_DISABLED');
  const frozenWebhook=await api('/api/payments/stripe/webhook',{method:'POST',body:{}});
  if(frozenWebhook.status!==200||frozenWebhook.data?.ignored!==true||frozenWebhook.data?.paymentProcessing!=='disabled')fail('candidate payment webhook did not remain side-effect-free');
  console.log('PR candidate browser/API/payment-freeze surface: OK');
}

async function lockedProductionSurface(){
  await route('/plattform-admin');
  for(const path of ['/produkt','/kunden-admin','/dozentenportal']){
    const text=await route(path,{allowStatuses:[503]});
    if(!/noch nicht für den Produktivbetrieb freigegeben/i.test(text))fail(`${path} did not render the fail-closed version gate`);
  }
  const health=await api('/api/public/product');
  if(health.status!==503)fail(`/api/public/product must remain release-locked, got ${health.status}`);
  const invitation=await api('/api/platform/onboarding-invitations');
  if(![401,403].includes(invitation.status))fail(`unauthenticated onboarding invitations must be protected, got ${invitation.status}`);
  const invalidOffer=await api('/api/offers/browser-e2e-invalid-token');
  if(invalidOffer.status!==503)fail(`invalid offer token must remain release-locked, got ${invalidOffer.status}`);
  const fakeSetup=await api('/api/onboarding/browser-e2e-invalid-token');
  if(fakeSetup.status!==503)fail(`invalid onboarding token must remain release-locked, got ${fakeSetup.status}`);
  const frozenWebhook=await api('/api/payments/stripe/webhook',{method:'POST',body:{}});
  if(frozenWebhook.status!==200||frozenWebhook.data?.ignored!==true||frozenWebhook.data?.paymentProcessing!=='disabled')fail('payment webhook did not remain side-effect-free while production is locked');
}

const expectedCandidate401Paths=new Set(['/api/auth/me','/api/attendance/teacher/courses']);
function expectedBrowserHttpError(entry){
  if(mode!=='candidate'||entry.status!==401)return false;
  let path='';try{path=new URL(entry.url).pathname;}catch{return false;}
  return expectedCandidate401Paths.has(path);
}

try{
  if(mode==='candidate')await candidateSurface();
  else if(mode==='locked-production')await lockedProductionSurface();
  else fail(`Unsupported E2E_TARGET_MODE: ${mode}`);

  if(adminEmail&&adminPassword){
    if(mode!=='locked-production')console.log('authenticated live platform path is intentionally not executed against the local PR candidate');
    else{
      await route('/plattform-admin');
      const email=page.locator('input[type="email"],input[name="email"],input[name="login"]').first();
      const password=page.locator('input[type="password"]').first();
      if(!(await email.count())||!(await password.count()))fail('platform login controls not found');
      await email.fill(adminEmail);await password.fill(adminPassword);
      const submit=page.locator('button[type="submit"]').first();
      if(!(await submit.count()))fail('platform login submit not found');
      await submit.click();await page.waitForTimeout(1200);
      const offers=page.getByRole('button',{name:/Angebote/i}).first();
      if(!(await offers.count()))fail('Angebote navigation not available after platform login');
      await offers.click();await page.waitForTimeout(700);
      if(!(await page.getByText(/Angebote können|Freigabe noch gesperrt/i).count()))fail('offer manager did not open');
      const managerText=await page.locator('body').innerText();
      if(!/automatisch versendet|E-Mailversand/i.test(managerText))fail('offer manager does not expose mail delivery readiness');
      console.log('authenticated platform offer manager browser path: OK');
    }
  }else{
    console.log('authenticated live browser path not configured; local PR candidate path still executed');
  }

  await page.waitForTimeout(250);
  const expectedHttp=httpErrors.filter(expectedBrowserHttpError);
  const unexpectedHttp=httpErrors.filter(entry=>!expectedBrowserHttpError(entry));
  const unexpected401=unexpectedHttp.some(entry=>entry.status===401);
  const relevantConsole=consoleErrors.filter(text=>{
    if(/favicon|Failed to load resource.*404/i.test(text))return false;
    if(/^Failed to load resource:.*status of 401\b/i.test(text)&&expectedHttp.length>0&&!unexpected401)return false;
    return true;
  });
  if(pageErrors.length)fail(`page errors: ${pageErrors.join(' | ')}`);
  if(unexpectedHttp.length)fail(`unexpected browser HTTP responses: ${unexpectedHttp.map(x=>`${x.status} ${x.url}`).join(' | ')}`);
  if(relevantConsole.length)fail(`console errors: ${relevantConsole.join(' | ')}`);
  if(failedRequests.length)fail(`failed browser requests: ${failedRequests.join(' | ')}`);
  console.log(`Commercial real-browser smoke (${mode}): OK`);
}finally{
  await browser.close();
}
