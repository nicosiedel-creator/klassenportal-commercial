// Wartet, bis der lokale Kandidat nicht nur einmal antwortet, sondern stabil laeuft.
//
// `wrangler dev` beobachtet src und stoesst kurz nach dem Start noch einmal einen Build an
// ("The file src changed, restarting build..."). Dabei wird der lokale Server abgeraeumt und
// neu gestartet. Eine einzelne erfolgreiche Anfrage beweist deshalb nichts: sie kann aus dem
// Server vor dem Neustart kommen. Faellt die erste Navigation des Browsers in dieses Fenster,
// haengt sie auf einer toten Verbindung - WebKit lief so 90 Sekunden in die Zeitueberschreitung,
// waehrend das Worker-Protokoll fuer dieselbe Route 200 in 13ms auswies.
//
// Die Bedingung ist deshalb: mehrere aufeinanderfolgende erfolgreiche Anfragen, und seit
// Beginn dieser Serie kein neuer Neustart im Wrangler-Protokoll. Jede Stoerung setzt die
// Serie zurueck. Das ist keine erhoehte Wartezeit, sondern die richtige Bedingung.
import { readFileSync } from 'node:fs';

const url=process.argv[2];
const logPath=process.argv[3]||'';
const deadlineMs=Number(process.env.CANDIDATE_READY_TIMEOUT_MS||120000);
const required=Number(process.env.CANDIDATE_READY_STREAK||5);
const RESTART='restarting build|Starting local server';

if(!url){console.error('Aufruf: node scripts/wait-for-local-candidate.mjs <url> [wrangler-log]');process.exit(2);}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const restartCount=()=>{
  if(!logPath)return 0;
  try{return (readFileSync(logPath,'utf8').match(new RegExp(RESTART,'g'))||[]).length;}catch{return 0;}
};

const started=Date.now();
let streak=0,seenRestarts=restartCount(),lastProblem='noch keine Antwort';
while(Date.now()-started<deadlineMs){
  let ok=false;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),3000);
    const response=await fetch(url,{signal:controller.signal,redirect:'manual'});
    clearTimeout(timer);
    ok=response.status===200;
    if(!ok)lastProblem=`Status ${response.status}`;
    await response.arrayBuffer().catch(()=>undefined);
  }catch(error){lastProblem=String(error?.message||error).split('\n')[0];}

  const restarts=restartCount();
  if(restarts!==seenRestarts){seenRestarts=restarts;streak=0;lastProblem='Wrangler hat waehrend der Messung neu gestartet';}
  else if(ok)streak++;
  else streak=0;

  if(streak>=required){
    console.log(`Lokaler Kandidat ist stabil erreichbar: ${required} Antworten in Folge ohne Neustart (${Date.now()-started}ms).`);
    process.exit(0);
  }
  await sleep(700);
}

console.error(`Lokaler Kandidat wurde nicht stabil erreichbar. Letzter Befund: ${lastProblem}.`);
if(logPath){try{console.error(readFileSync(logPath,'utf8').split('\n').slice(-60).join('\n'));}catch{}}
process.exit(1);
