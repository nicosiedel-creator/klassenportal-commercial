// Kann diese Browser-Engine auf diesem Rechner ueberhaupt eine lokale Verbindung aufbauen?
//
// Der Cross-Browser-Lauf scheitert unter WebKit seit Wochen an derselben Stelle: about:blank und
// ein eingebautes Dokument werden in einstelligen Millisekunden gerendert, node bekommt vom
// lokalen Server eine 200 - aber jede Navigation der Engine laeuft in die Zeitueberschreitung,
// und im Worker-Protokoll kommt keine einzige Anfrage an. Damit steht fest: es liegt nicht am
// Portal. Was fehlt, ist eine Messung ohne Portal.
//
// Dieses Werkzeug baut genau diese Messung: ein winziger HTTP-Server aus node, ein zufaelliger
// Port auf 127.0.0.1, eine Navigation, und die Antwort auf drei Fragen, die sonst offen bleiben:
//   1. Sieht der Server die Anfrage ueberhaupt? (trennt "kommt nicht an" von "kommt an, Antwort
//      wird nicht verarbeitet")
//   2. Was meldet die Engine selbst? (requestfailed nennt den Netzfehler beim Namen)
//   3. Haelt die Engine sich fuer verbunden? (navigator.onLine ist unter Linux die Stelle, an der
//      WebKit die Netzverfuegbarkeit des Systems erfragt)
//
// Aufruf: node scripts/browser-local-network-probe.mjs <engine> [--strict]
// Ohne --strict endet der Lauf immer mit 0: als Diagnose darf er den Job nicht abbrechen.
import { createServer } from 'node:http';

const engineName=process.argv[2]||'chromium';
const strict=process.argv.includes('--strict');
const timeout=Number(process.env.PROBE_TIMEOUT_MS||15000);
const line=(...parts)=>console.log(`[Netzprobe ${engineName}]`,...parts);

const seen=[];
const server=createServer((request,response)=>{seen.push(`${request.method} ${request.url}`);response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end('<!doctype html><title>Netzprobe</title><p id="ok">erreichbar</p>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
line(`Server laeuft auf http://127.0.0.1:${port}`);

// Erst der Gegenbeweis aus node selbst: laeuft der Server, ist alles Folgende eine Aussage ueber
// die Engine und nicht ueber den Server.
const own=await fetch(`http://127.0.0.1:${port}/probe`).then(r=>String(r.status)).catch(e=>`Fehler: ${String(e?.message||e).split('\n')[0]}`);
line('node erreicht den eigenen Server:',own);

let verdict='UNGEPRUEFT',detail='';
try{
  const playwright=await import('playwright');
  const engine=playwright[engineName];
  if(!engine)throw new Error(`Engine ${engineName} ist in dieser Playwright-Fassung nicht vorhanden`);
  const browser=await engine.launch({headless:true});
  line('Engine gestartet:',browser.version());
  const page=await browser.newPage();
  const failures=[];
  page.on('requestfailed',request=>failures.push(`${request.url()} :: ${request.failure()?.errorText||'unbekannt'}`));
  const started=Date.now();
  const response=await page.goto(`http://127.0.0.1:${port}/probe`,{waitUntil:'domcontentloaded',timeout}).catch(error=>({error}));
  const elapsed=Date.now()-started;
  if(response?.error){
    verdict='ENGINE_ERREICHT_LOKAL_NICHT';
    detail=String(response.error?.message||response.error).split('\n')[0];
    line('Navigation gescheitert nach',elapsed,'ms:',detail);
  }else{
    verdict='OK';
    line('Navigation erfolgreich nach',elapsed,'ms, Status',response.status());
  }
  line('Server hat Anfragen gesehen:',seen.length?seen.join(', '):'KEINE');
  line('Engine meldet fehlgeschlagene Anfragen:',failures.length?failures.join(', '):'keine');
  // navigator.onLine steht in about:blank ohne Netz zur Verfuegung und sagt, ob die Engine sich
  // ueberhaupt fuer verbunden haelt. Unter Linux fragt WebKit dafuer den Netzmonitor des Systems.
  const online=await page.evaluate(()=>navigator.onLine).catch(e=>`nicht ermittelbar: ${String(e?.message||e).split('\n')[0]}`);
  line('navigator.onLine:',online);
  await browser.close();
}catch(error){
  verdict='ENGINE_STARTET_NICHT';
  detail=String(error?.message||error).split('\n')[0];
  line('Engine liess sich nicht betreiben:',detail);
}
server.close();
line('Befund:',verdict,detail?`(${detail})`:'');
if(strict&&verdict!=='OK'){process.exitCode=1;}
