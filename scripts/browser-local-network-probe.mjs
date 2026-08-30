// Kann diese Browser-Engine auf diesem Rechner eine lokale Verbindung aufbauen - und macht es
// einen Unterschied, WIE die Seite geoeffnet wird?
//
// Die erste Messung hat die naheliegendste Vermutung widerlegt. Auf dem Runner (Ubuntu 24.04,
// unprivilegierte Benutzernamensraeume gesperrt) erreichte WebKit 26.0 einen lokalen
// node-Server in 37 ms mit Status 200 - vor und nach dem Loesen der Sperre gleichermassen. Die
// Netzschicht der Engine ist also in Ordnung, und die Sperre ist nicht die Ursache.
//
// Was bleibt: die Abnahme oeffnet ihre Seite nicht wie diese Messung. Sie setzt Fenstergroesse,
// Sprache und eine eigene Browserkennung. Diese Messung faehrt deshalb dieselbe Navigation
// mehrfach - einmal schlicht, einmal je Einstellung, einmal genau so wie die Abnahme. Welche
// Zeile in die Zeitueberschreitung laeuft, benennt die Ursache.
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

// Genau die Einstellungen, mit denen die Abnahme ihre erste Seite oeffnet
// (scripts/commercial-browser-e2e.mjs).
const DESKTOP_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const VARIANTS=[
  ['schlicht',{}],
  ['nur Fenstergroesse',{viewport:{width:1440,height:1000}}],
  ['nur Sprache',{locale:'de-DE'}],
  ['nur Browserkennung',{userAgent:DESKTOP_UA}],
  ['wie die Abnahme',{viewport:{width:1440,height:1000},locale:'de-DE',userAgent:DESKTOP_UA}],
];
let failures=0;
try{
  const playwright=await import('playwright');
  const engine=playwright[engineName];
  if(!engine)throw new Error(`Engine ${engineName} ist in dieser Playwright-Fassung nicht vorhanden`);
  const browser=await engine.launch({headless:true});
  line('Engine gestartet:',browser.version());
  for(const [label,options] of VARIANTS){
    const before=seen.length;
    let page=null,detail='';
    try{page=await browser.newPage(options);}catch(error){line(`${label}: Seite liess sich nicht oeffnen -`,String(error?.message||error).split('\n')[0]);failures++;continue;}
    const failed=[];
    page.on('requestfailed',request=>failed.push(`${request.url()} :: ${request.failure()?.errorText||'unbekannt'}`));
    const started=Date.now();
    const response=await page.goto(`http://127.0.0.1:${port}/probe?v=${encodeURIComponent(label)}`,{waitUntil:'domcontentloaded',timeout}).catch(error=>({error}));
    const elapsed=Date.now()-started;
    if(response?.error){failures++;detail=String(response.error?.message||response.error).split('\n')[0];
      line(`${label}: GESCHEITERT nach ${elapsed} ms - ${detail}`);}
    else line(`${label}: ok nach ${elapsed} ms, Status ${response.status()}`);
    line(`${label}: Server sah ${seen.length-before} Anfrage(n); Engine meldet ${failed.length?failed.join(', '):'keine fehlgeschlagene Anfrage'}`);
    await page.close().catch(()=>undefined);
  }
  await browser.close();
}catch(error){
  failures++;
  line('Engine liess sich nicht betreiben:',String(error?.message||error).split('\n')[0]);
}
server.close();
line('Befund:',failures?`${failures} von ${VARIANTS.length} Varianten gescheitert`:'alle Varianten OK');
if(strict&&failures){process.exitCode=1;}
