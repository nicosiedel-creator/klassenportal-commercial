// Ein Jahresplan darf den Kunden nicht zum Klickarbeiter machen.
//
// Ein einzelner Aufruf muss unter der Abfragegrenze der Plattform bleiben und meldet deshalb
// "Obergrenze erreicht", wenn noch etwas offen ist. Frueher stand genau das im Bericht - mit der
// Bitte, den Lauf erneut auszufuehren. Fuer ein Schuljahr waren das viele Durchlaeufe von Hand.
//
// Dieser Test fuehrt den echten Quelltext der Oberflaeche aus - mit einem erfundenen Server - und
// prueft, dass das Portal die Durchlaeufe selbst fortsetzt, dabei die Fortsetzungsstelle des
// vorigen Laufs mitgibt, die Ergebnisse zusammenzaehlt, genau einmal prueft und niemals endlos
// weiterlaeuft.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const src=await readFile('public/planning-resource-ui.js','utf8');

function abschnitt(anfang){
  const start=src.indexOf(anfang);
  assert.ok(start>=0,`"${anfang}" nicht gefunden - die Oberfläche wurde umgebaut, der Test muss nachgezogen werden`);
  const auf=src.indexOf('{',start);
  let tiefe=0,i=auf;
  for(;i<src.length;i++){const c=src[i];if(c==='{')tiefe++;else if(c==='}'){tiefe--;if(!tiefe)break;}}
  assert.equal(tiefe,0,`"${anfang}" ließ sich nicht abgrenzen`);
  return src.slice(start,i+1);
}
const quelleSumme=abschnitt('function entwurfSumme(bisher,r)');
const quelleBericht=abschnitt('function entwurfBericht(r,geprueft,laeufe)');
const quelleHandler=abschnitt('autofillForm.onsubmit=async e=>').replace(/^autofillForm\.onsubmit=/,'');
const grundZeile=src.split('\n').find(z=>z.includes('const LUECKEN_GRUND='));
assert.ok(grundZeile,'die Übersetzung der Lückengründe fehlt');
const laeufeZeile=src.split('\n').find(z=>z.includes('const AUTOFILL_MAX_LAEUFE='));
assert.ok(laeufeZeile,'die Obergrenze der Durchläufe fehlt');
const MAX=Number(laeufeZeile.match(/=(\d+)/)[1]);
assert.ok(MAX>=10&&MAX<=200,`die Obergrenze der Durchläufe muss sinnvoll sein, war: ${MAX}`);

function baue(antworten){
  const rufe=[];
  const ziel={innerHTML:'',textContent:''};
  const w={querySelector(sel){
    if(sel==='[data-autofill]')return{};
    if(sel==='[data-autofill-result]')return ziel;
    throw new Error('unerwarteter Selektor: '+sel);
  }};
  const api=async(pfad,opt)=>{
    const koerper=JSON.parse(opt.body||'{}');
    rufe.push({pfad,koerper});
    if(pfad.includes('/autofill'))return antworten(rufe.filter(r=>r.pfad.includes('/autofill')).length,koerper);
    if(pfad.includes('/validate'))return{errors:0,warnings:3};
    throw new Error('unerwarteter Pfad: '+pfad);
  };
  class FormDataFake{
    get(k){return{starts_on:'2026-09-07',ends_on:'2027-08-30'}[k];}
    getAll(){return['crs_1','crs_2'];}
  }
  const fabrik=new Function('w','q','t','api','E','friendly','entwurfFuer','ApiError','submitButton','bindeFreigabe','FormData','readOnly',
    `${laeufeZeile}
     ${grundZeile}
     ${quelleSumme}
     ${quelleBericht}
     const autofillForm=w.querySelector('[data-autofill]');
     return ${quelleHandler};`);
  const handler=fabrik(w,(pfad)=>pfad,'ten_1',api,String,(c)=>`Fehler ${c}`,async()=>'plan_1',class extends Error{},()=>{},()=>{},FormDataFake,false);
  return{handler,rufe,ziel};
}
const lauf=(n,i)=>({created:n,courses:[{course_id:'crs_1',course_name:'Klasse 1',created:n}],
  gaps:[{course_name:'Klasse 2',date:`2026-09-0${i}`,reason:'NO_ROOM_AVAILABLE'}],gap_count:1,
  limit_reached:true,resume_course_id:'crs_1',resume_date:`2026-1${i}-01`});

// 1. Drei angehaltene Laeufe, dann Schluss.
{
  const {handler,rufe,ziel}=baue(i=>i<4?lauf(70,i):({created:12,courses:[{course_id:'crs_1',course_name:'Klasse 1',created:12}],
    gaps:[],gap_count:0,limit_reached:false,resume_course_id:null,resume_date:null}));
  await handler({preventDefault(){}});
  const autofills=rufe.filter(r=>r.pfad.includes('/autofill'));
  assert.equal(autofills.length,4,'das Portal muss die Durchläufe selbst fortsetzen, bis der Entwurf steht');
  assert.equal(rufe.filter(r=>r.pfad.includes('/validate')).length,1,'geprüft wird genau einmal, am Ende');
  assert.deepEqual(autofills[0].koerper,{course_ids:['crs_1','crs_2']},'der erste Lauf startet ohne Fortsetzungsstelle');
  assert.equal(autofills[1].koerper.resume_course_id,'crs_1','der zweite Lauf muss dort fortsetzen, wo der erste aufgehört hat');
  assert.equal(autofills[1].koerper.resume_date,'2026-11-01','die Fortsetzungsstelle des vorigen Laufs muss mitgegeben werden');
  assert.equal(autofills[3].koerper.resume_date,'2026-13-01','auch der letzte Lauf setzt an der zuletzt gemeldeten Stelle fort');
  assert.match(ziel.innerHTML,/222 Termin\(e\) im Entwurf angelegt/,'die erzeugten Termine aller Durchläufe müssen zusammengezählt werden');
  assert.match(ziel.innerHTML,/3 offene Lücke\(n\)/,'auch die offenen Lücken aller Durchläufe müssen zusammengezählt werden');
  assert.match(ziel.innerHTML,/4 Durchläufe nötig/,'der Bericht muss offenlegen, wie oft das Portal nachgelegt hat');
  assert.doesNotMatch(ziel.innerHTML,/noch nicht vollständig/,'ein fertiger Entwurf darf nicht als unvollständig gemeldet werden');
}

// 2. Ein Lauf meldet die Obergrenze, nennt aber keine Fortsetzungsstelle: dann ist Schluss,
//    sonst liefe die Oberflaeche mit derselben Anfrage endlos weiter.
{
  const {handler,rufe}=baue(()=>({created:5,courses:[],gaps:[],gap_count:0,limit_reached:true,resume_course_id:null,resume_date:null}));
  await handler({preventDefault(){}});
  assert.equal(rufe.filter(r=>r.pfad.includes('/autofill')).length,1,'ohne Fortsetzungsstelle darf kein weiterer Lauf folgen');
}

// 3. Ein Server, der nie fertig wird, darf die Oberflaeche nicht ewig beschaeftigen.
{
  let i=0;
  const {handler,rufe,ziel}=baue(()=>{i++;return{created:1,courses:[],gaps:[],gap_count:0,limit_reached:true,resume_course_id:'crs_1',resume_date:`2026-09-${String(i%28+1).padStart(2,'0')}`};});
  await handler({preventDefault(){}});
  assert.equal(rufe.filter(r=>r.pfad.includes('/autofill')).length,MAX,`die Durchläufe müssen bei ${MAX} enden`);
  assert.match(ziel.innerHTML,/noch nicht vollständig/,'bleibt etwas offen, muss der Bericht das sagen');
}

console.log(`autofill-multi-pass: ok (Obergrenze ${MAX} Durchläufe)`);
