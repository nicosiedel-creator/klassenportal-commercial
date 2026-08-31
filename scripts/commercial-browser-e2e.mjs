import { chromium, firefox, webkit } from 'playwright';

// Der Gate läuft standardmäßig auf Chromium. Über E2E_BROWSER lässt sich derselbe Ablauf
// unverändert auf Firefox und WebKit fahren, damit browserabhängige Fehler auffallen,
// statt unbemerkt zu bleiben.
const ENGINES={chromium,firefox,webkit};
const engineName=String(process.env.E2E_BROWSER||'chromium').trim().toLowerCase();
const engine=ENGINES[engineName];
if(!engine)throw new Error(`Unsupported E2E_BROWSER: ${engineName}`);

const base=(process.env.COMMERCIAL_BASE_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
// Die Plattform-Anmeldung braucht einen eigenen Ursprung, und zwar aus einem Sicherheitsgrund:
// issueSession wirft PLATFORM_ORIGIN_MISMATCH, sobald eine Plattformsitzung nicht an APP_ORIGIN
// ausgestellt wird. Die Abnahme lief gegen die workers.dev-Adresse und konnte deshalb nie
// hineinkommen - nachgemessen: HTTP 403, {"error":"PLATFORM_ORIGIN_MISMATCH"}. Die Sperrprüfung
// bleibt trotzdem auf workers.dev, denn dort ist die Sperre bedingungslos; auf der Produktions-
// domain haengt sie an der Freigabe der Worker-Version und waere damit eine schwaechere Aussage.
const platformBase=(process.env.COMMERCIAL_PLATFORM_URL||base).replace(/\/$/,'');
const mode=String(process.env.E2E_TARGET_MODE||'candidate').trim();
// Ob die Produktion freigegeben ist, entscheidet nicht der Aufrufer, sondern die Produktion selbst.
// Sonst muesste jemand daran denken, den Modus umzustellen, sobald freigegeben wird - und die
// Abnahme waere ab diesem Moment rot, obwohl alles richtig ist. Der Wert wird einmal gemessen,
// bevor irgendetwas darauf aufbaut, und im Protokoll benannt.
let productionReleased=false;
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
// Die Produktionsdomain steht hinter einem Bot-Schutz: sie beantwortet eine Anfrage mit
// Automatisierungskennung mit 403. Der Live-Smoke oeffnet klassenportal.app deshalb seit jeher
// mit einer gewoehnlichen Browserkennung - die Abnahme tat es nicht und lief in dieselbe 403,
// diesmal auf /plattform-admin. Es geht dabei nicht darum, eine Schranke zu umgehen, sondern
// darum, die eigene Seite so zu bedienen, wie ein Kunde sie bedient: mit einem normalen Browser.
const DESKTOP_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const browser=await engine.launch({headless:true,...(engineName==='chromium'?{args:['--disable-blink-features=AutomationControlled']}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'de-DE',userAgent:DESKTOP_UA});
const pageErrors=[],consoleErrors=[],failedRequests=[],httpErrors=[];
// Ein Seitenfehler ohne Herkunft ist nicht behebbar: "Cannot set properties of undefined" sagt
// nicht, welche Seite und welche Datei. Deshalb immer Meldung, erste Aufrufstellen und Adresse.
function pageErrorDetail(page,error){
  const stack=String(error?.stack||'').split('\n').slice(1,4).map(x=>x.trim()).filter(Boolean).join(' <- ');
  let url='';try{url=page.url();}catch{}
  return `${String(error)}${stack?` [${stack}]`:''}${url?` @ ${url}`:''}`;
}
page.on('pageerror',e=>pageErrors.push(pageErrorDetail(page,e)));
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
    // Beantwortet heisst beantwortet, nicht erfolgreich. /api/attendance/teacher/courses
    // antwortet unangemeldet mit 401 - der einzigen Antwort, die es dort je gibt. Mit einer
    // Statusschranke bei 400 konnte dieser Pfad die Bedingung nie erfuellen, und der erste
    // Abbruch meldete einen Produktfehler, den es nicht gab. Ob eine 401 an dieser Stelle
    // richtig ist, prueft der HTTP-Vertrag weiter unten, nicht dieser Zaehler.
    serve(response){served.add(pathOf(response.url()));},
    note(request,errorText){
      if(request.method()!=='GET'||!NAVIGATION_ABORT.some(pattern=>pattern.test(errorText)))return false;
      const path=pathOf(request.url());
      aborted.set(path,(aborted.get(path)||0)+1);
      return true;
    },
    unanswered(){return[...aborted].filter(([path])=>!served.has(path)).map(([path,count])=>`${path} (${count}x abgebrochen, nie beantwortet)`);},
    total(){return[...aborted.values()].reduce((sum,count)=>sum+count,0);},
    // Genau die Pfade, die im Lauf abgebrochen UND beantwortet wurden - also die, deren Abbruch
    // oben bereits als unbedenklich verbucht ist.
    abortedAndAnswered(){return[...aborted.keys()].filter(path=>served.has(path));},
  };
}
const aborts=abortTracker();
function navigationAbort(request,errorText){return aborts.note(request,errorText);}
async function settle(target){await target.waitForLoadState('networkidle',{timeout:8000}).catch(()=>undefined);}
async function navigate(target,url,options){navigation.depth++;try{return await target.goto(url,options);}finally{await settle(target);navigation.depth--;}}
// Eine Anfrage, die der Browser wegen unserer eigenen CSP verweigert, ist kein Fehlschlag des
// Portals - sie ist die CSP bei der Arbeit. Cloudflare injiziert seinen Web-Analytics-Beacon in
// die Seite; script-src 'self' laesst ihn nicht laufen. Der Host steht namentlich hier, damit
// keine andere blockierte Anfrage stillschweigend mitverschwindet.
const CSP_BLOCKED_EXTERNAL=/^https:\/\/static\.cloudflareinsights\.com\//;
// WebKit meldet einen abgebrochenen fetch zweimal: einmal als requestfailed - dort verbucht ihn
// der Abbruchzaehler oben - und einmal als Konsolenmeldung "Fetch API cannot load <URL> due to
// access control checks.", die Playwright fuer WebKit als pageerror weiterreicht. Deshalb schlug
// der WebKit-Lauf am Ende mit zwei Seitenfehlern fehl, obwohl der gesamte Ablauf durchlief und
// /api/auth/me im selben Lauf hundertfach beantwortet wurde. Die Stellen fangen die Ablehnung
// selbst ab (routeAdmin und routeParticipant haben beide try/catch) - es ist also nichts
// unbehandelt, sondern dieselbe Meldung ein zweites Mal.
//
// Verworfen wird deshalb ausschliesslich, was dieselbe Bedingung erfuellt wie ein unbedenklicher
// Abbruch: die Meldung ist ein Ladefehler UND sie nennt einen Pfad, den der Abbruchzaehler in
// diesem Lauf sowohl abgebrochen als auch beantwortet gesehen hat. Trifft das nicht zu - weil
// gar kein Abbruch verbucht wurde oder der Pfad nie geliefert hat -, bleibt es ein Befund. Eine
// von der CSP verweigerte Anfrage faellt nicht darunter: ihr errorText passt auf kein
// Abbruchmuster, sie landet also in failedRequests und laesst den Lauf weiterhin scheitern.
const LOAD_FAILURE=/cannot load|failed to fetch|networkerror|load failed|network error|abgebrochen/i;
function abortedPageErrors(details,abortedAndAnsweredPaths){return details.filter(detail=>pageErrorIsKnownAbort(detail,abortedAndAnsweredPaths));}
function pageErrorIsKnownAbort(detail,abortedAndAnsweredPaths){
  const text=String(detail||'');
  if(!LOAD_FAILURE.test(text))return false;
  return abortedAndAnsweredPaths.some(path=>path.length>1&&text.includes(path));
}
page.on('requestfailed',request=>{const errorText=request.failure()?.errorText||'failed';if(navigationAbort(request,errorText))return;if(/csp/i.test(errorText)&&CSP_BLOCKED_EXTERNAL.test(request.url()))return;failedRequests.push(`${request.method()} ${request.url()} :: ${errorText}`);});
// Eine Antwort, die eine Navigation ausdruecklich zulaesst, ist keine unerwartete Antwort. Die
// Release-Sperre antwortet auf /produkt, /kunden-admin und /dozentenportal mit 503 - genau das
// verlangt lockedProductionSurface dort mit allowStatuses:[503] und prueft zusaetzlich den Text
// der Sperrseite. Die Sammelprüfung am Ende meldete dieselben drei Antworten trotzdem als
// unerwartet: ein Widerspruch in derselben Datei. Die Erwartung wird deshalb dort vermerkt, wo
// sie deklariert wird - an der Navigation selbst -, statt in einer zweiten Liste, die abdriften
// kann. Jede andere Antwort ab 400 faellt unveraendert auf.
const routeAllowedErrors=new Set();
page.on('response',response=>{aborts.serve(response);if(response.status()>=400)httpErrors.push({status:response.status(),url:response.url()});});

async function route(path,{allowStatuses=[200],waitForResponsePath=null}={}){
  const backgroundResponse=waitForResponsePath?page.waitForResponse(response=>{try{return new URL(response.url()).pathname===waitForResponsePath;}catch{return false;}},{timeout:10000}):null;
  const response=await navigate(page,base+path,{waitUntil:'domcontentloaded',timeout:30000});
  if(!response)fail(`No response for ${path}`);
  if(response.status()>=400&&allowStatuses.includes(response.status()))routeAllowedErrors.add(`${response.status()} ${response.url()}`);
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
  // Diese Rollenweiterleitung laeuft noch, wenn der naechste Schritt selbst /kunden-admin
  // aufruft - beide Navigationen zielen auf dieselbe Adresse, und Playwright bricht die eigene
  // mit "interrupted by another navigation" ab. Das ist kein Fehler des Portals, sondern ein
  // Wettlauf des Laufs mit ihm: erst die Weiterleitung ankommen lassen, dann weiterarbeiten.
  await page.waitForURL(url=>new URL(url).pathname==='/kunden-admin',{timeout:20000})
    .catch(()=>fail(`role routing did not land on the customer admin surface, stopped at ${new URL(page.url()).pathname}`));
  await settle(page);

  const completed=await api(`/api/onboarding/${encodeURIComponent(onboardingToken)}`);if(completed.status!==200||completed.data?.invitation?.status!=='completed')fail('successful browser onboarding did not persist completed invitation');
  const replay=await api(`/api/onboarding/${encodeURIComponent(onboardingToken)}`,{method:'POST',body:{}});if(replay.status===200||replay.data?.error!=='ONBOARDING_UNAVAILABLE')fail(`browser onboarding replay must fail closed, got ${replay.status}/${replay.data?.error}`);
  console.log('Accepted paid offer -> browser onboarding -> auto-login -> customer portal: OK');
}

// Nach der Freigabe antworten dieselben Seiten mit 200 statt 503 - die Sperrpruefung waere dann
// rot, obwohl alles richtig ist. Die Abnahme muss deshalb beide Zustaende kennen. Sie raet dabei
// nicht: sie fragt den Zustand ab und prueft anschliessend genau das, was in ihm gilt. Was in
// beiden Zustaenden gelten muss - der Zahlungs-Freeze, der Schutz der Plattformrouten - wird in
// beiden geprueft.
async function productionIsReleased(){
  const state=await api('/api/public/product');
  if(state.status===503)return false;
  if(state.status===200)return true;
  fail(`/api/public/product antwortete ${state.status}; weder gesperrt (503) noch freigegeben (200)`);
}

// Diese Zusicherungen gelten unabhaengig von der Freigabe. Der Zahlungs-Freeze gehoert dazu: er
// darf sich durch das Livegehen unter keinen Umstaenden loesen.
async function sharedProductionGuards(){
  const invitation=await api('/api/platform/onboarding-invitations');if(![401,403].includes(invitation.status))fail(`unauthenticated onboarding invitations must be protected, got ${invitation.status}`);
  const frozenWebhook=await api('/api/payments/stripe/webhook',{method:'POST',body:{}});if(frozenWebhook.status!==200||frozenWebhook.data?.ignored!==true||frozenWebhook.data?.paymentProcessing!=='disabled')fail('payment webhook did not remain frozen after release');
}

async function releasedProductionSurface(){
  await route('/plattform-admin');
  for(const path of ['/produkt','/kunden-admin','/dozentenportal']){
    const text=await route(path);
    if(/noch nicht für den Produktivbetrieb freigegeben/i.test(text))fail(`${path} zeigt die Sperrseite, obwohl die Produktion freigegeben ist`);
    if(text.replace(/\s+/g,' ').trim().length<200)fail(`${path} lieferte kaum Inhalt: ${text.replace(/\s+/g,' ').trim().slice(0,120)}`);
  }
  const health=await api('/api/public/product');if(health.status!==200)fail(`/api/public/product muss nach der Freigabe antworten, war ${health.status}`);
  await sharedProductionGuards();
  console.log('Freigegebene Produktion: Kundenseiten erreichbar, Plattformrouten geschützt, Zahlung weiterhin stillgelegt: OK');
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
  mobile.on('pageerror',e=>errors.push(pageErrorDetail(mobile,e)));
  mobile.on('requestfailed',r=>{const errorText=r.failure()?.errorText||'failed';if(navigationAbort(r,errorText))return;failed.push(`${r.method()} ${r.url()} :: ${errorText}`);});
  mobile.on('response',r=>{aborts.serve(r);if(r.status()<500)return;let path='';try{path=new URL(r.url()).pathname;}catch{}const expectedLocked=mode==='locked-production'&&!productionReleased&&r.status()===503&&MOBILE_RELEASE_LOCKED.includes(path);if(!expectedLocked)serverErrors.push(`${r.status()} ${r.url()}`);});
  try{
    for(const path of MOBILE_PATHS){
      const expected=mode==='locked-production'&&!productionReleased&&MOBILE_RELEASE_LOCKED.includes(path)?[503]:[200];
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
  admin.on('pageerror',error=>pageErrors.push(pageErrorDetail(admin,error).slice(0,400)));
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
    await setupLinkLeadsToAWorkingPortal(admin);
  }finally{await context.close();}
}

// Beide Haelften des kommerziellen Wegs waren geprueft, der Weg selbst nie: dass die
// Plattformverwaltung einen Einrichtungslink erzeugt, war das eine, dass ein Kunde sich ueber
// einen Link einrichtet, das andere - der Lauf benutzte dafuer einen gesetzten Token, nie den
// gerade erzeugten. Diese Pruefung faehrt die Kette an einem Stueck: erzeugen, in einem
// sitzungsfreien Fenster oeffnen, ausfuellen, absenden, angemeldet im Portal ankommen, und der
// Link darf danach nicht noch einmal funktionieren.
async function setupLinkLeadsToAWorkingPortal(admin){
  // Der vorherige Schritt laesst die Rueckfrage vor dem Widerruf offen. Alle Dialoge schliessen
  // und die Kunden-Einrichtung frisch oeffnen - das ist unabhaengig davon, wie viele Ebenen
  // Escape auf einmal abraeumt.
  for(let attempt=0;attempt<6;attempt++){
    if(!await admin.locator('[role="dialog"]').count())break;
    await admin.keyboard.press('Escape');
    await admin.waitForTimeout(400);
  }
  await admin.locator('aside.side button.nav').filter({hasText:/^Kunden-Einrichtung$/}).first().click();
  await admin.locator('#pa-new').waitFor({timeout:15000});
  const stamp=Date.now();
  const customer=`browser-e2e-durchstich-${stamp}@example.invalid`;
  const created=admin.waitForResponse(response=>{
    try{return new URL(response.url()).pathname==='/api/platform/onboarding-invitations'&&response.request().method()==='POST';}catch{return false;}
  },{timeout:20000});
  await admin.locator('#pa-new input[name="customer_email"]').fill(customer);
  await admin.locator('#pa-new button').filter({hasText:'Einrichtungslink erzeugen'}).first().click();
  if(!(await created.catch(()=>null)))fail('the second customer setup link was not created');
  const link=await admin.locator('#pa-created #pa-link').inputValue().catch(()=>'');
  if(!/\/einrichtung\//.test(link))fail(`the created setup link is not an onboarding link: ${link.slice(0,80)}`);
  const target=link.replace(/^https?:\/\/[^/]+/,base);

  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'de-DE'});
  const customerPage=await context.newPage();
  const serverErrors=[],pageErrors=[];
  customerPage.on('pageerror',error=>pageErrors.push(pageErrorDetail(customerPage,error).slice(0,400)));
  customerPage.on('response',response=>{if(response.status()>=500){let path='';try{path=new URL(response.url()).pathname;}catch{}serverErrors.push(`${response.status()} ${path}`);}});
  try{
    const opened=await navigate(customerPage,target,{waitUntil:'domcontentloaded',timeout:30000});
    if(!opened||opened.status()!==200)fail(`the setup link answered ${opened?.status()??'nothing'} for a visitor without a session`);
    await customerPage.locator('#onboarding-form').waitFor({timeout:20000})
      .catch(()=>fail('the setup link did not render the onboarding form'));

    const password=`Durchstich-${stamp}-2026!`;
    const set=async(name,value)=>{const field=customerPage.locator(`#onboarding-form [name="${name}"]`).first();if(await field.count())await field.fill(value).catch(()=>undefined);};
    for(const [name,value] of [['legal_name','Durchstich Bildungswerk GmbH'],['portal_name','Durchstich Portal'],
      ['street','Teststraße 1'],['postal_code','10115'],['city','Berlin'],['country','Deutschland'],
      ['contact_name','Durchstich Kontakt'],['desired_course_count','2'],
      ['admin_name','Durchstich Verwaltung'],['admin_email',customer],
      ['admin_password',password],['admin_password_confirm',password],
      ['first_course_name','Durchstich Kurs'],['first_course_code',`DS-${String(stamp).slice(-4)}`]])await set(name,value);
    const sameAdmin=customerPage.locator('#same-admin');
    if(await sameAdmin.count()&&await sameAdmin.isChecked())await sameAdmin.uncheck().catch(()=>undefined);

    // Was der Browser danach noch als Pflicht meldet, wird plausibel gefuellt. Das haelt die
    // Pruefung gegen Formularaenderungen stabil, ohne blind zu werden: gemessen wird das
    // Ergebnis - 200, angemeldet, Portal erreichbar - nicht das Ausfuellen.
    for(let round=0;round<3;round++){
      const pending=await customerPage.evaluate(()=>[...document.querySelectorAll('#onboarding-form input,#onboarding-form select,#onboarding-form textarea')]
        .filter(el=>!el.disabled&&!el.checkValidity()).map(el=>({name:el.name||el.id||'',type:el.type})));
      if(!pending.length)break;
      for(const {name,type} of pending){
        if(!name)continue;
        const field=customerPage.locator(`#onboarding-form [name="${name}"]`).first();
        if(type==='checkbox'){await field.check({timeout:3000}).catch(()=>undefined);continue;}
        if(type==='email'){await field.fill(`kontakt-${stamp}@example.invalid`).catch(()=>undefined);continue;}
        if(type==='number'){await field.fill('2').catch(()=>undefined);continue;}
        await field.fill('Durchstich').catch(()=>undefined);
      }
    }

    const submitted=customerPage.waitForResponse(response=>{
      try{return response.request().method()==='POST'&&new URL(response.url()).pathname.startsWith('/api/onboarding/');}catch{return false;}
    },{timeout:40000});
    await customerPage.locator('#submit-setup').click();
    const response=await submitted.catch(()=>null);
    if(!response)fail(`submitting the onboarding form sent no request; the form reported: ${(await customerPage.locator('#setup-error').innerText().catch(()=>''))||'nothing'}`);
    let data=null;try{data=await response.json();}catch{}
    if(response.status()!==200||data?.ok!==true)fail(`onboarding through a freshly created setup link failed ${response.status()}/${data?.error||'NO_JSON'}`);

    await customerPage.waitForTimeout(2500);
    const me=await customerPage.evaluate(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin'});return{status:r.status,data:await r.json().catch(()=>null)};});
    if(me.status!==200||!me.data?.user)fail(`the new customer administrator was not signed in after onboarding: ${me.status}`);
    const portal=await context.request.get(`${base}/kunden-admin`);
    if(portal.status()!==200)fail(`the new customer administrator cannot open the customer portal: ${portal.status()}`);

    const replay=await context.request.post(target.replace('/einrichtung/','/api/onboarding/'),{data:{}});
    if(replay.status()===200)fail('a used setup link must not work a second time');

    if(pageErrors.length)fail(`onboarding through the created link raised page errors: ${pageErrors.join(' | ')}`);
    if(serverErrors.length)fail(`onboarding through the created link hit server errors: ${serverErrors.join(' | ')}`);
    console.log('Created setup link -> customer onboards -> signed in on the customer portal, link single-use: OK');
  }finally{await context.close();}
}

// Der Dialogvertrag wurde bisher an einem eingehaengten, nackten Overlay geprueft. Der
// Education-OS-Overlay des Autopiloten baut sein eigenes bildschirmfuellendes Fenster mit
// eigenen Klassennamen und war deshalb als einziger nicht erfasst: gemessen ohne Dialogrolle,
// ohne Namen, mit bedienbarem Hintergrund, der Tabulator lief nach elf Spruengen heraus, und
// Escape schloss nichts. Diese Pruefung faehrt den echten Overlay, nicht einen nachgebauten.
async function educationOsDialogContract(){
  await route('/kunden-admin');
  const opener=page.locator('#kp-autopilot-primary');
  if(!(await opener.count()))fail('the customer administration has no Autopilot entry');
  if(await page.locator('#kp-autopilot-primary').count()!==1)fail(`the Autopilot entry exists ${await page.locator('#kp-autopilot-primary').count()} times - its id must be unique`);
  await opener.click();
  await page.locator('.eo-os-back').waitFor({timeout:20000}).catch(()=>fail('the Autopilot did not open its surface'));
  await page.waitForTimeout(1200);

  const state=await page.evaluate(()=>{
    const back=document.querySelector('.eo-os-back');
    const panel=back.querySelector('.eo-os-shell')||back;
    const labelled=panel.getAttribute('aria-labelledby');
    return{
      role:panel.getAttribute('role'),
      modal:panel.getAttribute('aria-modal'),
      name:(panel.getAttribute('aria-label')||(labelled?(document.getElementById(labelled)?.textContent||''):'')).trim(),
      unshielded:[...document.body.children]
        .filter(el=>el!==back&&!['SCRIPT','LINK','STYLE','TEMPLATE','NOSCRIPT'].includes(el.tagName)
          &&!el.matches('[role="status"],[role="alert"],[aria-live]')&&el.inert!==true)
        .map(el=>`${el.tagName}.${String(el.className).slice(0,30)}`),
      duplicates:(()=>{const seen=new Map();for(const el of document.querySelectorAll('[id]'))seen.set(el.id,(seen.get(el.id)||0)+1);return[...seen].filter(([,n])=>n>1).map(([id,n])=>`${id} (${n}x)`);})(),
    };
  });
  if(state.role!=='dialog')fail(`the Autopilot surface announces role "${state.role}" instead of dialog`);
  if(state.modal!=='true')fail('the Autopilot surface is not marked as modal');
  if(!state.name)fail('the Autopilot surface carries no accessible name');
  if(state.unshielded.length)fail(`the content behind the Autopilot surface stays reachable: ${state.unshielded.join(', ')}`);
  if(state.duplicates.length)fail(`the open Autopilot surface leaves duplicate element ids: ${state.duplicates.join(', ')}`);

  // Der Tabulator darf das Fenster nicht verlassen - sonst bedient der Benutzer die verdeckte
  // Navigation dahinter, ohne sie zu sehen.
  await page.locator('.eo-os-back button, .eo-os-back input, .eo-os-back textarea').first().focus().catch(()=>undefined);
  for(let step=0;step<40;step++){
    await page.keyboard.press('Tab');
    const outside=await page.evaluate(()=>{const active=document.activeElement;return !active||!active.closest('.eo-os-back');});
    if(outside)fail(`the keyboard focus left the Autopilot surface after ${step+1} tab presses`);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  if(await page.locator('.eo-os-back').count())fail('Escape did not close the Autopilot surface');
  console.log('Education OS surface obeys the shared dialog contract: OK');
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
      if(mode==='locked-production'&&!productionReleased&&MOBILE_RELEASE_LOCKED.includes(path))continue;
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
    const offerText=(await doc.locator('body').innerText()).replace(/\s+/g,' ').trim();
    // /angebot gehoert zu den Seiten, die eine gesperrte Produktion sperrt - die Schleife oben
    // ueberspringt sie dort bereits. Dieser Block tat es nicht und verlangte auch in Produktion die
    // Meldung der Angebotsseite, obwohl dort die Sperrseite steht. Beide Modi pruefen jetzt das,
    // was in ihnen richtig ist; die Zusicherung, dass ohne Token kein Angebot abgefragt wird, gilt
    // in beiden.
    if(mode==='locked-production'&&!productionReleased){
      if(!/nicht verfügbar|nicht für den Produktivbetrieb freigegeben/i.test(offerText))
        problems.push(`/angebot zeigt in der gesperrten Produktion weder Sperrhinweis noch Freigabehinweis: ${offerText.slice(0,120)}`);
    }else if(!/unvollständig/i.test(offerText)){
      problems.push(`/angebot ohne Token meldet nicht, dass der Link unvollständig ist: ${offerText.slice(0,120)}`);
    }

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
function expectedBrowserHttpError(entry){if(routeAllowedErrors.has(`${entry.status} ${entry.url}`))return true;if(mode!=='candidate'||entry.status!==401)return false;let path='';try{path=new URL(entry.url).pathname;}catch{return false;}return expectedCandidate401Paths.has(path);}

// Die erste Navigation trägt den Kaltstart der Engine mit. WebKit brauchte dafür auf dem Runner
// mehr als die 30 Sekunden, die für eine einzelne Route gedacht sind, und die Zeitüberschreitung
// las sich dann wie ein Fehler von /plattform-admin. Der Kaltstart bekommt deshalb sein eigenes,
// benanntes Zeitfenster und meldet, wie lange er wirklich gedauert hat - die eigentlichen
// Prüfungen danach behalten ihr unverändertes Budget.
// Bleibt die erste Navigation haengen, sagt "Timeout" allein nicht, woran es lag. Drei Faelle
// sehen gleich aus und brauchen ganz verschiedene Antworten: die Engine laedt ueberhaupt nichts
// (kaputte Installation), sie laedt eingebaute Inhalte, erreicht aber den lokalen Server nicht
// (Netzwerk), oder sie erreicht ihn und diese eine Seite haengt (Produktfehler). WebKit schickte
// auf dem Runner in 90 Sekunden keine einzige Anfrage - das Worker-Protokoll zeigte nach den
// Bereitschaftsabfragen nichts mehr. Diese Diagnose trennt die Faelle, statt sie zu raten.
async function firstNavigationDiagnosis(){
  const findings=[];
  const probe=async(label,url,timeout)=>{
    const started=Date.now();
    try{await page.goto(url,{waitUntil:'domcontentloaded',timeout});findings.push(`${label}: ok in ${Date.now()-started}ms`);return true;}
    catch(error){findings.push(`${label}: ${String(error?.message||error).split('\n')[0]}`);return false;}
  };
  const blank=await probe('about:blank','about:blank',15000);
  if(blank)await probe('eingebautes Dokument','data:text/html,<title>x</title><p>x',15000);
  try{
    const response=await fetch(`${base}/plattform-admin`,{redirect:'manual'});
    findings.push(`node erreicht den Server: ${response.status}`);
  }catch(error){findings.push(`node erreicht den Server nicht: ${String(error?.message||error).split('\n')[0]}`);}

  // Die Engine kann eingebaute Dokumente laden, erreicht den lokalen Server aber offenbar nicht.
  // Ein Abruf aus der Seite heraus taugt dafuer nicht - about:blank hat einen undurchsichtigen
  // Ursprung, jeder Abruf scheitert dort an der Ursprungspruefung, nicht am Netz. Zwei kurze
  // Navigationen messen die Netzschicht wirklich und trennen "der Port ist unerreichbar" von
  // "die Engine mag diese Adressform nicht".
  const {port}=new URL(base);
  for(const [label,url] of [['über IP',`http://127.0.0.1:${port}/plattform-admin`],['über localhost',`http://localhost:${port}/plattform-admin`]])
    await probe(`Navigation ${label}`,url,12000);
  return findings.join(' | ');
}

async function warmUp(){
  const started=Date.now();
  const response=await navigate(page,`${base}/plattform-admin`,{waitUntil:'domcontentloaded',timeout:90000})
    .catch(async error=>{
      const diagnosis=await firstNavigationDiagnosis().catch(problem=>`Diagnose selbst gescheitert: ${String(problem?.message||problem).split('\n')[0]}`);
      fail(`${engineName} could not open /plattform-admin at all: ${String(error?.message||error).split('\n')[0]} -- Diagnose: ${diagnosis}`);
    });
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
    await educationOsDialogContract();
    await adminDialogContract('/plattform-admin');
  }else if(mode==='locked-production'){
    productionReleased=await productionIsReleased();
    console.log(`Produktionszustand: ${productionReleased?'freigegeben':'gesperrt (noch nicht live freigegeben)'}`);
    if(productionReleased)await releasedProductionSurface();else await lockedProductionSurface();
  }
  else fail(`Unsupported E2E_TARGET_MODE: ${mode}`);

  if(adminEmail&&adminPassword){
    if(mode!=='locked-production')console.log('authenticated live platform path is intentionally not executed against the local PR candidate');
    else{
      const platformResponse=await navigate(page,`${platformBase}/plattform-admin`,{waitUntil:'domcontentloaded',timeout:30000});
      if(!platformResponse)fail(`no response from ${new URL(platformBase).origin}/plattform-admin`);
      if(platformResponse.status()!==200)fail(`platform administration is not reachable at ${new URL(platformBase).origin}: HTTP ${platformResponse.status()}`);
      console.log(`platform sign-in runs against ${new URL(platformBase).origin}`);
      const email=page.locator('input[type="email"],input[name="email"],input[name="login"]').first(),password=page.locator('input[type="password"]').first();
      if(!(await email.count())||!(await password.count()))fail('platform login controls not found');
      await email.fill(adminEmail);await password.fill(adminPassword);
      const submit=page.locator('form button[type="submit"],form.login button,button[type="submit"]').first();
      if(!(await submit.count()))fail('platform login submit not found');
      await submit.click();
      // Ein fester Wartewert ist gegen die Produktion eine Wette auf die Latenz. Die Sitzung selbst
      // sagt, ob die Anmeldung wirklich gelungen ist - und benennt sonst, woran es lag, statt eine
      // fehlende Navigation zu melden, die nur die Folge wäre. Anmeldedaten bleiben ungenannt.
      let session={status:0,signedIn:false,platform:false,mustChange:false,id:'',error:''};
      // Genau in dieser Schleife leitet die Anmeldeseite weiter. Trifft die Abfrage den Moment
      // der Weiterleitung, zerstoert der Browser den Ausfuehrungskontext und Playwright wirft -
      // die Abnahme scheiterte dann an ihrem eigenen Wettlauf, nicht an einem Befund des Portals.
      // Eine zerstoerte Ausfuehrung bedeutet: es wurde navigiert. Das ist genau das, worauf hier
      // gewartet wird, also wird erneut gefragt statt abzubrechen. Jeder andere Fehler bricht
      // weiterhin sofort ab, und die Schleife bleibt begrenzt: ohne angemeldete Sitzung faellt
      // die Abnahme unveraendert durch.
      // /api/auth/me antwortet auch ohne Anmeldung mit 200 und user:null. Auf den Status zu
      // warten hiesse deshalb: gar nicht warten - die Schleife braeche sofort im ersten Durchlauf
      // ab, und der anschliessende Befund machte aus "nicht angemeldet" ein "keine
      // Plattformrechte". Erst eine Sitzung mit Benutzer ist eine Anmeldung.
      const navigationRace=e=>/Execution context was destroyed|Target closed|Target page, context or browser has been closed|frame was detached|navigating/i.test(String(e?.message||e));
      for(let attempt=0;attempt<20;attempt++){
        try{
        session=await page.evaluate(async()=>{try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json();}catch{}
          return{status:r.status,signedIn:!!d?.user,platform:!!d?.user?.isPlatformAdmin,mustChange:!!d?.user?.mustChangePassword,id:String(d?.user?.userId||''),error:String(d?.error||'')};}catch(e){return{status:0,signedIn:false,platform:false,mustChange:false,id:'',error:'FETCH_FAILED'};}});
        }catch(e){
          if(!navigationRace(e))throw e;
          await page.waitForTimeout(500);
          continue;
        }
        if(session.signedIn||session.error)break;
        await page.waitForTimeout(500);
      }
      if(!session.signedIn){
        // Was die Seite anzeigt, benennt die Ursache - falsche Zugangsdaten, gesperrtes Konto,
        // Pflicht zur Neuanmeldung. E-Mail-Adressen werden dabei entfernt: die Adresse steht in
        // einem Secret und gehoert nicht ins Protokoll.
        const shown=String(await page.locator('body').innerText().catch(()=>'')).replace(/\s+/g,' ')
          .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'(Adresse entfernt)').trim().slice(0,240);
        fail(`platform acceptance account is not signed in after submitting the login form: /api/auth/me answered ${session.status} without a user${session.error?` (${session.error})`:''}. The page shows: ${shown||'(nothing)'}. Check E2E_PLATFORM_EMAIL/E2E_PLATFORM_PASSWORD.`);
      }
      if(session.mustChange)fail('platform acceptance account must change its password before it can be used for acceptance');
      // Ohne die Kennung des Kontos ist dieser Befund nicht behebbar: die Adresse steht in einem
      // Secret und laesst sich nicht nachschlagen, und die Sitzung, die sie verraten wuerde,
      // laeuft ab. Die Kennung ist kein Geheimnis - sie benennt genau die Zeile, der die Rechte
      // fehlen. Die Anmeldedaten selbst bleiben weiterhin ungenannt.
      if(!session.platform)fail(`the configured acceptance account is signed in but is not a platform administrator. It is user id ${session.id||'(unknown)'} - grant it platform administration, or point E2E_PLATFORM_EMAIL/E2E_PLATFORM_PASSWORD at an account that already has it.`);
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
  // Zwei Meldungen sind keine Befunde des Portals, sondern Folgen von etwas, das der Lauf selbst
  // verlangt oder das gar nicht aus dem Portal stammt:
  //
  // 1. Eine 503 auf einer Seite, deren Sperrung diese Abnahme ausdruecklich verlangt. Die
  //    Navigation dorthin laesst den Status zu und prueft zusaetzlich den Text der Sperrseite.
  // 2. Die CSP-Verstoesse durch Cloudflares Web-Analytics-Beacon. Der Worker rendert kein einziges
  //    Inline-Skript und keine ausgelieferte Seite fuehrt eines - nachgemessen ueber alle Dateien.
  //    Jede Inline-Skript-Verweigerung in Produktion stammt daher von aussen, ebenso der Versuch,
  //    static.cloudflareinsights.com zu laden. Die CSP tut dort genau das, wofuer sie da ist.
  //    Diese Ausnahme steht und faellt mit dem Beweis: die Abnahmepruefung verlangt, dass weder
  //    Worker noch Seiten je ein Inline-Skript einfuehren. Tun sie es doch, ist die Ausnahme
  //    ungueltig und die Pruefung schlaegt dort an.
  const externalCsp=/Content Security Policy directive: "script-src 'self'"/i;
  const cloudflareBeacon=/static\.cloudflareinsights\.com/i;
  const allowedLockStatuses=new Set(expectedHttp.map(entry=>entry.status));
  const externalNoise=[];
  const relevantConsole=consoleErrors.filter(text=>{
    if(/favicon|Failed to load resource.*404/i.test(text))return false;
    if(/^Failed to load resource:.*status of 401\b/i.test(text)&&expectedHttp.length>0&&!unexpected401)return false;
    const lockStatus=text.match(/^Failed to load resource:.*status of (\d{3})\b/i);
    if(lockStatus&&allowedLockStatuses.has(Number(lockStatus[1]))&&!unexpectedHttp.length)return false;
    if(cloudflareBeacon.test(text)){externalNoise.push(text);return false;}
    if(externalCsp.test(text)&&/Refused to execute inline script/i.test(text)){externalNoise.push(text);return false;}
    return true;
  });
  // Was gefiltert wurde, muss sichtbar bleiben. Sonst beweist ein gruener Lauf nichts darueber, ob
  // die externe Einblendung noch stattfindet - sie waere nur nicht mehr zu sehen. Der Lauf nennt
  // deshalb, was er verworfen hat, und meldet ausdruecklich, wenn nichts zu verwerfen war.
  console.log(externalNoise.length
    ?`${externalNoise.length} externe Meldung(en) ignoriert (nicht aus dem Portal): ${externalNoise.map(t=>t.replace(/\s+/g,' ').slice(0,90)).join(' | ')}`
    :'keine externen Konsolenmeldungen - die Seite laedt nichts Fremdes mehr');
  const knownAborts=abortedPageErrors(pageErrors,aborts.abortedAndAnswered()),realPageErrors=pageErrors.filter(x=>!knownAborts.includes(x));
  console.log(knownAborts.length
    ?`${knownAborts.length} Seitenfehler als bereits verbuchter Abbruch erkannt (Pfad im Lauf abgebrochen und beantwortet): ${knownAborts.map(t=>t.replace(/\s+/g,' ').slice(0,110)).join(' | ')}`
    :'keine Seitenfehler, die auf einen bereits verbuchten Abbruch zurueckgehen');
  if(realPageErrors.length)fail(`page errors: ${realPageErrors.join(' | ')}`);if(unexpectedHttp.length)fail(`unexpected browser HTTP responses: ${unexpectedHttp.map(x=>`${x.status} ${x.url}`).join(' | ')}`);if(relevantConsole.length)fail(`console errors: ${relevantConsole.join(' | ')}`);if(failedRequests.length)fail(`failed browser requests: ${failedRequests.join(' | ')}`);
  // Abgebrochene Anfragen sind fuer sich unbedenklich - solange derselbe Pfad im Lauf auch
  // beantwortet wurde. Ein Pfad, der nur abbricht, hat nie geliefert und ist ein Befund.
  const unanswered=aborts.unanswered();
  if(unanswered.length)fail(`abgebrochene Anfragen ohne je eine Antwort: ${unanswered.join(' | ')}`);
  if(aborts.total())console.log(`${aborts.total()} abgebrochene Anfragen, alle auf Pfaden, die im Lauf auch beantwortet wurden.`);
  console.log(`Commercial real-browser acceptance (${mode}): OK`);
}finally{await browser.close();}
