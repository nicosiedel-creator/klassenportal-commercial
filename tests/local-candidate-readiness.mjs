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
//
// Die Stoerung muss dabei bei jedem Schreiben streng wachsen. Eine zufaellige Anzahl Zeilen
// reicht nicht: der Waechter vergleicht Zaehlerstaende, und zwei aufeinanderfolgende Messungen
// koennen zufaellig denselben Stand sehen - dann bemerkt er den Neustart nicht und die Serie
// laeuft durch. Genau so ist dieser Test auf einem schnellen Runner grundlos gescheitert,
// waehrend er lokal durchlief. Ein hochzaehlender Stand und ein Takt deutlich unter dem
// Abfrageabstand des Waechters (700ms) machen daraus eine Gewissheit statt einer Wette.
{
  let restarts=0;
  const ticker=setInterval(()=>{
    restarts++;
    void writeFile(logPath,`Ready\n${'The file src changed, restarting build...\n'.repeat(restarts)}`).catch(()=>{});
  },200);
  const {code,out}=await wait(url,logPath);
  clearInterval(ticker);
  assert.ok(restarts>=3,`die Stoerung muss waehrend der Messung mehrfach zugeschlagen haben, war ${restarts}`);
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

// Der eigene Wrangler ist gar nicht gestartet, weil ein fremder Prozess den Port belegt: dann
// antwortet die Adresse stabil mit 200 - aus einem anderen, womoeglich veralteten Server. Genau
// so wurde hier einmal gegen einen drei Stunden alten Stand geklickt, waehrend die Bereitschaft
// "stabil erreichbar" meldete. Ein Protokoll, das den Fehlstart benennt, macht das Ergebnis
// ungueltig - unabhaengig davon, wie sauber die Adresse antwortet.
for(const [line,expected] of [
  ['*** Fatal uncaught kj::Exception: kj/async-io-unix.c++:945: failed: ::bind(sockfd, &addr.generic, addrlen): Address already in use; toString() = 127.0.0.1:8787',/Port ist bereits belegt/],
  ['The Workers runtime failed to start. There is likely additional logging output above.',/Laufzeit konnte nicht starten/]
]){
  await writeFile(logPath,`Ready\n${line}\n`);
  const {code,out}=await wait(url,logPath);
  assert.equal(code,1,`ein stabil antwortender fremder Server darf nicht als eigener Kandidat gelten:\n${out}`);
  assert.match(out,expected);
  assert.doesNotMatch(out,/stabil erreichbar/,'ein Fehlstart darf niemals als Bereitschaft durchgehen');
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

// Beantwortet ist nicht dasselbe wie erfolgreich. /api/attendance/teacher/courses antwortet
// unangemeldet mit 401 - der einzigen Antwort, die es dort je gibt. Solange der Zaehler nur
// Antworten unter 400 als Antwort zaehlte, konnte dieser Pfad die Bedingung nie erfuellen, und
// der erste Abbruch meldete einen Produktfehler, den es nicht gab. Der Zaehler darf deshalb
// keine Statusschranke kennen; ob eine 401 an dieser Stelle richtig ist, prueft der HTTP-Vertrag.
assert.match(e2e,/serve\(response\)\{served\.add\(pathOf\(response\.url\(\)\)\);\}/,
  'eine Antwort zaehlt als Antwort, unabhaengig vom Status');
assert.doesNotMatch(e2e,/serve\(response\)\{if\(response\.status\(\)<\d+\)/,
  'eine Statusschranke im Antwortzaehler macht jeden nur-401-Pfad zum falschen Befund');

// Und die Regel selbst muss ausgefuehrt halten, was sie verspricht.
const tracker=new Function(`${(e2e.match(/const NAVIGATION_ABORT=[\s\S]*?\nfunction abortTracker\(\)\{[\s\S]*?\n\}/)||[''])[0]}\nreturn abortTracker;`)();
const probe=tracker();
probe.serve({status:()=>401,url:()=>'http://x/api/attendance/teacher/courses'});
probe.note({method:()=>'GET',url:()=>'http://x/api/attendance/teacher/courses'},'net::ERR_ABORTED');
assert.deepEqual(probe.unanswered(),[],'ein Pfad, der mit 401 geantwortet hat, gilt als beantwortet');
probe.note({method:()=>'GET',url:()=>'http://x/api/nie-beantwortet'},'net::ERR_ABORTED');
assert.deepEqual(probe.unanswered(),['/api/nie-beantwortet (1x abgebrochen, nie beantwortet)'],
  'ein Pfad, der ausschliesslich abbricht, muss weiterhin auffallen');

console.log('Local candidate readiness and cross-engine navigation-abort contract: OK');
