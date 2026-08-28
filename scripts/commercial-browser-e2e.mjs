import { chromium, firefox, webkit } from 'playwright';

// Der Gate läuft standardmäßig auf Chromium. Über E2E_BROWSER lässt sich derselbe Ablauf
// unverändert auf Firefox und WebKit fahren, damit browserabhängige Fehler auffallen,
// statt unbemerkt zu bleiben.
const ENGINES={chromium,firefox,webkit};
const engineName=String(process.env.E2E_BROWSER||'chromium').trim().toLowerCase();
const engine=ENGINES[engineName];
if(!engine)throw new Error(`Unsupported E2E_BROWSER: ${engineName}`);

const base=(process.env.COMMERCIAL_BASE_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const mode=String(process.env.E2E_TARGET_MODE||'candidate').trim();
const adminEmail=String(process.env.E2E_PLATFORM_EMAIL||'').trim();
const adminPassword=String(process.env.E2E_PLATFORM_PASSWORD||'');
const onboardingToken=String(process.env.E2E_ONBOARDING_PRIMARY_TOKEN||'').trim();
const onboardingAdmin=String(process.env.E2E_ONBOARDING_PRIMARY_ADMIN||'').trim();
const onboardingPassword=String(process.env.E2E_ONBOARDING_PRIMARY_PASSWORD||'');
const raceToken=String(process.env.E2E_ONBOARDING_RACE_TOKEN||'').trim();
const raceAdmin=String(process.env.E2E_ONBOARDING_RACE_ADMIN||'').trim();
const racePassword=String(process.env.E2E_ONBOARDING_RACE_PASSWORD||'');
const fail=(msg)=>{throw new Error(msg);};
// Die mobile Prüfung misst ein echtes Telefonfenster: 390px Layoutbreite und eine mobile Kennung.
// Chromiums isMobile-Emulation verbreitert bei Überlauf das Layoutfenster (shrink-to-fit) statt
// überzulaufen - damit blieben fünf öffentliche Seiten mit bis zu 594px Querlauf jahrelang
// unentdeckt, darunter drei rechtlich verpflichtende. Firefox weist die Emulation ohnehin ab und
// hat den Überlauf gemeldet. Keine der Prüfungen hier bedient etwas per Berührung, also fällt die
// Emulation weg und alle Engines messen dasselbe: was ein Telefon mit
// width=device-width,initial-scale=1 tatsächlich anzeigt.
const mobileContext=extra=>({viewport:{width:390,height:844},...extra});
const browser=await engine.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[],consoleErrors=[],failedRequests=[],httpErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
// A GET aborted while a navigation is in flight was cancelled by that navigation, not by the
// application. Classifying it by cause keeps the audit honest instead of whitelisting one path
// at a time as new in-flight requests appear.
const navigation={depth:0};
// Ein Abbruch ist die ausdrueckliche Ansage des Browsers, eine Anfrage selbst verworfen zu
// haben - beim Verlassen einer Seite, bei einer Weiterleitung aus dem Skript heraus, oder wenn
// die Anwendung sie per AbortController zuruecknimmt. Das ist kein Netzwerkfehler. Jede Engine
// benennt es anders; Playwright selbst erkennt den Abbruch an genau diesen drei Markern
// (crNetworkManager: event.canceled -> net::ERR_ABORTED, ffNetworkManager: NS_BINDING_ABORTED,
// wkPage: errorText enthaelt "cancelled").
//
// Bisher galt zusaetzlich "nur waehrend einer Navigation". Das traf die vom Portal selbst
// ausgeloesten Wechsel nicht - location.replace nach dem Passwortwechsel etwa - und Firefox
// meldete deshalb zehn abgebrochene /api/auth/me als Produktfehler. Statt die Bedingung
// aufzuweichen, wird sie geschaerft: ein Abbruch zaehlt nur dann als unbedenklich, wenn
// derselbe Pfad im Lauf auch mindestens einmal beantwortet wurde. Ein Pfad, der ausschliesslich
// abbricht, faellt weiterhin auf - das ist mehr Aussage als vorher, nicht weniger.
const NAVIGATION_ABORT=[/^net::ERR_ABORTED\b/,/^NS_BINDING_ABORTED\b/,/cancelled/i];
const pathOf=url=>{try{return new URL(url).pathname;}catch{return url;}};
function abortTracker(){
  const served=new Set(),aborted=new Map();
  return{
    serve(response){if(response.status()<400)served.add(pathOf(response.url()));},
    note(request,errorText){
      if(request.method()!=='GET'||!NAVIGATION_ABORT.some(pattern=>pattern.test(errorText)))return false;
      const path=pathOf(request.url());
      aborted.set(path,(aborted.get(path)||0)+1);
      return true;
    },
    unanswered(){return[...aborted].filter(([path])=>!served.has(path)).map(([path,count])=>`${path} (${count}x abgebrochen, nie beantwortet)`);},
    total(){return[...aborted.values()].reduce((sum,count)=>sum+count,0);},
  };
}
const aborts=abortTracker();
function navigationAbort(request,errorText){return aborts.note(request,errorText);}
async function settle(target){await target.waitForLoadState('networkidle',{timeout:8000}).catch(()=>undefined);}
async function navigate(target,url,options){navigation.depth++;try{return await target.goto(url,options);}finally{await settle(target);navigation.depth--;}}
page.on('requestfailed',request=>{const errorText=request.failure()?.errorText||'failed';if(navigationAbort(request,errorText))return;failedRequests.push(`${request.method()} ${request.url()} :: ${errorText}`);});
page.on('response',response=>{aborts.serve(response);if(response.status()>=400)httpErrors.push({status:response.status(),url:response.url()});});

async function route(path,{allowStatuses=[200],waitForResponsePath=null}={}){
  const backgroundResponse=waitForResponsePath?page.waitForResponse(response=>{try{return new URL(response.url()).pathname===waitForResponsePath;}catch{return false;}},{timeout:10000}):null;
  const response=await navigate(page,base+path,{waitUntil:'domcontentloaded',timeout:30000});
  if(!response)fail(`No response for ${path}`);
  // Ein 304 ist die richtige Antwort auf eine bedingte Anfrage: die zwischengespeicherte Seite
  // ist noch gültig. Firefox und WebKit revalidieren beim zweiten Besuch, Chromium liefert dort
  // aus dem Speicher heraus 200 - eine Erwartung von genau 200 prüft also den Browser, nicht das
  // Produkt. Wo eine Seite gesperrt sein muss (503), zählt 304 weiterhin nicht als Erfolg.
  const revalidated=response.status()===304&&allowStatuses.includes(200);
  if(!revalidated&&!allowStatuses.includes(response.status()))fail(`${path} returned unexpected ${response.status()}`);
  if(backgroundResponse){const bootstrap=await backgroundResponse;if(bootstrap.status()>=400)fail(`${waitForResponsePath} bootstrap returned unexpected ${bootstrap.status()}`);console.log(`browser bootstrap ${waitForResponsePath}: ${bootstrap.status()}`);}
  const text=(await page.locator('body').innerText()).slice(0,7000);
  if(/error\s*1042|worker threw exception|internal server error/i.test(text))fail(`${path} rendered a Cloudflare/server error`);
  console.log(`browser route ${path}: ${response.status()}`);
  return text;
}
async function api(path,{method='GET',body}={}){
  const response=await fetch(base+path,{method,headers:body===undefined?undefined:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  let data=null;try{data=await response.json();}catch{}
  return{status:response.status,data};
}
function onboardingBody(email,password,course){return{admin_name:'Browser E2E Admin',admin_email:email,admin_password:password,admin_password_confirm:password,commercial_acceptance:'1',commercial_cost_confirmation:'1',first_course_name:course,first_course_code:course==='Parallelkurs'?'PAR-01':'E2E-01',access_mode:'login'};}

async function candidateSurface(){
  const platform=await route('/plattform-admin');
  if(!/Plattform|Anmeld|Login/i.test(platform))fail('/plattform-admin did not render the platform entry surface');
  const email=page.locator('input[type="email"],input[name="email"],input[name="login"]').first(),password=page.locator('input[type="password"]').first(),submit=page.locator('button[type="submit"]').first();
  if(!(await email.count())||!(await password.count())||!(await submit.count()))fail('platform login controls not found on the PR candidate');

  const product=await route('/produkt',{waitForResponsePath:'/api/public/product'});
  if(!/Klassenportal/i.test(product))fail('/produkt did not render the product surface');
  for(const path of ['/kunden-admin','/dozentenportal']){const text=await route(path);if(!text.trim())fail(`${path} rendered an empty shell`);}

  const testcenter=await route('/testcenter.html');
  if(!/Live-Abnahme|Als Tester anmelden/i.test(testcenter))fail('test center entry surface did not render');
  await page.locator('#email').fill('not-authorized@example.invalid');
  await page.locator('#org').fill('Nicht freigeschaltete Test GmbH');
  await page.locator('#go').click();
  if(!/keinem freigeschalteten Testlauf/i.test(await page.locator('#err').innerText()))fail('test center invalid-login button did not fail closed');
  await page.locator('#lead').click();
  await page.locator('#modal:not(.hidden)').waitFor({timeout:5000});
  if(!/Testleitung geschützt/i.test(await page.locator('#modal').innerText()))fail('testleader button did not enforce owner authentication');
  await page.locator('#mc').click();

  for(const path of ['/impressum','/datenschutz','/agb','/avv','/unterauftragsverarbeiter','/datenportabilitaet','/rechtsverstoss-melden','/passwort-vergessen']){
    const text=await route(path);if(!text.trim())fail(`${path} rendered empty`);
  }

  const productApi=await api('/api/public/product');if(productApi.status!==200)fail(`/api/public/product candidate contract returned ${productApi.status}`);
  const invitation=await api('/api/platform/onboarding-invitations');if(![401,403].includes(invitation.status))fail(`unauthenticated onboarding invitations must be protected, got ${invitation.status}`);
  const frozenCheckout=await api('/api/payments/checkout-status?session_id=cs_test_browser_candidate');if(frozenCheckout.status!==503||frozenCheckout.data?.error!=='PAYMENT_DISABLED')fail('candidate checkout did not remain frozen');
  const frozenWebhook=await api('/api/payments/stripe/webhook',{method:'POST',body:{}});if(frozenWebhook.status!==200||frozenWebhook.data?.ignored!==true||frozenWebhook.data?.paymentProcessing!=='disabled')fail('candidate payment webhook did not remain side-effect-free');
  // Brute-force protection is keyed per (client, e-mail), so a throwaway address cannot lock out
  // a real account. It must answer 429 with its own code: a 500 tells the user nothing and hides
  // the block from the login surface.
  const bruteEmail=`brute-force-probe-${Date.now()}@example.invalid`;
  let bruteStatus=0,bruteCode='';
  for(let attempt=0;attempt<8;attempt++){
    const response=await api('/api/auth/login',{method:'POST',body:{email:bruteEmail,password:`falsch-${attempt}`}});
    bruteStatus=response.status;bruteCode=String(response.data?.error||'');
    if(bruteStatus===429)break;
    if(bruteStatus!==401)fail(`failed login must answer 401 until the limit is reached, got ${bruteStatus}/${bruteCode}`);
  }
  if(bruteStatus!==429||bruteCode!=='LOGIN_RATE_LIMITED')fail(`brute-force protection must answer 429 LOGIN_RATE_LIMITED, got ${bruteStatus}/${bruteCode}`);
  console.log('PR candidate browser/API/legal/testcenter/payment-freeze/brute-force surface: OK');
}

async function internalLinkAudit(paths){
  const hrefs=new Set();
  for(const path of paths){
    await route(path);
    for(const href of await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')).filter(Boolean)))hrefs.add(href);
  }
  for(const href of hrefs){
    if(href.startsWith('#')||/^(mailto:|tel:|javascript:)/i.test(href))continue;
    let url;try{url=new URL(href,base);}catch{fail(`invalid href ${href}`);}
    if(url.origin!==new URL(base).origin)continue;
    const response=await fetch(url,{redirect:'manual'});
    if(response.status===404||response.status>=500)fail(`internal link ${url.pathname} returned ${response.status}`);
  }
  console.log(`Internal link contract: ${hrefs.size} discovered links checked without 404/5xx.`);
}

async function onboardingNegativeValidation(){
  if(!onboardingToken||!onboardingAdmin||!onboardingPassword)fail('primary onboarding E2E fixture environment missing');
  const path=`/api/onboarding/${encodeURIComponent(onboardingToken)}`;
  let body=onboardingBody(onboardingAdmin,onboardingPassword,'E2E Erstkurs');
  let response=await api(path,{method:'POST',body:{...body,admin_password_confirm:'Absichtlich-Anders-2026!'}});
  if(response.status!==400||response.data?.error!=='PASSWORD_CONFIRMATION_MISMATCH')fail(`password mismatch must fail before mutation, got ${response.status}/${response.data?.error}`);
  response=await api(path,{method:'POST',body:{...body,commercial_cost_confirmation:undefined}});
  if(response.status!==400||response.data?.error!=='DOUBLE_COST_CONFIRMATION_REQUIRED')fail(`missing cost confirmation must fail before mutation, got ${response.status}/${response.data?.error}`);
  response=await api(path,{method:'POST',body:{...body,admin_email:'ungueltig'}});
  if(response.status!==400||response.data?.error!=='ONBOARDING_REQUIRED_FIELDS')fail(`invalid admin e-mail must fail before mutation, got ${response.status}/${response.data?.error}`);
  const stillOpen=await api(`/api/onboarding/${encodeURIComponent(onboardingToken)}`);
  if(stillOpen.status!==200||stillOpen.data?.invitation?.status!=='open')fail('negative onboarding validation consumed the invitation');
  console.log('Onboarding negative validation before mutation: OK');
}

async function concurrentOnboardingClaim(){
  if(!raceToken||!raceAdmin||!racePassword)fail('race onboarding E2E fixture environment missing');
  const path=`/api/onboarding/${encodeURIComponent(raceToken)}`,body=onboardingBody(raceAdmin,racePassword,'Parallelkurs');
  const results=await Promise.all([api(path,{method:'POST',body}),api(path,{method:'POST',body})]);
  const successes=results.filter(x=>x.status===200&&x.data?.ok===true),losers=results.filter(x=>x.status!==200);
  if(successes.length!==1||losers.length!==1)fail(`concurrent onboarding must produce exactly one success, got ${results.map(x=>`${x.status}/${x.data?.error||x.data?.ok}`).join(' | ')}`);
  if(!['ONBOARDING_ALREADY_IN_PROGRESS','ONBOARDING_UNAVAILABLE'].includes(String(losers[0].data?.error||'')))fail(`concurrent loser returned unsafe error ${losers[0].status}/${losers[0].data?.error}`);
  if(successes[0].data?.commercial?.paymentProcessing!=='disabled'||successes[0].data?.commercial?.status!=='active')fail('concurrent winner did not preserve manual payment freeze');
  const completed=await api(`/api/onboarding/${encodeURIComponent(raceToken)}`);if(completed.status!==200||completed.data?.invitation?.status!=='completed')fail('concurrent winner did not complete invitation');
  const replay=await api(path,{method:'POST',body:{}});if(replay.status===200||replay.data?.error!=='ONBOARDING_UNAVAILABLE')fail(`completed onboarding replay must fail closed, got ${replay.status}/${replay.data?.error}`);
  console.log('Concurrent double-click / duplicate-tenant protection: OK');
}

async function mobileOnboardingPreflight(){
  if(!onboardingToken)fail('primary onboarding E2E fixture environment missing');
  const context=await browser.newContext(mobileContext());
  try{
    const mobile=await context.newPage(),response=await navigate(mobile,`${base}/einrichtung/${encodeURIComponent(onboardingToken)}`,{waitUntil:'domcontentloaded',timeout:30000});
    if(!response||response.status()!==200)fail(`mobile onboarding returned ${response?.status()??'no response'}`);
    await mobile.locator('#onboarding-form').waitFor({timeout:10000});
    const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);if(overflow>4)fail(`mobile onboarding has ${overflow}px horizontal overflow`);
    const button=await mobile.locator('#submit-setup').boundingBox();if(!button||button.x<0||button.x+button.width>394)fail('mobile onboarding submit control is outside viewport width');
    console.log('Mobile accepted-offer onboarding preflight: OK');
  }finally{await context.close();}
}

async function acceptedOfferOnboarding(){
  const path=`/einrichtung/${encodeURIComponent(onboardingToken)}`;
  await route(path);
  await page.locator('#onboarding-form').waitFor({timeout:10000});
  const bodyText=await page.locator('body').innerText();
  if(!/Preis aus Angebot ANG-E2E-PRIMARY/i.test(bodyText)||!/Zahlung außerhalb des Portals/i.test(bodyText))fail('accepted offer was not locked into onboarding UI');
  const sameAdmin=page.locator('#same-admin');if(await sameAdmin.isChecked())await sameAdmin.uncheck();
  await page.locator('input[name="admin_name"]').fill('Browser E2E Admin');
  await page.locator('input[name="admin_email"]').fill(onboardingAdmin);
  await page.locator('input[name="admin_password"]').fill(onboardingPassword);
  await page.locator('input[name="admin_password_confirm"]').fill(onboardingPassword);
  await page.locator('input[name="first_course_name"]').fill('E2E Erstkurs');
  await page.locator('input[name="first_course_code"]').fill('E2E-01');
  const accept=page.locator('#offer-accept'),cost=page.locator('#cost-accept'),submit=page.locator('#submit-setup');
  await accept.check();await cost.uncheck();await submit.click();
  if(!/bestätige Buchung und Kosten/i.test(await page.locator('#setup-error').innerText()))fail('client-side double-confirmation click guard did not fire');
  await cost.check();
  const responsePromise=page.waitForResponse(r=>{try{return r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/onboarding/${onboardingToken}`;}catch{return false;}},{timeout:30000});
  await submit.click();
  const response=await responsePromise;let data=null;try{data=await response.json();}catch{}
  if(response.status()!==200||data?.ok!==true)fail(`accepted-offer onboarding POST failed ${response.status()}/${data?.error||'NO_JSON'}`);
  if(data?.commercial_action!=='book'||data?.commercial?.status!=='active'||data?.commercial?.paymentProcessing!=='disabled')fail('accepted-offer onboarding response has wrong commercial/payment state');
  await page.getByText(/Buchung erfasst/i).waitFor({timeout:10000});
  if(!/keine Zahlung ausgelöst/i.test(await page.locator('body').innerText()))fail('successful UI does not state the payment freeze');
  const auth=await page.evaluate(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin'});let d=null;try{d=await r.json();}catch{}return{status:r.status,data:d};});
  if(auth.status!==200||!auth.data?.user)fail(`new customer admin was not automatically authenticated: ${auth.status}`);
  const open=page.getByRole('link',{name:/Portal öffnen/i}).first();if(!(await open.count()))fail('successful onboarding has no Portal öffnen action');
  const nav=page.waitForNavigation({waitUntil:'domcontentloaded',timeout:15000});await open.click();const navResponse=await nav;if(!navResponse||navResponse.status()!==200)fail(`Portal öffnen click returned ${navResponse?.status()??'no response'}`);
  // The root entry immediately role-routes an authenticated tenant admin. Competing with that
  // client navigation from inside the page - page.goto or page.evaluate - either returns a null
  // navigation response or tears down the execution context mid-call. Request the shell through
  // the browser context's own cookie jar instead: same authenticated session, no race.
  const adminResponse=await page.context().request.get(`${base}/kunden-admin`);
  const adminSurface={status:adminResponse.status(),text:await adminResponse.text()};
  if(adminSurface.status!==200||!adminSurface.text.trim())fail(`new customer admin cannot open customer-admin surface: ${adminSurface.status}`);
  const completed=await api(`/api/onboarding/${encodeURIComponent(onboardingToken)}`);if(completed.status!==200||completed.data?.invitation?.status!=='completed')fail('successful browser onboarding did not persist completed invitation');
  const replay=await api(`/api/onboarding/${encodeURIComponent(onboardingToken)}`,{method:'POST',body:{}});if(replay.status===200||replay.data?.error!=='ONBOARDING_UNAVAILABLE')fail(`browser onboarding replay must fail closed, got ${replay.status}/${replay.data?.error}`);
  console.log('Accepted paid offer -> browser onboarding -> auto-login -> customer portal: OK');
}

async function lockedProductionSurface(){
  await route('/plattform-admin');
  for(const path of ['/produkt','/kunden-admin','/dozentenportal']){const text=await route(path,{allowStatuses:[503]});if(!/noch nicht für den Produktivbetrieb freigegeben/i.test(text))fail(`${path} did not render the fail-closed version gate`);}
  const health=await api('/api/public/product');if(health.status!==503)fail(`/api/public/product must remain release-locked, got ${health.status}`);
  const invitation=await api('/api/platform/onboarding-invitations');if(![401,403].includes(invitation.status))fail(`unauthenticated onboarding invitations must be protected, got ${invitation.status}`);
  const invalidOffer=await api('/api/offers/browser-e2e-invalid-token');if(invalidOffer.status!==503)fail(`invalid offer token must remain release-locked, got ${invalidOffer.status}`);
  const fakeSetup=await api('/api/onboarding/browser-e2e-invalid-token');if(fakeSetup.status!==503)fail(`invalid onboarding token must remain release-locked, got ${fakeSetup.status}`);
  const frozenWebhook=await api('/api/payments/stripe/webhook',{method:'POST',body:{}});if(frozenWebhook.status!==200||frozenWebhook.data?.ignored!==true||frozenWebhook.data?.paymentProcessing!=='disabled')fail('payment webhook did not remain side-effect-free while production is locked');
}

// Diese Prüfung sah bisher nur die vier Portaloberflächen und das Testcenter. Genau deshalb
// blieb unentdeckt, dass Datenschutz, AGB, AVV und Unterauftragsverarbeiter auf einem 390px
// breiten Bildschirm um bis zu 594px seitlich überliefen - drei davon sind rechtlich
// verpflichtend und müssen auf einem Telefon lesbar sein. Die Rechtsseiten umgehen die
// Release-Sperre (LEGAL_PATHS in src/index.ts), sind also in beiden Modi erreichbar und
// gehören damit in dieselbe Messung wie die Portale.
const MOBILE_RELEASE_LOCKED=['/produkt','/kunden-admin','/dozentenportal','/angebot','/department-lead'];
const MOBILE_PATHS=['/','/plattform-admin','/produkt','/kunden-admin','/dozentenportal','/department-lead','/angebot','/testcenter.html','/passwort-vergessen','/impressum','/datenschutz','/agb','/avv','/unterauftragsverarbeiter','/datenportabilitaet','/rechtsverstoss-melden'];

async function mobileSurface(){
  const context=await browser.newContext(mobileContext({userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'}));
  const mobile=await context.newPage(),errors=[],failed=[],serverErrors=[];
  mobile.on('pageerror',e=>errors.push(String(e)));
  mobile.on('requestfailed',r=>{const errorText=r.failure()?.errorText||'failed';if(navigationAbort(r,errorText))return;failed.push(`${r.method()} ${r.url()} :: ${errorText}`);});
  mobile.on('response',r=>{aborts.serve(r);if(r.status()<500)return;let path='';try{path=new URL(r.url()).pathname;}catch{}const expectedLocked=mode==='locked-production'&&r.status()===503&&MOBILE_RELEASE_LOCKED.includes(path);if(!expectedLocked)serverErrors.push(`${r.status()} ${r.url()}`);});
  try{
    for(const path of MOBILE_PATHS){
      const expected=mode==='locked-production'&&MOBILE_RELEASE_LOCKED.includes(path)?[503]:[200];
      const response=await navigate(mobile,base+path,{waitUntil:'domcontentloaded',timeout:30000});if(!response||!expected.includes(response.status()))fail(`mobile ${path} returned ${response?.status()??'no response'}, expected ${expected.join('/')}`);
      const text=(await mobile.locator('body').innerText()).slice(0,4000);if(!text.trim()||/error\s*1042|worker threw exception|internal server error/i.test(text))fail(`mobile ${path} rendered an invalid surface`);
      const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);if(overflow>4)fail(`mobile ${path} has ${overflow}px document-level horizontal overflow`);
    }
    if(errors.length)fail(`mobile page errors: ${errors.join(' | ')}`);if(serverErrors.length)fail(`mobile server errors: ${serverErrors.join(' | ')}`);if(failed.length)fail(`mobile failed requests: ${failed.join(' | ')}`);
    console.log(`Commercial mobile viewport smoke (${mode}): OK`);
  }finally{await context.close();}
}

// Die Plattformverwaltung ist die Oberflaeche, mit der ein Kunde ueberhaupt erst eingerichtet
// wird - und der Lauf hat sie bisher nur unangemeldet geoeffnet. Deshalb blieb unentdeckt, dass
// "Einrichtungslink erzeugen" gar keine Anfrage stellte: der Absendevorgang suchte die
// Schaltflaeche ueber button[type="submit"], die Schaltflaeche trug aber kein type-Attribut, und
// der Zugriff auf null warf, bevor irgendetwas passierte. Ein Plattformverwalter konnte damit
// keinen einzigen Kunden einrichten. Diese Pruefung fuehrt den Weg wirklich aus.
async function platformAdministrationContract(){
  const email=String(process.env.E2E_LOCAL_PLATFORM_EMAIL||'').trim();
  const password=String(process.env.E2E_LOCAL_PLATFORM_PASSWORD||'').trim();
  if(!email||!password)fail('local platform acceptance account is not configured');
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'de-DE'});
  const admin=await context.newPage();
  const pageErrors=[];
  admin.on('pageerror',error=>pageErrors.push(String(error).slice(0,200)));
  try{
    await navigate(admin,`${base}/plattform-admin`,{waitUntil:'domcontentloaded',timeout:30000});
    await admin.locator('input[name="email"]').fill(email);
    await admin.locator('input[name="password"]').fill(password);
    await admin.locator('button[type="submit"]').click();
    await admin.locator('aside.side button.nav').filter({hasText:/^Kunden-Einrichtung$/}).first().waitFor({timeout:20000});
    await admin.locator('aside.side button.nav').filter({hasText:/^Kunden-Einrichtung$/}).first().click();
    await admin.locator('#pa-new').waitFor({timeout:15000});

    const customer=`browser-e2e-setup-${Date.now()}@example.invalid`;
    const created=admin.waitForResponse(response=>{
      try{return new URL(response.url()).pathname==='/api/platform/onboarding-invitations'&&response.request().method()==='POST';}catch{return false;}
    },{timeout:20000});
    await admin.locator('#pa-new input[name="customer_email"]').fill(customer);
    // Wie ein Benutzer: die sichtbare Schaltflaeche anklicken, nicht die mit dem richtigen
    // type-Attribut. Sonst wuerde die Pruefung genau den Fehler umgehen, den sie sucht.
    await admin.locator('#pa-new button').filter({hasText:'Einrichtungslink erzeugen'}).first().click();
    const response=await created.catch(()=>null);
    if(!response)fail('creating a customer setup link sent no request at all - the platform administration cannot set up a customer');
    if(response.status()!==201)fail(`creating a customer setup link answered ${response.status()}`);
    const link=await admin.locator('#pa-created #pa-link').inputValue().catch(()=>'');
    if(!/\/einrichtung\//.test(link))fail(`the created setup link is not an onboarding link: ${link.slice(0,80)}`);
    // Die Liste laedt nach dem Anlegen selbst nach; darauf warten statt sofort zu messen.
    await admin.locator('#pa-list').filter({hasText:customer}).first().waitFor({timeout:15000})
      .catch(()=>fail('the created setup link does not appear in the invitation list'));

    // Die Rueckfrage vor dem Widerruf ist ein zweiter Dialog ueber dem ersten. Beide muessen
    // ihren eigenen Namen tragen - eine feste Kennung liess die Rueckfrage den Namen des
    // darunterliegenden Dialogs ansagen, waehrend sie nach einem Widerruf fragte.
    await admin.locator('#pa-list .pa-revoke').first().click();
    await admin.waitForTimeout(800);
    const dialogs=await admin.evaluate(()=>{
      const duplicates=new Map();
      for(const el of document.querySelectorAll('[id]'))duplicates.set(el.id,(duplicates.get(el.id)||0)+1);
      const name=el=>{
        const ref=el.getAttribute('aria-labelledby');
        if(ref){const target=document.getElementById(ref);return target?(target.textContent||'').trim():'';}
        return (el.getAttribute('aria-label')||'').trim();
      };
      return{
        open:[...document.querySelectorAll('[role="dialog"]')].map(el=>({heading:(el.querySelector('h1,h2,h3,h4')?.textContent||'').trim(),name:name(el)})),
        duplicates:[...duplicates].filter(([,count])=>count>1).map(([id,count])=>`${id} (${count}x)`),
      };
    });
    if(dialogs.open.length<2)fail(`revoking a setup link did not open a confirmation dialog (${dialogs.open.length} dialog(s) open)`);
    if(dialogs.duplicates.length)fail(`two open dialogs share an element id: ${dialogs.duplicates.join(', ')}`);
    for(const dialog of dialogs.open){
      if(!dialog.name)fail(`an open dialog carries no accessible name (heading "${dialog.heading}")`);
      if(dialog.heading&&dialog.name!==dialog.heading)fail(`a dialog announces "${dialog.name}" while showing "${dialog.heading}"`);
    }
    if(pageErrors.length)fail(`platform administration page errors: ${pageErrors.join(' | ')}`);
    console.log('Platform administration: customer setup link created, listed and confirmed with correctly named dialogs: OK');
  }finally{await context.close();}
}

// Was der Browser aus einer Seite macht, steht nicht im ausgelieferten HTML: die
// Einstiegsflächen bauen sich per JavaScript auf. Eine Prüfung der Quelltexte hätte deshalb
// nichts gefunden - im Browser gemessen hatten Anmeldung, Kundenverwaltung und
// Plattformverwaltung keine einzige Überschrift (der Titel war ein <div class="brand">), das
// Testcenter zwei Eingabefelder ohne verknüpfte Beschriftung, und /angebot ohne Token hielt
// das Wort "angebot" selbst für den Token und lief in einen 404. Diese Prüfung misst das am
// laufenden Portal.
async function publicDocumentContract(){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const doc=await context.newPage();
  const problems=[];
  try{
    for(const path of MOBILE_PATHS){
      if(mode==='locked-production'&&MOBILE_RELEASE_LOCKED.includes(path))continue;
      const response=await navigate(doc,base+path,{waitUntil:'domcontentloaded',timeout:30000});
      if(!response||response.status()!==200){problems.push(`${path} antwortete ${response?.status()??'gar nicht'}`);continue;}
      const found=await doc.evaluate(()=>{
        const visible=el=>{const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&el.getClientRects().length>0;};
        const named=el=>{
          const label=el.getAttribute('aria-label');if(label&&label.trim())return true;
          const ref=el.getAttribute('aria-labelledby');if(ref&&ref.split(/\s+/).some(id=>document.getElementById(id)))return true;
          if(el.id&&document.querySelector(`label[for="${CSS.escape(el.id)}"]`))return true;
          if(el.closest('label'))return true;
          if(el.title&&el.title.trim())return true;
          return false;
        };
        const unnamed=[];
        for(const el of document.querySelectorAll('input,select,textarea')){
          if(['hidden','submit','button','reset'].includes(el.type))continue;
          if(!visible(el))continue;
          if(!named(el))unnamed.push(`${el.tagName.toLowerCase()}#${el.id||el.name||'?'}`);
        }
        return{headings:[...document.querySelectorAll('h1')].filter(visible).length,unnamed,lang:document.documentElement.lang||'',title:document.title.trim()};
      });
      if(found.headings!==1)problems.push(`${path} hat ${found.headings} sichtbare h1 statt genau einer`);
      if(found.unnamed.length)problems.push(`${path} hat Eingabefelder ohne verknüpfte Beschriftung: ${found.unnamed.join(', ')}`);
      if(!found.lang)problems.push(`${path} nennt keine Sprache`);
      if(!found.title)problems.push(`${path} hat keinen Titel`);
    }

    // Ohne Token ist der Angebotslink unvollständig - die Seite darf das sagen, statt einen
    // Token zu erfinden und dafür einen 404 zu holen.
    const offerCalls=[];
    const listener=request=>{if(new URL(request.url()).pathname.startsWith('/api/offers/'))offerCalls.push(new URL(request.url()).pathname);};
    doc.on('request',listener);
    await navigate(doc,`${base}/angebot`,{waitUntil:'domcontentloaded',timeout:30000});
    await doc.waitForTimeout(1200);
    doc.off('request',listener);
    if(offerCalls.length)problems.push(`/angebot ohne Token fragte ${offerCalls.join(', ')} ab`);
    const offerText=await doc.locator('body').innerText();
    if(!/unvollständig/i.test(offerText))problems.push(`/angebot ohne Token meldet nicht, dass der Link unvollständig ist: ${offerText.replace(/\s+/g,' ').trim().slice(0,120)}`);

    if(problems.length)fail(`public document contract: ${problems.join(' | ')}`);
    console.log(`Public document contract (${mode}): OK`);
  }finally{await context.close();}
}

// Jede Verwaltungsoberfläche baut ihre Dialoge selbst; ohne einen gemeinsamen Wächter hing die
// Bedienbarkeit davon ab, welches Modul den Dialog gebaut hat. Diese Prüfung fährt den Wächter
// direkt: Sie hängt einen nackten Overlay in die echte Seite und verlangt, dass er zu einem
// bedienbaren Dialog wird - unabhängig davon, welche Module gerade geladen sind.
async function adminDialogContract(path){
  await route(path);
  const opener=page.locator('button,a[href]').first();
  if(await opener.count())await opener.focus().catch(()=>undefined);
  const before=await page.evaluate(()=>document.activeElement?.tagName||'BODY');
  const state=await page.evaluate(async()=>{
    const wait=()=>new Promise(resolve=>setTimeout(resolve,120));
    const back=document.createElement('div');
    back.className='modal-back';
    back.innerHTML='<div class="modal"><div class="top"><h3>E2E Dialogvertrag</h3>'
      +'<button type="button" data-close>\u00d7</button></div>'
      +'<label>Notiz<input name="e2e-note"></label></div>';
    document.body.append(back);
    await wait();
    const panel=back.querySelector('.modal');
    const close=panel.querySelector('[data-close]');
    const labelledby=panel.getAttribute('aria-labelledby');
    return{
      role:panel.getAttribute('role'),
      modal:panel.getAttribute('aria-modal'),
      name:panel.getAttribute('aria-label')||(labelledby?document.getElementById(labelledby)?.textContent?.trim():''),
      closeName:close?.getAttribute('aria-label')||'',
      focusInside:back.contains(document.activeElement),
      inertSupported:'inert' in HTMLElement.prototype,
      backgroundShielded:[...document.body.children].every(el=>el===back||el.matches('[role="status"],[role="alert"],[aria-live]')||['SCRIPT','LINK','STYLE','TEMPLATE','NOSCRIPT'].includes(el.tagName)||el.inert===true),
      bodyLocked:document.body.classList.contains('kp-admin-modal-open')
    };
  });
  if(state.role!=='dialog')fail(`${path}: admin overlay is not exposed as a dialog (role=${state.role})`);
  if(state.modal!=='true')fail(`${path}: admin overlay is not exposed as modal`);
  if(state.name!=='E2E Dialogvertrag')fail(`${path}: admin overlay has no accessible name, got "${state.name}"`);
  if(state.closeName!=='Schließen')fail(`${path}: admin overlay close control has no accessible name, got "${state.closeName}"`);
  if(!state.focusInside)fail(`${path}: focus was not moved into the admin overlay`);
  if(state.inertSupported&&!state.backgroundShielded)fail(`${path}: content behind the admin overlay stays reachable`);
  if(!state.bodyLocked)fail(`${path}: background page was not locked while the overlay is open`);
  // Der Tastaturfokus darf den Dialog nicht verlassen - unabhängig davon, ob die Engine inert kennt.
  for(let i=0;i<30;i++)await page.keyboard.press('Tab');
  if(!(await page.evaluate(()=>{const back=document.querySelector('.modal-back');return !!(back&&document.activeElement&&back.contains(document.activeElement));})))
    fail(`${path}: keyboard focus escaped the open dialog`);
  // Getippte Eingaben dürfen nicht kommentarlos verloren gehen.
  await page.locator('.modal-back input[name="e2e-note"]').fill('nicht verlieren');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  if(!(await page.locator('.modal-back').count()))fail(`${path}: Escape discarded typed input without asking`);
  if(!(await page.locator('.modal-back [data-kp-close-hint]').count()))fail(`${path}: Escape on a dialog with unsaved input gave no warning`);
  if(await page.locator('.modal-back input[name="e2e-note"]').inputValue()!=='nicht verlieren')fail(`${path}: typed input was altered by the close attempt`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  if(await page.locator('.modal-back').count())fail(`${path}: a confirmed Escape did not close the admin overlay`);
  const released=await page.evaluate(()=>({
    inert:[...document.body.children].some(el=>el.inert===true),
    locked:document.body.classList.contains('kp-admin-modal-open'),
    active:document.activeElement?.tagName||'BODY'
  }));
  if(released.inert)fail(`${path}: page behind the dialog stayed unreachable after closing`);
  if(released.locked)fail(`${path}: background page stayed locked after closing`);
  if(before!=='BODY'&&released.active==='BODY')fail(`${path}: focus was not returned to the page after closing`);
  console.log(`Admin dialog contract on ${path}: OK`);
}

const expectedCandidate401Paths=new Set(['/api/auth/me','/api/attendance/teacher/courses']);
function expectedBrowserHttpError(entry){if(mode!=='candidate'||entry.status!==401)return false;let path='';try{path=new URL(entry.url).pathname;}catch{return false;}return expectedCandidate401Paths.has(path);}

// Die erste Navigation trägt den Kaltstart der Engine mit. WebKit brauchte dafür auf dem Runner
// mehr als die 30 Sekunden, die für eine einzelne Route gedacht sind, und die Zeitüberschreitung
// las sich dann wie ein Fehler von /plattform-admin. Der Kaltstart bekommt deshalb sein eigenes,
// benanntes Zeitfenster und meldet, wie lange er wirklich gedauert hat - die eigentlichen
// Prüfungen danach behalten ihr unverändertes Budget.
async function warmUp(){
  const started=Date.now();
  const response=await navigate(page,`${base}/plattform-admin`,{waitUntil:'domcontentloaded',timeout:90000})
    .catch(error=>fail(`${engineName} could not open /plattform-admin at all: ${String(error?.message||error).split('\n')[0]}`));
  if(!response)fail(`${engineName} got no response for the first navigation`);
  console.log(`${engineName} cold start to /plattform-admin: ${response.status()} in ${Date.now()-started}ms`);
}

try{
  await warmUp();
  if(mode==='candidate'){
    await candidateSurface();
    await internalLinkAudit(['/produkt','/testcenter.html','/impressum','/datenschutz']);
    await onboardingNegativeValidation();
    await concurrentOnboardingClaim();
    await mobileOnboardingPreflight();
    await acceptedOfferOnboarding();
    await adminDialogContract('/kunden-admin');
    await adminDialogContract('/plattform-admin');
  }else if(mode==='locked-production')await lockedProductionSurface();
  else fail(`Unsupported E2E_TARGET_MODE: ${mode}`);

  if(adminEmail&&adminPassword){
    if(mode!=='locked-production')console.log('authenticated live platform path is intentionally not executed against the local PR candidate');
    else{
      await route('/plattform-admin');
      const email=page.locator('input[type="email"],input[name="email"],input[name="login"]').first(),password=page.locator('input[type="password"]').first();
      if(!(await email.count())||!(await password.count()))fail('platform login controls not found');
      await email.fill(adminEmail);await password.fill(adminPassword);
      const submit=page.locator('form button[type="submit"],form.login button,button[type="submit"]').first();
      if(!(await submit.count()))fail('platform login submit not found');
      await submit.click();
      // Ein fester Wartewert ist gegen die Produktion eine Wette auf die Latenz. Die Sitzung selbst
      // sagt, ob die Anmeldung wirklich gelungen ist - und benennt sonst, woran es lag, statt eine
      // fehlende Navigation zu melden, die nur die Folge wäre. Anmeldedaten bleiben ungenannt.
      let session={status:0,platform:false,mustChange:false,error:''};
      for(let attempt=0;attempt<20;attempt++){
        session=await page.evaluate(async()=>{try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json();}catch{}
          return{status:r.status,platform:!!d?.user?.isPlatformAdmin,mustChange:!!d?.user?.mustChangePassword,error:String(d?.error||'')};}catch(e){return{status:0,platform:false,mustChange:false,error:'FETCH_FAILED'};}});
        if(session.status===200||session.error)break;
        await page.waitForTimeout(500);
      }
      if(session.status!==200)fail(`platform acceptance account could not sign in: /api/auth/me answered ${session.status}${session.error?` ${session.error}`:''}. Check E2E_PLATFORM_EMAIL/E2E_PLATFORM_PASSWORD.`);
      if(session.mustChange)fail('platform acceptance account must change its password before it can be used for acceptance');
      if(!session.platform)fail('the configured acceptance account is signed in but is not a platform administrator');
      const offers=page.getByRole('button',{name:/Angebote/i}).first();
      await offers.waitFor({state:'visible',timeout:20000}).catch(()=>undefined);
      if(!(await offers.count()))fail(`Angebote navigation did not appear for a signed-in platform administrator; shell shows: ${(await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,200)}`);
      await offers.click();
      await page.getByText(/Angebote können|Freigabe noch gesperrt/i).first().waitFor({state:'visible',timeout:20000}).catch(()=>undefined);
      if(!(await page.getByText(/Angebote können|Freigabe noch gesperrt/i).count()))fail('offer manager did not open');
      const managerText=await page.locator('body').innerText();
      if(!/automatisch versendet|E-Mailversand/i.test(managerText))fail('offer manager does not expose mail delivery readiness');
      // Derselbe Vertrag muss auch für einen echten Produktdialog gelten, nicht nur für den eingehängten.
      if(await page.locator('.modal-back').count()){
        const real=await page.evaluate(()=>{const back=document.querySelector('.modal-back'),panel=back.querySelector('.modal')||back,by=panel.getAttribute('aria-labelledby');return{role:panel.getAttribute('role'),modal:panel.getAttribute('aria-modal'),named:!!(panel.getAttribute('aria-label')||(by&&document.getElementById(by))),focusInside:back.contains(document.activeElement)};});
        if(real.role!=='dialog'||real.modal!=='true'||!real.named)fail(`offer manager dialog is not an accessible dialog: ${JSON.stringify(real)}`);
        if(!real.focusInside)fail('offer manager dialog did not receive focus');
        await page.keyboard.press('Escape');await page.waitForTimeout(400);
        if(await page.locator('.modal-back').count())fail('offer manager dialog cannot be closed with Escape');
      }
      console.log('authenticated platform offer manager browser path: OK');
    }
  }else console.log('authenticated live browser path not configured; local candidate onboarding/admin path still executed');

  await mobileSurface();await page.waitForTimeout(250);
  await publicDocumentContract();
  if(mode==='candidate')await platformAdministrationContract();
  const expectedHttp=httpErrors.filter(expectedBrowserHttpError),unexpectedHttp=httpErrors.filter(entry=>!expectedBrowserHttpError(entry)),unexpected401=unexpectedHttp.some(entry=>entry.status===401);
  const relevantConsole=consoleErrors.filter(text=>{if(/favicon|Failed to load resource.*404/i.test(text))return false;if(/^Failed to load resource:.*status of 401\b/i.test(text)&&expectedHttp.length>0&&!unexpected401)return false;return true;});
  if(pageErrors.length)fail(`page errors: ${pageErrors.join(' | ')}`);if(unexpectedHttp.length)fail(`unexpected browser HTTP responses: ${unexpectedHttp.map(x=>`${x.status} ${x.url}`).join(' | ')}`);if(relevantConsole.length)fail(`console errors: ${relevantConsole.join(' | ')}`);if(failedRequests.length)fail(`failed browser requests: ${failedRequests.join(' | ')}`);
  // Abgebrochene Anfragen sind fuer sich unbedenklich - solange derselbe Pfad im Lauf auch
  // beantwortet wurde. Ein Pfad, der nur abbricht, hat nie geliefert und ist ein Befund.
  const unanswered=aborts.unanswered();
  if(unanswered.length)fail(`abgebrochene Anfragen ohne je eine Antwort: ${unanswered.join(' | ')}`);
  if(aborts.total())console.log(`${aborts.total()} abgebrochene Anfragen, alle auf Pfaden, die im Lauf auch beantwortet wurden.`);
  console.log(`Commercial real-browser acceptance (${mode}): OK`);
}finally{await browser.close();}
