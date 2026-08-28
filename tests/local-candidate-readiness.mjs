import { strict as assert } from 'node:assert';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

// `wrangler dev` beobachtet src und startet kurz nach dem Start noch einmal neu. Eine einzelne
// erfolgreiche Anfrage beweist daher nicht, dass der Server bereit ist - sie kann aus dem
// Server vor dem Neustart stammen. WebKit lief genau so in eine 90-Sekunden-Zeitueberschreitung,
// waehrend das Worker-Protokoll fuer dieselbe Route 200 in 13ms auswies. Diese Pruefung haelt
// die Bedingung fest: mehrere Antworten in Folge und kein Neustart waehrend der Messung.

const dir=await mkdtemp(join(tmpdir(),'kp-ready-'));
const logPath=join(dir,'wrangler.log');
const wait=(url,log,env={})=>new Promise(resolve=>{
  const child=spawn(process.execPath,['scripts/wait-for-local-candidate.mjs',url,log],{env:{...process.env,CANDIDATE_READY_TIMEOUT_MS:'8000',...env}});
  let out='';
  child.stdout.on('data',c=>{out+=c;});child.stderr.on('data',c=>{out+=c;});
  child.on('close',code=>resolve({code,out}));
});

// Ein Server, der stabil antwortet und dessen Protokoll ruhig bleibt, gilt als bereit.
const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>ok</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/plattform-admin`;
await writeFile(logPath,'Ready on http://127.0.0.1:8787\n');
{
  const {code,out}=await wait(url,logPath);
  assert.equal(code,0,`ein stabiler Server muss als bereit gelten:\n${out}`);
  assert.match(out,/stabil erreichbar/);
}

// Ein Neustart waehrend der Messung setzt die Serie zurueck und darf nicht als bereit gelten.
{
  const ticker=setInterval(()=>{void writeFile(logPath,'Ready\nThe file src changed, restarting build...\n'.repeat(Math.ceil(Math.random()*3)+1)).catch(()=>{});},900);
  const {code,out}=await wait(url,logPath);
  clearInterval(ticker);
  assert.equal(code,1,`ein Server, der waehrend der Messung neu startet, darf nicht als bereit gelten:\n${out}`);
  assert.match(out,/neu gestartet/);
}

// Ein Server, der Fehler liefert, gilt nicht als bereit - auch wenn er antwortet.
{
  const broken=createServer((_req,res)=>{res.writeHead(503);res.end('nein');});
  await new Promise(resolve=>broken.listen(0,'127.0.0.1',resolve));
  await writeFile(logPath,'Ready\n');
  const {code,out}=await wait(`http://127.0.0.1:${broken.address().port}/plattform-admin`,logPath);
  assert.equal(code,1,'ein antwortender, aber fehlerhafter Server darf nicht als bereit gelten');
  assert.match(out,/Status 503/);
  broken.close();
}

// Gar kein Server: die Wartezeit endet, statt unbegrenzt zu haengen.
{
  await writeFile(logPath,'Ready\n');
  const {code,out}=await wait('http://127.0.0.1:1/plattform-admin',logPath);
  assert.equal(code,1);
  assert.match(out,/nicht stabil erreichbar/);
}

server.close();

// Beide Browser-Workflows muessen diese Bedingung benutzen - eine einzelne curl-Anfrage
// beweist die Bereitschaft nicht.
for(const file of ['.github/workflows/commercial-browser-e2e.yml','.github/workflows/commercial-cross-browser-e2e.yml']){
  const workflow=await readFile(file,'utf8');
  assert.match(workflow,/scripts\/wait-for-local-candidate\.mjs/,`${file} muss auf stabile Bereitschaft warten`);
  assert.doesNotMatch(workflow,/curl -fsS --max-time 3 http:\/\/127\.0\.0\.1:8787/,`${file} darf sich nicht auf eine einzelne Anfrage verlassen`);
}

// Der Browserlauf muss den Navigationsabbruch in allen drei Engines erkennen, sonst meldet er
// abgebrochene Anfragen des alten Dokuments als Produktfehler (Firefox: NS_BINDING_ABORTED).
const e2e=await readFile('scripts/commercial-browser-e2e.mjs','utf8');
// Gegen die Musterliste selbst pruefen, nicht gegen die ganze Datei: die Marker stehen auch im
// erklaerenden Kommentar darueber, und eine Pruefung, die der Kommentar erfuellt, prueft nichts.
const patterns=e2e.match(/const NAVIGATION_ABORT=\[(.*?)\];/);
assert.ok(patterns,'der Browserlauf muss seine Abbruchmuster als NAVIGATION_ABORT fuehren');
for(const marker of ['net::ERR_ABORTED','NS_BINDING_ABORTED','cancelled'])
  assert.ok(patterns[1].includes(marker),`der Navigationsabbruch von ${marker} muss erkannt werden`);
assert.match(e2e,/request\.method\(\)!=='GET'/,'nur GET-Anfragen duerfen als Abbruch durchgehen');
// Ein Abbruch ist nur dann unbedenklich, wenn derselbe Pfad im Lauf auch beantwortet wurde.
// Ohne diese Bedingung waere der Filter eine Freikarte fuer jede abgebrochene Anfrage.
assert.match(e2e,/unanswered\(\)\{return\[\.\.\.aborted\]\.filter\(\(\[path\]\)=>!served\.has\(path\)\)/,'abgebrochene Pfade ohne jede Antwort muessen weiterhin auffallen');
assert.match(e2e,/abgebrochene Anfragen ohne je eine Antwort/,'der Lauf muss abgebrochene, nie beantwortete Pfade melden');

console.log('Local candidate readiness and cross-engine navigation-abort contract: OK');
