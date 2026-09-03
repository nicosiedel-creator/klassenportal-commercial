// "Es ging nicht um die Dropdowns. Sondern das ich alles einzeln ändern musste. Das könnte
// besser gehen."
//
// Erkennt die Automatik bei mehreren Zeilen denselben falschen Typ - ein ganzer Ordnerimport mit
// acht Kursen, die alle faelschlich als "Standort / Organisationseinheit" ankamen -, musste
// jede einzelne Zeile ihr eigenes Dropdown durchlaufen: acht Korrekturen, acht Serverrundlaeufe,
// acht Neuaufbauten der Tabelle. Jetzt lassen sich mehrere Zeilen markieren und in EINEM Schritt
// auf denselben Typ stellen.
//
// Dieser Test liest den Code nicht, er fuehrt ihn aus: die echte renderPreview-Funktion, ein
// erfundener Server, echte Checkbox- und Klick-Ereignisse.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const src=await readFile('public/organization-import-ui.js','utf8');
global.alert=()=>{};

function konstante(name){
  const start=src.indexOf(`const ${name}=`);
  assert.ok(start>=0,`"const ${name}=" nicht gefunden - die Oberfläche wurde umgebaut, der Test muss nachgezogen werden`);
  let i=start+`const ${name}=`.length,tiefe=0;
  for(;i<src.length;i++){const c=src[i];if('([{'.includes(c))tiefe++;else if(')]}'.includes(c))tiefe--;else if(c===';'&&tiefe===0)break;}
  return src.slice(start,i+1);
}
function funktion(name){
  const start=src.indexOf(`function ${name}(`);
  assert.ok(start>=0,`"function ${name}(" nicht gefunden - die Oberfläche wurde umgebaut, der Test muss nachgezogen werden`);
  const auf=src.indexOf('{',start);
  let tiefe=0,i=auf;
  for(;i<src.length;i++){const c=src[i];if(c==='{')tiefe++;else if(c==='}'){tiefe--;if(!tiefe)break;}}
  assert.equal(tiefe,0,`"function ${name}" ließ sich nicht abgrenzen`);
  return src.slice(start,i+1);
}
const quelle=[konstante('typeLabel'),konstante('warningLabel'),konstante('blocking'),
  funktion('summaryCards'),konstante('ORG_TYPES'),funktion('renderPreview')].join('\n');
assert.match(quelle,/data-org-mark/,'die Sammelkorrektur muss eine eigene Markierung je Zeile anbieten');
assert.match(quelle,/data-org-bulk-apply/,'die Sammelkorrektur muss einen eigenen Anwenden-Knopf haben');

// --- winzige DOM-Nachbildung, genug fuer innerHTML, querySelector(All), Checkbox-Events -------
function stubDom(){
  function knoten(tag,html){
    const kinder=[];
    const n={
      tagName:(tag||'DIV').toUpperCase(),_html:html||'',children:kinder,
      get innerHTML(){return this._html;},
      set innerHTML(h){this._html=h;this._geparst=parseFragment(h,this);},
      querySelector(sel){return matchAll(this,sel)[0]||null;},
      querySelectorAll(sel){return matchAll(this,sel);},
    };
    return n;
  }
  // Ein winziger, absichtlich naiver Parser: genug fuer <input>, <select>, <option>, <button>,
  // <span>, <div> mit Attributen wie data-org-mark="7" und checked/selected. Kein echtes DOM,
  // aber genug, um zu pruefen, WAS gerendert wird und Ereignisse auszuloesen.
  function parseFragment(html){
    const el=[];const re=/<(input|select|option|button|span|div|td|tr|table|section)\b([^>]*)>/gi;
    let m;while((m=re.exec(html))){
      const attrs={};const attrRe=/([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;let a;
      while((a=attrRe.exec(m[2]))){attrs[a[1]]=a[2]===undefined?true:a[2];}
      el.push({tag:m[1].toLowerCase(),attrs,checked:'checked' in attrs,value:attrs.value,onchange:null,onclick:null});
    }
    return el;
  }
  function matchAll(root,sel){
    const alle=root._geparst||[];
    let nurAngehakt=false,rest=sel;
    if(rest.endsWith(':checked')){nurAngehakt=true;rest=rest.slice(0,-':checked'.length);}
    let attrKey=null,attrWert=null,tag=null;
    if(rest.startsWith('[')&&rest.endsWith(']')){
      const inner=rest.slice(1,-1),eq=inner.indexOf('=');
      if(eq>=0){attrKey=inner.slice(0,eq);attrWert=inner.slice(eq+1).replace(/^"|"$/g,'');}
      else attrKey=inner;
    }else tag=rest;
    const treffer=alle.filter(e=>{
      if(nurAngehakt&&!e.checked)return false;
      if(tag)return e.tag===tag;
      if(!(attrKey in e.attrs))return false;
      if(attrWert!==null&&String(e.attrs[attrKey])!==attrWert)return false;
      return true;
    });
    for(const e of treffer)e.dataset=Object.fromEntries(Object.entries(e.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
    return treffer;
  }
  return{knoten};
}

function baue(antworten){
  const {knoten}=stubDom();
  const area=knoten('div');
  const aufrufe=[];
  const api=async(pfad,opt)=>{const koerper=JSON.parse(opt.body);aufrufe.push({pfad,koerper});return{preview:antworten(koerper)};};
  const q=(pfad)=>pfad;
  const fabrik=new Function('E','api','q',`${quelle}\nreturn{renderPreview};`);
  const {renderPreview}=fabrik(x=>String(x??''),api,q);
  return{area,aufrufe,renderPreview};
}

// Acht Zeilen aus einem echten Fund: eine Kursliste ohne eigene "Typ"-Spalte, faelschlich als
// Standort/Organisationseinheit erkannt - der genaue Fall aus der Rueckmeldung.
const FALSCH_ERKANNT=Array.from({length:8},(_,i)=>({
  type:'org_unit',display_name:`Kurs ${i+1}`,source_row:i,confidence:100,warnings:[],
  org_unit_type_label:'Bereich / Fachbereich',parent_external_id:null,
}));
const sourceRows=FALSCH_ERKANNT.map((_,i)=>({name:`Kurs ${i+1}`,typ:'Bereich'}));

// ---------------------------------------------------------------------------------------------
// 1. Mehrere Zeilen markieren, einmal auf "Klasse/Kurs" stellen, einmal anwenden - EIN
//    Serveraufruf fuer alle acht, nicht acht einzelne.
// ---------------------------------------------------------------------------------------------
{
  const {area,aufrufe,renderPreview}=baue(koerper=>{
    const overrides=koerper.role_overrides||{};
    return{candidates:FALSCH_ERKANNT.map(r=>overrides[String(r.source_row)]==='course'?{...r,type:'course',warnings:['COURSE_WILL_BE_CREATED']}:r)};
  });
  renderPreview(area,{candidates:FALSCH_ERKANNT},'ten_1',sourceRows,{});
  const markierungen=area.querySelectorAll('[data-org-mark]');
  assert.equal(markierungen.length,8,'jede korrigierbare Zeile muss eine eigene Markierung anbieten');
  for(const m of markierungen)m.checked=true;
  const bulkTyp=area.querySelector('[data-org-bulk-type]');
  assert.ok(bulkTyp,'die Sammelkorrektur braucht eine eigene Typauswahl');
  bulkTyp.value='course';
  const anwenden=area.querySelector('[data-org-bulk-apply]');
  assert.ok(anwenden,'die Sammelkorrektur braucht einen eigenen Anwenden-Knopf');
  anwenden.onclick();
  assert.equal(aufrufe.length,1,`acht Zeilen auf einmal richtigzustellen darf nur EINEN Serveraufruf brauchen, waren: ${aufrufe.length}`);
  const overrides=aufrufe[0].koerper.role_overrides;
  assert.equal(Object.keys(overrides).length,8,'der eine Aufruf muss alle acht Korrekturen zusammen tragen');
  for(let i=0;i<8;i++)assert.equal(overrides[String(i)],'course',`Zeile ${i} muss im selben Aufruf auf "course" gestellt werden`);
}

// ---------------------------------------------------------------------------------------------
// 2. Nur eine Teilmenge markieren - nur die markierten duerfen sich aendern, der Rest bleibt wie
//    er war (auch fruehere Korrekturen aus overrides duerfen nicht verlorengehen).
// ---------------------------------------------------------------------------------------------
{
  const {area,aufrufe,renderPreview}=baue(koerper=>({candidates:FALSCH_ERKANNT}));
  const vorherigeKorrektur={'5':'resource'};
  renderPreview(area,{candidates:FALSCH_ERKANNT},'ten_1',sourceRows,vorherigeKorrektur);
  const markierungen=area.querySelectorAll('[data-org-mark]');
  for(const m of markierungen)if(['0','1','2'].includes(String(m.dataset.orgMark)))m.checked=true;
  area.querySelector('[data-org-bulk-type]').value='course';
  area.querySelector('[data-org-bulk-apply]').onclick();
  const overrides=aufrufe[0].koerper.role_overrides;
  assert.deepEqual([overrides['0'],overrides['1'],overrides['2']],['course','course','course'],'nur die markierten Zeilen duerfen den neuen Typ bekommen');
  assert.equal(overrides['5'],'resource','eine schon vorher gesetzte Korrektur darf durch eine andere Sammelkorrektur nicht verlorengehen');
  assert.equal(overrides['3'],undefined,'unmarkierte, nie korrigierte Zeilen duerfen keinen Eintrag bekommen');
}

// ---------------------------------------------------------------------------------------------
// 3. Ohne Markierung darf gar nichts passieren - kein Serveraufruf ins Leere.
// ---------------------------------------------------------------------------------------------
{
  let gemeldet=null;
  global.alert=m=>{gemeldet=m;};
  const {area,aufrufe,renderPreview}=baue(()=>({candidates:FALSCH_ERKANNT}));
  renderPreview(area,{candidates:FALSCH_ERKANNT},'ten_1',sourceRows,{});
  area.querySelector('[data-org-bulk-type]').value='course';
  area.querySelector('[data-org-bulk-apply]').onclick();
  assert.equal(aufrufe.length,0,'ohne markierte Zeile darf kein Aufruf stattfinden');
  assert.ok(gemeldet,'ohne Markierung muss dem Pruefenden gesagt werden, dass er etwas ankreuzen muss');
}

// ---------------------------------------------------------------------------------------------
// 4. "Alle markieren" setzt wirklich alle Haekchen - und wieder ab.
// ---------------------------------------------------------------------------------------------
{
  const {area,renderPreview}=baue(()=>({candidates:FALSCH_ERKANNT}));
  renderPreview(area,{candidates:FALSCH_ERKANNT},'ten_1',sourceRows,{});
  const alle=area.querySelector('[data-org-mark-all]');
  assert.ok(alle,'ein Sammelhaekchen fuer "alle markieren" muss es geben');
  alle.checked=true;alle.onchange();
  assert.equal(area.querySelectorAll('[data-org-mark]:checked').length,8,'"alle markieren" muss wirklich jede Zeile markieren');
  alle.checked=false;alle.onchange();
  assert.equal(area.querySelectorAll('[data-org-mark]:checked').length,0,'ein zweiter Klick muss alles wieder abwaehlen');
}

console.log('organization-import-bulk-correct: ok (8 Zeilen in einem Aufruf statt acht)');
