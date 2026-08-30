// Ein schlanker Vorschalt-Server vor dem lokalen Kandidaten.
//
// Befund aus Lauf 33321854573 (WebKit 26.0, Ubuntu 24.04.4), gemessen ohne Portal daneben:
//
//   Kandidat, nur das Dokument: ok nach 274 ms, Status 200
//   gegen den laufenden Kandidaten: GESCHEITERT nach 15003 ms
//   Engine schickte 7, Antworten 1; fehlgeschlagen: keine
//   ohne Antwort geblieben: /styles.css | /admin-overlay-hardening.css | /kp-error-text.js
//                           | /kp-dialog-guard.js | /account-mail-ui.js | /platform-direct-login.js
//   beantwortet wurde: 200 /plattform-admin
//
// Das Dokument kommt an. Genau die sechs Dateien, die es nachlaedt, bekommen keine Antwort -
// und keine einzige schlaegt fehl, sie bleiben offen. Sechs ist zugleich die Zahl gleichzeitiger
// Verbindungen, die WebKit je Gegenstelle oeffnet. node erreicht denselben Server im selben Lauf
// nacheinander ohne weiteres, und die Bereitschaftspruefung verlangt vorher fuenf Antworten in
// Folge. Es ist also die Gleichzeitigkeit, an der `wrangler dev` hier scheitert - nicht das
// Portal, das in der Produktion ohnehin nicht von workerd ausgeliefert wird.
//
// Dieser Vorschalt-Server nimmt dem Browser seine gleichzeitigen Verbindungen ab und reicht sie
// nacheinander weiter. Er veraendert nichts an Anfrage oder Antwort: Methode, Pfad, Kopfzeilen,
// Rumpf und Status gehen unveraendert durch. Was die Abnahme prueft, bleibt damit dasselbe
// Portal - nur der Transport dazwischen ist einer, den beide Seiten beherrschen.
import { createServer, request as upstreamRequest, Agent } from 'node:http';

const listen=Number(process.argv[2]||8787);
const upstream=Number(process.argv[3]||8788);
const host=process.argv[4]||'127.0.0.1';
// Eine Verbindung nach oben. Genau das ist der Punkt: der Browser darf so viele oeffnen, wie er
// will, der Kandidat sieht sie nacheinander.
// Ohne Wiederverwendung: jede Anfrage bekommt eine eigene Verbindung, und es ist immer nur eine
// offen. Eine offengehaltene Verbindung waere nur eine weitere Quelle fuer genau die Zustaende,
// die hier untersucht werden - und der Gewinn waere in einem Testlauf nicht messbar.
const agent=new Agent({keepAlive:false,maxSockets:1});

let open=0,peak=0,served=0,failed=0;
const server=createServer((incoming,outgoing)=>{
  open++;peak=Math.max(peak,open);
  const headers={...incoming.headers};
  // Der Kandidat kennt sich unter dem Port, den der Browser anspricht - die Weitergabe darf ihm
  // keinen anderen unterschieben, sonst stimmt sein eigener Ursprung nicht mehr.
  headers.host=`${host}:${listen}`;
  const forwarded=upstreamRequest({host,port:upstream,method:incoming.method,path:incoming.url,headers,agent},response=>{
    outgoing.writeHead(response.statusCode||502,response.headers);
    response.pipe(outgoing);
    response.on('end',()=>{open--;served++;});
  });
  forwarded.on('error',error=>{
    open--;failed++;
    if(!outgoing.headersSent)outgoing.writeHead(502,{'content-type':'text/plain; charset=utf-8'});
    outgoing.end(`Vorschalt-Server erreicht den Kandidaten nicht: ${String(error?.message||error)}`);
  });
  incoming.pipe(forwarded);
});
server.on('close',()=>console.log(`[Vorschalt-Server] ${served} weitergereicht, ${failed} gescheitert, hoechstens ${peak} gleichzeitig.`));
server.listen(listen,host,()=>console.log(`[Vorschalt-Server] ${host}:${listen} -> ${host}:${upstream}, eine Verbindung nach oben.`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));});
