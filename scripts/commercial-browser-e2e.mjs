import { chromium } from 'playwright';

const base=(process.env.COMMERCIAL_BASE_URL||'https://klassenportal-commercial.nicosiedel.workers.dev').replace(/\/$/,'');
const adminEmail=String(process.env.E2E_PLATFORM_EMAIL||'').trim();
const adminPassword=String(process.env.E2E_PLATFORM_PASSWORD||'');
const fail=(msg)=>{throw new Error(msg);};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));

async function route(path,{allowStatuses=[200]}={}){
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  if(!response)fail(`No response for ${path}`);
  if(response.status()>=500)fail(`${path} returned ${response.status()}`);
  if(!allowStatuses.includes(response.status()))fail(`${path} returned unexpected ${response.status()}`);
  const text=(await page.locator('body').innerText()).slice(0,5000);
  if(/error\s*1042|worker threw exception|internal server error/i.test(text))fail(`${path} rendered a Cloudflare/server error`);
  console.log(`browser route ${path}: ${response.status()}`);
  return text;
}

try{
  for(const path of ['/produkt','/plattform-admin','/kunden-admin','/dozentenportal']) await route(path);

  const health=await page.request.get(base+'/api/public/product');
  if(health.status()>=500)fail(`/api/public/product returned ${health.status()}`);
  const invitation=await page.request.get(base+'/api/platform/onboarding-invitations');
  if(![401,403].includes(invitation.status()))fail(`unauthenticated onboarding invitations must be protected, got ${invitation.status()}`);
  const invalidOffer=await page.request.get(base+'/api/offers/browser-e2e-invalid-token');
  if(![400,404,410].includes(invalidOffer.status()))fail(`invalid offer token must fail closed, got ${invalidOffer.status()}`);
  const fakeSetup=await page.request.get(base+'/api/onboarding/browser-e2e-invalid-token');
  if(![400,404,410].includes(fakeSetup.status()))fail(`invalid onboarding token must fail closed, got ${fakeSetup.status()}`);

  if(adminEmail&&adminPassword){
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
  }else{
    console.log('authenticated browser path skipped: E2E_PLATFORM_EMAIL/E2E_PLATFORM_PASSWORD not configured');
  }

  if(pageErrors.length)fail(`page errors: ${pageErrors.join(' | ')}`);
  const relevantConsoleErrors=consoleErrors.filter(x=>!/favicon|third-party|ERR_BLOCKED_BY_CLIENT|Failed to load resource.*404/i.test(x));
  if(relevantConsoleErrors.length)fail(`console errors: ${relevantConsoleErrors.join(' | ')}`);
  console.log('Commercial real-browser smoke: OK');
}finally{
  await browser.close();
}
