// Die Karte im Dozentenportal muss auch dann erscheinen, wenn der Anker erst spaeter da ist.
//
// Genau daran ist im Betrieb schon einmal ein ganzer Knopf verschwunden: ein Modul haengte sich
// einmalig ein, der Anker war in diesem Augenblick nicht da, und danach kam nichts mehr nach.
// Dieser Test fuehrt die echte Einhaengefunktion aus - mit einem Portal, das seinen Anker erst
// nach dem Laden des Moduls bekommt.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const src=await readFile('public/teacher-availability-ui.js','utf8');

function funktionsQuelle(name){
  let start=src.indexOf(`async function ${name}(`);
  if(start<0)start=src.indexOf(`function ${name}(`);
  assert.ok(start>=0,`Funktion ${name} nicht gefunden - das Modul wurde umgebaut, der Test muss nachgezogen werden`);
  const auf=src.indexOf('{',start);
  let tiefe=0,i=auf;
  for(;i<src.length;i++){const c=src[i];if(c==='{')tiefe++;else if(c==='}'){tiefe--;if(!tiefe)break;}}
  assert.ok(tiefe===0,`Funktion ${name} liess sich nicht abgrenzen`);
  return src.slice(start,i+1);
}
const quelle=funktionsQuelle('start');
assert.match(quelle,/portal-main/,'die Einhaengefunktion muss weiterhin auf den Anker sehen');

// --- winziges Portal, das seinen Anker erst spaeter bekommt ------------------
function portal(){
  const kinder=new Set();
  return{kinder,
    querySelector(sel){
      if(sel==='.portal-main')return kinder.has('.portal-main')?{append(){kinder.add('#tp-availability');}}:null;
      if(sel==='#tp-availability')return kinder.has('#tp-availability')?{}:null;
      throw new Error('unerwarteter Selektor: '+sel);
    }};
}
function baue(root,zaehler,kurse=[{tenant_id:'ten_1',teacher_id:'tch_1'}]){
  let aktuell=null,zuordnungen=[],laueft=false;
  const api=async()=>({courses:kurse});
  const laden=async()=>{zaehler.laden++;};
  const zeichnen=()=>{zaehler.zeichnen++;root.kinder.add('#tp-availability');};
  // Der echte Quelltext, mit den Aussenwerten des Moduls verdrahtet.
  const fabrik=new Function('teacherAvailabilityRoot','api','laden','zeichnen','zustand',
    `let aktuell=zustand.aktuell,zuordnungen=[],laueft=false;
     ${quelle}
     return{start,stand:()=>({aktuell})};`);
  return fabrik(root,api,laden,zeichnen,{aktuell:null});
}

// ---------------------------------------------------------------------------
// 1. Ist der Anker noch nicht da, wird nichts gezeichnet - aber es bleibt möglich.
// ---------------------------------------------------------------------------
{
  const root=portal(),zaehler={laden:0,zeichnen:0},m=baue(root,zaehler);
  await m.start();
  assert.equal(zaehler.zeichnen,0,'ohne Anker darf nichts gezeichnet werden');
  // Das Portal baut seine Oberfläche fertig - der nächste Anstoß muss die Karte nachziehen.
  root.kinder.add('.portal-main');
  await m.start();
  assert.equal(zaehler.zeichnen,1,'sobald der Anker da ist, muss die Karte erscheinen');
}

// ---------------------------------------------------------------------------
// 2. Wiederholte Anstöße zeichnen nicht mehrfach.
// ---------------------------------------------------------------------------
{
  const root=portal(),zaehler={laden:0,zeichnen:0},m=baue(root,zaehler);
  root.kinder.add('.portal-main');
  for(let i=0;i<5;i++)await m.start();
  assert.equal(zaehler.zeichnen,1,`fünf Anstöße dürfen die Karte nur einmal erzeugen, waren: ${zaehler.zeichnen}`);
  assert.equal(zaehler.laden,1,'und die Arbeitszeiten nur einmal laden');
}

// ---------------------------------------------------------------------------
// 3. Ohne Zuordnung zu einem Träger bleibt das Portal unverändert bedienbar.
// ---------------------------------------------------------------------------
{
  const root=portal(),zaehler={laden:0,zeichnen:0},m=baue(root,zaehler,[]);
  root.kinder.add('.portal-main');
  await m.start();
  assert.equal(zaehler.zeichnen,0,'wer keiner Klasse zugeordnet ist, bekommt keine Karte - und keinen Fehler');
}

// ---------------------------------------------------------------------------
// 4. Der Anstoß hängt wirklich an den Ereignissen des Portals.
// ---------------------------------------------------------------------------
assert.match(src,/new MutationObserver\(anstossen\)\.observe\(teacherAvailabilityRoot/,
  'das Modul muss auf spätere Änderungen der Oberfläche reagieren');
assert.match(src,/addEventListener\('kp:teacher-state',anstossen\)/,
  'und auf den Zustandswechsel des Portals');

console.log('teacher-availability-render: ok');
