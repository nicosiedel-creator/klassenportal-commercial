// Führt den echten Übernahme-Pfad der Planungsoberfläche aus - nicht nur seinen Quelltext.
//
// Warum dieser Test existiert: eine reine Quelltextprüfung hat eine Mutation überlebt,
// die die Auswahl statt der internen Kennung die Beschriftung lesen liess. Der Server
// haette dann als teacher_id "Frau Alt" gespeichert. Deshalb wird hier die echte
// Schaltflaechen-Vorlage gerendert, daraus das echte Datenattribut gelesen und der
// echte Klickpfad ausgefuehrt.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../public/planning-resource-ui.js',import.meta.url),'utf8');

// --- echten Funktionsquelltext herausschneiden -------------------------------
function funktionsQuelle(name){
  let start=src.indexOf(`async function ${name}(`);
  if(start<0)start=src.indexOf(`function ${name}(`);
  assert.ok(start>=0,`Funktion ${name} nicht gefunden - die Oberflaeche wurde umgebaut, der Test muss nachgezogen werden`);
  const auf=src.indexOf('{',start);
  let tiefe=0,i=auf;
  for(;i<src.length;i++){const c=src[i];if(c==='{')tiefe++;else if(c==='}'){tiefe--;if(!tiefe)break;}}
  assert.ok(tiefe===0&&src[i]==='}',`Funktion ${name} liess sich nicht sauber abgrenzen`);
  return src.slice(start,i+1);
}
const quelleEntwurf=funktionsQuelle('entwurfFuer'),quelleBinde=funktionsQuelle('bindeUebernahme');
assert.match(quelleEntwurf,/timetable-plans/,'entwurfFuer muss weiterhin mit Stundenplanentwuerfen arbeiten');
assert.match(quelleBinde,/data-apply-suggestion/,'bindeUebernahme muss weiterhin an die Uebernahme-Schaltflaeche binden');

// --- echte Schaltflaechen-Vorlagen rendern ----------------------------------
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function templateAb(i){
  for(let j=i+1,tiefe=0;j<src.length;j++){
    const c=src[j];
    if(c==='\\'){j++;continue;}
    if(c==='`'){if(!tiefe)return src.slice(i,j+1);const innen=templateAb(j);j+=innen.length-1;continue;}
    if(c==='$'&&src[j+1]==='{'){tiefe++;j++;continue;}
    if(c==='}'&&tiefe)tiefe--;
  }
  return '';
}
function vorlage(art){
  const marke=src.indexOf(`data-pick="${art}"`);
  assert.ok(marke>0,`Vorlage fuer ${art} nicht gefunden`);
  const auf=src.lastIndexOf('`',marke);
  const tpl=templateAb(auf);
  assert.ok(tpl.includes('</button>'),`Vorlage fuer ${art} liess sich nicht abgrenzen`);
  return new Function('E','Number','x','return '+tpl);
}
function ausVorlage(art,daten){
  const html=vorlage(art)(E,Number,daten);
  const tag=/^<button[^>]*>/.exec(html);
  assert.ok(tag,'die Vorlage muss eine Schaltflaeche erzeugen, keinen reinen Text');
  const attrs={};
  for(const [,k,v] of tag[0].matchAll(/([a-z-]+)="([^"]*)"/g))attrs[k]=v;
  return knoten(attrs);
}

// --- minimales DOM ----------------------------------------------------------
function knoten(attrs={}){
  const dataset={};
  for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
  return {attrs:{...attrs},dataset,disabled:false,textContent:'',innerHTML:'',onclick:null,
    setAttribute(n,v){this.attrs[n]=String(v);},getAttribute(n){return this.attrs[n]??null;}};
}
function passt(node,sel){
  const m=/^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(sel.trim());
  assert.ok(m,`Selektor im Produktionscode wird vom Testrahmen nicht abgedeckt: ${sel}`);
  const v=node.attrs[m[1]];
  if(v===undefined)return false;
  return m[2]===undefined?true:v===m[2];
}

// --- Lauf -------------------------------------------------------------------
async function lauf({fehlerImEntwurf=false}={}){
  const dozentA=ausVorlage('teacher',{id:'usr_dozent_1',name:'Frau Alt',qualified:1});
  const dozentB=ausVorlage('teacher',{id:'usr_dozent_2',name:'Herr Neu',qualified:0});
  const raumA=ausVorlage('room',{id:'res_raum_1',name:'IT-Labor Nord 1',capacity:24});
  const knopf=knoten({'data-apply-suggestion':''}),hinweis=knoten({'data-apply-hint':''}),ergebnis=knoten({'data-apply-result':''});
  const kinder=[dozentA,dozentB,raumA,knopf,hinweis,ergebnis];
  const out={querySelector:s=>kinder.find(k=>passt(k,s))||null,querySelectorAll:s=>kinder.filter(k=>passt(k,s))};

  const rufe=[];
  const q=(path,t,extra={})=>{const p=new URLSearchParams({tenant_id:t});for(const [k,v] of Object.entries(extra))if(v!==undefined&&v!==null&&v!=='')p.set(k,String(v));return `${path}?${p}`;};
  const api=async(url,opt={})=>{
    const methode=opt.method||'GET',rumpf=opt.body?JSON.parse(opt.body):null;
    rufe.push({url,methode,rumpf});
    assert.ok(!url.includes('/publish'),'die Uebernahme darf niemals veroeffentlichen - der Kunde bestaetigt selbst');
    if(/\/validate\?/.test(url))return{ok:true,errors:fehlerImEntwurf?1:0,warnings:2};
    if(/\/entries\?/.test(url))return{ok:true,entry_id:'tpe_1'};
    if(/timetable-plans\?/.test(url)&&methode==='GET')return{plans:[]};
    if(/timetable-plans\?/.test(url)&&methode==='POST')return{ok:true,plan:{id:'tpv_neu'}};
    throw new Error('unerwarteter Aufruf: '+url);
  };
  const friendly=code=>`Fehler: ${code}`;
  const binde=new Function('api','q','t','E','friendly',
    `${quelleEntwurf}\n${quelleBinde}\nreturn bindeUebernahme;`)(api,q,'ten_test',E,friendly);

  binde(out,{course:'crs_1',starts:'2026-09-07T08:00:00.000Z',ends:'2026-09-07T09:30:00.000Z'});
  return {dozentA,dozentB,raumA,knopf,hinweis,ergebnis,rufe};
}

// 1. Ohne vollstaendige Auswahl ist die Uebernahme gesperrt.
{
  const s=await lauf();
  assert.equal(s.knopf.disabled,true,'ohne Auswahl darf nichts uebernommen werden');
  s.dozentA.onclick();
  assert.equal(s.knopf.disabled,true,'nur mit Dozent/in, ohne Raum, darf nichts uebernommen werden');
  s.raumA.onclick();
  assert.equal(s.knopf.disabled,false,'mit Dozent/in und Raum muss die Uebernahme moeglich sein');
  assert.match(s.hinweis.textContent,/Frau Alt/,'der Hinweis muss die gewaehlte Person nennen');
  assert.match(s.hinweis.textContent,/IT-Labor Nord 1/,'der Hinweis muss den gewaehlten Raum nennen');
}

// 2. Eine zweite Wahl ersetzt die erste sichtbar.
{
  const s=await lauf();
  s.dozentA.onclick();
  assert.equal(s.dozentA.getAttribute('aria-pressed'),'true');
  s.dozentB.onclick();
  assert.equal(s.dozentA.getAttribute('aria-pressed'),'false','die vorherige Wahl muss zurueckgesetzt werden');
  assert.equal(s.dozentB.getAttribute('aria-pressed'),'true');
}

// 3. Der Kern: die Uebernahme schreibt die interne Kennung, nicht die Beschriftung.
{
  const s=await lauf();
  s.dozentB.onclick();s.raumA.onclick();
  await s.knopf.onclick();

  const entwurf=s.rufe.find(r=>r.methode==='POST'&&/timetable-plans\?/.test(r.url));
  assert.ok(entwurf,'es muss ein Entwurf angelegt werden');
  assert.equal(entwurf.rumpf.status,'draft','die Uebernahme darf ausschliesslich in einen Entwurf schreiben');

  const eintrag=s.rufe.find(r=>/\/entries\?/.test(r.url));
  assert.ok(eintrag,'der Vorschlag muss als Eintrag im Entwurf landen');
  assert.equal(eintrag.rumpf.teacher_id,'usr_dozent_2','es muss die interne Kennung der Person gespeichert werden');
  assert.notEqual(eintrag.rumpf.teacher_id,'Herr Neu','die Beschriftung darf niemals als Kennung gespeichert werden');
  assert.equal(eintrag.rumpf.course_id,'crs_1');
  assert.equal(eintrag.rumpf.room,'IT-Labor Nord 1','der Raum wird als Klartextname gespeichert - so erwartet ihn der Server');
  assert.notEqual(eintrag.rumpf.room,'res_raum_1','die interne Raumkennung gehoert nicht in das Klartextfeld');
  assert.equal(eintrag.rumpf.activity_type,'classroom','der Server kennt nur seine eigenen Aktivitaetstypen - ein unbekannter Wert wuerde still verfallen');
  assert.equal(eintrag.rumpf.starts_at,'2026-09-07T08:00:00.000Z');

  assert.ok(s.rufe.some(r=>/\/validate\?/.test(r.url)),'nach der Uebernahme muss der Entwurf geprueft werden');
  assert.ok(!s.rufe.some(r=>r.url.includes('/publish')),'nichts darf veroeffentlicht werden');
  assert.match(s.ergebnis.innerHTML,/Freigabe/,'dem Kunden muss gesagt werden, dass erst seine Freigabe veroeffentlicht');
  assert.match(s.ergebnis.innerHTML,/2 Hinweis/,'die Zahl der Hinweise aus der Pruefung muss angezeigt werden');
}

// 4. Konflikte aus der Pruefung werden nicht verschwiegen.
{
  const s=await lauf({fehlerImEntwurf:true});
  s.dozentA.onclick();s.raumA.onclick();
  await s.knopf.onclick();
  assert.match(s.ergebnis.innerHTML,/1 Konflikt/,'gefundene Konflikte muessen benannt werden');
}

console.log('planning-apply-suggestion: ok');
