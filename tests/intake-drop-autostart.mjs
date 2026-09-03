// Der Kunde meldete: "ich kann hier nichts mehr rein ziehen."
//
// Im Browser nachgestellt und gefunden: die fensterweite Ablegefläche wurde von einem
// NACHLADBAREN Modul eingerichtet. Auf einer frisch geladenen Kundenoberfläche gab es sie damit
// gar nicht - wer einen Ordner über das Fenster zog, sah keinen Rahmen, konnte nichts ablegen und
// bekam auch keine Meldung. Erst wer vorher zufällig den Bereich "Organisation & Betrieb"
// geöffnet hatte, für den funktionierte das Einwerfen. Genau der Weg, auf dem ein Bildungsträger
// seine Unterlagen überhaupt ins Portal bekommt, hing also an einem Klick, den niemand nennt.
//
// Dieser Test liest den Code nicht, er führt ihn aus: eine kleine Nachbildung des Fensters auf der
// Kundenoberfläche, ein echter Wurf - und die Frage, ob die Fläche von selbst da ist und das
// Modul erst dann nachgeladen wird.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const quelle=await readFile('public/kp-folder-drop.js','utf8');

function fenster(pfad){
  const lauscher=new Map(),docLauscher=new Map(),skripte=[];
  const knoten=(tag='div')=>{const h={};const n={tagName:tag,id:'',src:'',hidden:false,className:'',dataset:{},style:{cssText:''},innerHTML:'',children:[],handlers:h,
    append(...k){n.children.push(...k);},querySelector(){return null;},closest(){return null;},contains(){return false;},
    addEventListener(t,f){(h[t]||(h[t]=[])).push(f);},replaceWith(){},};return n;};
  const body=knoten('body'),head=knoten('head');
  let overlay=null;
  const document={hidden:false,readyState:'complete',body,head,scripts:skripte,
    createElement(tag){const n=knoten(tag);if(tag==='script')skripte.push(n);return n;},
    querySelector(sel){return sel==='#intake-drop-overlay'?overlay:null;},
    addEventListener(t,f){if(!docLauscher.has(t))docLauscher.set(t,[]);docLauscher.get(t).push(f);}};
  body.append=(...k)=>{body.children.push(...k);for(const x of k)if(x.id==='intake-drop-overlay')overlay=x;};
  let uhr=1000;const takte=new Map();let naechster=1;
  const window={KP_ERROR_TEXT:null,
    addEventListener(t,f){if(!lauscher.has(t))lauscher.set(t,[]);lauscher.get(t).push(f);},
    setInterval:(fn,ms)=>{const i=naechster++;takte.set(i,{fn,ms,next:uhr+ms});return i;},
    clearInterval:i=>{takte.delete(i);}};
  const meldungen=[];
  const location={pathname:pfad};
  new Function('window','document','alert','location',quelle)(window,document,m=>meldungen.push(String(m)),location);
  const feuern=(typ,e={})=>{for(const f of lauscher.get(typ)||[])f({preventDefault(){},stopPropagation(){},
    dataTransfer:{types:['Files'],items:[],files:[]},target:null,relatedTarget:null,...e});};
  return{window,document,body,skripte,meldungen,feuern,overlay:()=>overlay,
    warte:()=>new Promise(r=>setTimeout(r,0))};
}

// ---------------------------------------------------------------------------------------------
// 1. Auf der Kundenoberfläche ist die Fläche sofort da - ohne dass irgendein Bereich geladen wurde.
// ---------------------------------------------------------------------------------------------
const kunde=fenster('/kunden-admin');
assert.ok(kunde.overlay(),'die Ablegefläche muss ohne jedes Nachladen im Fenster liegen');
// Gemessen wird, was der Browser zeichnet. Das Merkmal hidden allein blendet hier nichts aus:
// die Regel dafuer steht in der Stilvorlage des Browsers, das display steht am Element - und was
// am Element steht, gewinnt. Der Kunde sah deshalb eine dunkle Flaeche, die nie wieder wegging.
assert.equal(kunde.overlay().style.display,'none','vor jedem Zug darf die Flaeche nichts verdecken');
assert.equal(kunde.overlay().hidden,true,'und sie muss auch als ausgeblendet gelten');
kunde.feuern('dragover');
assert.equal(kunde.overlay().style.display,'flex','beim Ziehen einer Datei muss sie sich zeigen');
kunde.feuern('dragend');
assert.equal(kunde.overlay().style.display,'none','endet der Zug, muss sie wieder verschwinden');
kunde.feuern('dragover');
assert.equal(kunde.skripte.length,0,'solange nichts abgelegt wurde, darf nichts nachgeladen werden');

// ---------------------------------------------------------------------------------------------
// 2. Erst der Wurf lädt die Verarbeitung nach - und bekommt sein Ergebnis auch wirklich zugestellt.
// ---------------------------------------------------------------------------------------------
const dateien=[{name:'teilnehmer.csv',size:12}];
kunde.feuern('drop',{dataTransfer:{types:['Files'],items:[],files:dateien}});
await kunde.warte();
assert.equal(kunde.skripte.length,1,'der erste Wurf muss die Verarbeitung nachladen');
assert.equal(kunde.skripte[0].src,'/intake-quick-upload-ui.js','nachgeladen wird genau das Einwurf-Modul');
let angenommen=null;
kunde.window.KPIntakeUpload={accept:async r=>{angenommen=r;}};
kunde.skripte[0].onload();
await kunde.warte();await kunde.warte();
assert.ok(angenommen,'das Ergebnis des Wurfs muss nach dem Nachladen ankommen - sonst war der Wurf umsonst');
assert.equal(angenommen.files.length,1,'die abgelegte Datei muss mitkommen');
assert.equal(angenommen.files[0].name,'teilnehmer.csv','und zwar genau die abgelegte');

// ---------------------------------------------------------------------------------------------
// 2b. Zwei Würfe kurz hintereinander laden die Verarbeitung trotzdem nur einmal - und beide
//     kommen an. Sonst entstünden zwei Uploads oder einer ginge verloren.
// ---------------------------------------------------------------------------------------------
const schnell=fenster('/kunden-admin');
schnell.feuern('drop',{dataTransfer:{types:['Files'],items:[],files:[{name:'eins.csv',size:3}]}});
schnell.feuern('drop',{dataTransfer:{types:['Files'],items:[],files:[{name:'zwei.csv',size:3}]}});
await schnell.warte();
assert.equal(schnell.skripte.length,1,'zwei schnelle Würfe dürfen die Verarbeitung nicht zweimal laden');
const beide=[];
schnell.window.KPIntakeUpload={accept:async r=>{beide.push(r.files[0].name);}};
schnell.skripte[0].onload();
await schnell.warte();await schnell.warte();
assert.deepEqual(beide.sort(),['eins.csv','zwei.csv'],'beide Würfe müssen ankommen');

// ---------------------------------------------------------------------------------------------
// 3. Ein zweiter Wurf lädt nichts noch einmal.
// ---------------------------------------------------------------------------------------------
angenommen=null;
kunde.feuern('drop',{dataTransfer:{types:['Files'],items:[],files:[{name:'kurse.csv',size:9}]}});
await kunde.warte();await kunde.warte();
assert.equal(kunde.skripte.length,1,'ist die Verarbeitung da, darf sie nicht erneut geladen werden');
assert.equal(angenommen?.files?.[0]?.name,'kurse.csv','auch der zweite Wurf muss ankommen');

// ---------------------------------------------------------------------------------------------
// 4. Scheitert das Nachladen, erfährt der Kunde es - statt dass der Wurf stumm verschwindet.
// ---------------------------------------------------------------------------------------------
const kaputt=fenster('/kunden-admin');
kaputt.feuern('drop',{dataTransfer:{types:['Files'],items:[],files:[{name:'liste.csv',size:5}]}});
await kaputt.warte();
assert.equal(kaputt.skripte.length,1,'auch hier wird zuerst nachgeladen');
kaputt.skripte[0].onerror();
await kaputt.warte();await kaputt.warte();
assert.equal(kaputt.meldungen.length,1,`ein gescheiterter Wurf darf nicht stumm bleiben, Meldungen: ${kaputt.meldungen.length}`);
assert.match(kaputt.meldungen[0],/INTAKE_UPLOAD_MODULE_UNAVAILABLE|Uploadhilfe/,
  'die Meldung muss den Fall benennen');
const texte=await readFile('public/kp-error-text.js','utf8');
assert.match(texte,/INTAKE_UPLOAD_MODULE_UNAVAILABLE:'[^']{20,}'/,
  'für diesen Fall muss ein deutscher Text hinterlegt sein');

// ---------------------------------------------------------------------------------------------
// 5. Auf anderen Oberflächen entsteht nichts. Die Plattformverwaltung bleibt unangetastet.
// ---------------------------------------------------------------------------------------------
const plattform=fenster('/plattform-admin');
assert.equal(plattform.overlay(),null,'auf der Plattformverwaltung darf keine Ablegefläche entstehen');
plattform.feuern('dragover');
assert.equal(plattform.skripte.length,0,'und erst recht nichts nachgeladen werden');

console.log('intake-drop-autostart: ok (Ablegefläche ohne Vorbedingung, Verarbeitung erst beim Wurf)');
