import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';

// Der Vorschalt-Server steht im Cross-Browser-Lauf zwischen Browser und Kandidat. Er darf genau
// eines tun: Anfragen nacheinander weiterreichen. Alles andere - Methode, Pfad, Kopfzeilen,
// Rumpf, Status - muss unveraendert durchgehen, sonst prueft die Abnahme nicht mehr das Portal.
//
// Dieser Test fuehrt ihn aus: echter Server oben, echter Vorschalt-Server, echte Anfragen.

const seen=[];
let inFlight=0,peak=0;
const upstream=createServer(async (request,response)=>{
  inFlight++;peak=Math.max(peak,inFlight);
  let body='';for await(const chunk of request)body+=chunk;
  seen.push({method:request.method,url:request.url,body,marke:request.headers['x-marke']||'',host:request.headers.host||''});
  // Langsam antworten, damit Gleichzeitigkeit ueberhaupt entstehen kann.
  await new Promise(r=>setTimeout(r,40));
  if(request.url==='/fehler'){response.writeHead(503,{'content-type':'text/plain','x-eigen':'ja'});response.end('kaputt');}
  else{response.writeHead(200,{'content-type':'application/json','x-eigen':'ja'});response.end(JSON.stringify({url:request.url,body}));}
  inFlight--;
});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const upstreamPort=upstream.address().port;

const listenPort=upstreamPort+1;
const proxy=spawn(process.execPath,['scripts/local-candidate-proxy.mjs',String(listenPort),String(upstreamPort),'127.0.0.1'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Vorschalt-Server ist nicht gestartet')),8000);
  proxy.stdout.on('data',chunk=>{if(String(chunk).includes('Vorschalt-Server')){clearTimeout(timer);resolve();}});
});
const base=`http://127.0.0.1:${listenPort}`;

try{
  // 1. Eine gewoehnliche Anfrage geht unveraendert durch.
  const plain=await fetch(`${base}/pfad?x=1`,{headers:{'x-marke':'eins'}});
  assert.equal(plain.status,200,'der Status des Kandidaten muss durchgehen');
  assert.equal(plain.headers.get('x-eigen'),'ja','die Kopfzeilen des Kandidaten muessen durchgehen');
  assert.deepEqual(await plain.json(),{url:'/pfad?x=1',body:''},'Pfad und Abfrage muessen unveraendert ankommen');
  assert.equal(seen.at(-1).marke,'eins','die Kopfzeilen des Browsers muessen unveraendert ankommen');
  assert.equal(seen.at(-1).host,`127.0.0.1:${listenPort}`,
    'der Kandidat muss sich unter dem Port sehen, den der Browser anspricht - sonst stimmt sein eigener Ursprung nicht');
  // 1b. Spricht der Browser den Kandidaten unter einem anderen Namen an - localhost statt
  //     127.0.0.1 -, muss der Kandidat trotzdem seinen eigenen Ursprung sehen. Sonst weist er
  //     die Anfrage als fremden Ursprung ab.
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('der Vorschalt-Server antwortet nicht')),5000);
    const raw=httpRequest({host:'127.0.0.1',port:listenPort,path:'/fremder-name',headers:{host:`fremde-adresse:${listenPort}`}},res=>{res.resume();res.on('end',()=>{clearTimeout(timer);resolve();});});
    raw.on('error',error=>{clearTimeout(timer);reject(error);});
    raw.end();
  });
  assert.equal(seen.at(-1).host,`127.0.0.1:${listenPort}`,
    'ein abweichender Name muss auf den eigenen Ursprung des Kandidaten gebracht werden');

  // 2. Auch ein Rumpf und eine andere Methode.
  const posted=await fetch(`${base}/senden`,{method:'POST',body:'hallo welt',headers:{'content-type':'text/plain'}});
  assert.deepEqual(await posted.json(),{url:'/senden',body:'hallo welt'},'Methode und Rumpf muessen durchgehen');
  assert.equal(seen.at(-1).method,'POST');
  // 3. Ein Fehler des Kandidaten wird nicht geschoent.
  const broken=await fetch(`${base}/fehler`);
  assert.equal(broken.status,503,'ein Fehler des Kandidaten muss als Fehler ankommen');
  assert.equal(await broken.text(),'kaputt');
  // 4. Der Kern: der Browser darf gleichzeitig anfragen, oben kommt es nacheinander an.
  //    Genau daran scheiterte WebKit - sechs gleichzeitige Anfragen blieben unbeantwortet.
  peak=0;
  const parallel=await Promise.all(Array.from({length:8},(_,i)=>fetch(`${base}/gleichzeitig-${i}`).then(r=>r.status)));
  assert.deepEqual(parallel,Array(8).fill(200),'acht gleichzeitige Anfragen muessen alle beantwortet werden');
  assert.equal(peak,1,`oben darf immer nur eine Anfrage gleichzeitig ankommen, gemessen: ${peak}`);
  // 5. Ist der Kandidat weg, sagt der Vorschalt-Server das - er haengt nicht.
  // close() wartet auf offene Verbindungen - und der Vorschalt-Server haelt seine eine
  // Verbindung nach oben bewusst offen. Ohne dieses Kappen wartete der Test hier ewig.
  upstream.closeAllConnections();
  await new Promise(r=>upstream.close(r));
  const dead=await fetch(`${base}/nach-dem-ende`);
  assert.equal(dead.status,502,'ohne Kandidat muss der Vorschalt-Server antworten statt zu haengen');
  assert.match(await dead.text(),/erreicht den Kandidaten nicht/);
}finally{
  proxy.kill('SIGTERM');
  try{upstream.close();}catch{}
}

// Der Lauf muss ihn auch wirklich benutzen, und der Kandidat muss dahinter liegen.
const workflow=await readFile('.github/workflows/commercial-cross-browser-e2e.yml','utf8');
assert.match(workflow,/local-candidate-proxy\.mjs/,'der Cross-Browser-Lauf muss den Vorschalt-Server starten');
assert.match(workflow,/--port 8788/,'der Kandidat muss hinter dem Vorschalt-Server liegen');
assert.match(workflow,/COMMERCIAL_BASE_URL: http:\/\/127\.0\.0\.1:8787/,'der Browser muss den Vorschalt-Server ansprechen');
assert.match(workflow,/APP_ORIGIN:'http:\/\/127\.0\.0\.1:8787'/,'der eigene Ursprung des Portals muss der Adresse des Browsers entsprechen');
// Der Gate-Lauf mit Chromium ist gruen und bleibt unangetastet: ein Umweg, den nur ein Job
// braucht, gehoert nicht in den Weg, der ueber eine Freigabe entscheidet.
const gate=await readFile('.github/workflows/commercial-browser-e2e.yml','utf8');
assert.ok(!gate.includes('local-candidate-proxy'),'der Pflicht-Gate-Lauf darf keinen Vorschalt-Server bekommen');

console.log('Der Vorschalt-Server reicht unveraendert durch und nimmt dem Browser die Gleichzeitigkeit ab: OK');
