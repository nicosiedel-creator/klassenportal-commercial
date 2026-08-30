import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Der Kunde meldete: die dunkle Flaeche "Ordner hier ablegen" legte sich ueber die ganze
// Kundenverwaltung und ging nicht mehr weg. Kein Klick half, weil sie den halben Bildschirm
// einnahm und wie ein haengender Dialog aussah.
//
// Ursache war eine Zaehlung: dragenter erhoehte einen Zaehler, dragleave senkte ihn, und bei null
// wurde ausgeblendet. Diese Zaehlung driftet zwangslaeufig - dragenter wurde nur gezaehlt, wenn
// der Wurf nicht einem vorhandenen Ablegebereich galt, dragleave aber immer. Ein Wurf auf einen
// solchen Bereich verliess die Behandlung sogar ganz ohne Ausblenden.
//
// Dieser Test liest den Code nicht, er fuehrt ihn aus: eine kleine Nachbildung des Fensters, die
// echten Ereignisse in der echten Reihenfolge, und die Frage, ob die Flaeche danach weg ist.

const source=await readFile('public/kp-folder-drop.js','utf8');

function stubDom(){
  const listeners=new Map(),docListeners=new Map();
  const el=(tag='div')=>{const handlers={};const node={tagName:tag,id:'',hidden:false,className:'',dataset:{},style:{cssText:''},innerHTML:'',children:[],handlers,
    append(...kids){node.children.push(...kids);},querySelector(){return el('div');},closest(){return null;},contains(){return false;},
    addEventListener(type,handler){(handlers[type]||(handlers[type]=[])).push(handler);},replaceWith(){},};return node;};
  const body=el('body');
  const document={hidden:false,body,createElement:tag=>el(tag),querySelector:()=>null,
    addEventListener(type,handler){(docListeners.get(type)||docListeners.set(type,[]).get(type)).push(handler);}};
  // Map.set gibt die Map zurueck, nicht den Wert - deshalb hier ausgeschrieben.
  document.addEventListener=(type,handler)=>{if(!docListeners.has(type))docListeners.set(type,[]);docListeners.get(type).push(handler);};
  const scope={addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}};
  let clock=1000;const timers=new Map();let nextTimer=1;
  const api={
    document,scope,
    now:()=>clock,
    setInterval:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms,next:clock+ms});return id;},
    clearInterval:id=>{timers.delete(id);},
    advance(ms){clock+=ms;for(const t of[...timers.values()])while(t.next<=clock){t.next+=t.ms;t.fn();}},
    fire(type,event={}){for(const handler of listeners.get(type)||[])handler({preventDefault(){},stopPropagation(){},dataTransfer:{types:['Files'],items:[],files:[]},target:null,relatedTarget:null,...event});},
    fireDocument(type,event={}){for(const handler of docListeners.get(type)||[])handler(event);},
  };
  return api;
}

function load(dom){
  const window={KP_ERROR_TEXT:null};
  new Function('window','document','alert',source)(window,dom.document,()=>{});
  return window.KPFolderDrop;
}

const withFiles={dataTransfer:{types:['Files'],items:[],files:[]}};

// 1. Ziehen zeigt die Flaeche, Loslassen ausserhalb jeder Behandlung blendet sie wieder aus.
{
  const dom=stubDom(),folderDrop=load(dom);
  const overlay=folderDrop.windowDropOverlay({scope:dom.scope,document:dom.document,now:dom.now,setInterval:dom.setInterval,clearInterval:dom.clearInterval,onResult:async()=>{}});
  assert.ok(overlay,'die Ablegeflaeche muss entstehen');
  assert.equal(overlay.visible(),false,'ohne Zug ist nichts zu sehen');
  dom.fire('dragover',withFiles);
  assert.equal(overlay.visible(),true,'waehrend des Zugs muss sie zu sehen sein');
  // Der Zug endet ausserhalb des Fensters: es kommt kein einziges Ereignis mehr.
  dom.advance(400);
  assert.equal(overlay.visible(),false,
    'ohne weiteres Ereignis muss die Aufsicht die Flaeche wieder ausblenden - genau das fehlte, und sie blieb stehen');
}

// 2. Ein Wurf, der einem vorhandenen Ablegebereich gilt, wird hier nicht bearbeitet - die Flaeche
//    muss trotzdem verschwinden. Vorher verliess die Behandlung genau hier ohne Ausblenden.
{
  const dom=stubDom(),folderDrop=load(dom);
  let handled=0;
  const overlay=folderDrop.windowDropOverlay({scope:dom.scope,document:dom.document,now:dom.now,setInterval:dom.setInterval,clearInterval:dom.clearInterval,
    isForeign:()=>true,onResult:async()=>{handled++;}});
  dom.fire('dragover',withFiles);
  // Bei isForeign bleibt sie ohnehin unsichtbar; erzwungen sichtbar machen, um das Ausblenden im
  // Wurf selbst zu pruefen.
  overlay.show();
  assert.equal(overlay.visible(),true);
  dom.fire('drop',withFiles);
  assert.equal(overlay.visible(),false,'auch ein fremder Wurf muss die Flaeche ausblenden');
  assert.equal(handled,0,'ein fremder Wurf darf hier nicht zusaetzlich verarbeitet werden');
}

// 3. Jeder Weg, auf dem ein Zug enden kann, blendet aus.
for(const [type,event] of [['dragend',{}],['blur',{}],['mouseleave',{}],['keydown',{key:'Escape'}],['dragleave',{relatedTarget:null}]]){
  const dom=stubDom(),folderDrop=load(dom);
  const overlay=folderDrop.windowDropOverlay({scope:dom.scope,document:dom.document,now:dom.now,setInterval:dom.setInterval,clearInterval:dom.clearInterval,onResult:async()=>{}});
  dom.fire('dragover',withFiles);
  assert.equal(overlay.visible(),true,`${type}: vorher muss sie sichtbar sein`);
  dom.fire(type,event);
  assert.equal(overlay.visible(),false,`${type} muss die Ablegeflaeche beenden`);
}

// 4. Solange wirklich gezogen wird, darf sie nicht wegblinken.
{
  const dom=stubDom(),folderDrop=load(dom);
  const overlay=folderDrop.windowDropOverlay({scope:dom.scope,document:dom.document,now:dom.now,setInterval:dom.setInterval,clearInterval:dom.clearInterval,onResult:async()=>{}});
  for(let i=0;i<10;i++){dom.fire('dragover',withFiles);dom.advance(100);}
  assert.equal(overlay.visible(),true,'ein laufender Zug darf die Flaeche nicht verlieren');
  dom.advance(400);
  assert.equal(overlay.visible(),false,'nach dem Ende des Zugs muss sie weg sein');
}

// 5. Ein echter Wurf wird verarbeitet - und die Flaeche ist danach weg.
{
  const dom=stubDom(),folderDrop=load(dom);
  let got=null;
  const overlay=folderDrop.windowDropOverlay({scope:dom.scope,document:dom.document,now:dom.now,setInterval:dom.setInterval,clearInterval:dom.clearInterval,
    onResult:async result=>{got=result;}});
  dom.fire('dragover',withFiles);
  const file={name:'kurse.csv',size:12};
  dom.fire('drop',{dataTransfer:{types:['Files'],items:[],files:[file]}});
  await new Promise(r=>setTimeout(r,0));
  assert.equal(overlay.visible(),false,'nach dem Wurf ist die Flaeche weg');
  assert.deepEqual(got?.files,[file],'die abgelegte Datei muss ankommen');
}

// 6. Die sichtbare Flaeche im Dialog behandelt ihren Wurf selbst - und muss die Weitergabe
//    stoppen. Sonst nimmt ihn zusaetzlich die fensterweite Flaeche entgegen und dieselben
//    Dateien gingen zweimal ein.
{
  const dom=stubDom(),folderDrop=load(dom);
  const card=folderDrop.dropCard({onFiles:async()=>{}});
  const handler=(card.handlers.drop||[])[0];
  assert.ok(handler,'die sichtbare Flaeche muss einen Wurf annehmen');
  let stopped=false,prevented=false;
  await handler({preventDefault(){prevented=true;},stopPropagation(){stopped=true;},dataTransfer:{types:['Files'],items:[],files:[]}});
  assert.equal(prevented,true,'der Browser darf die Datei nicht selbst oeffnen');
  assert.equal(stopped,true,'der Wurf darf nicht zusaetzlich fensterweit ankommen - sonst geht er zweimal ein');
}

// 7. Die Weiche: was direkt in die Vorschau mit der Typkorrektur geht und was ueber den Eingang.
{
  const dom=stubDom(),folderDrop=load(dom);
  const f=name=>({name,size:10});
  const cases=[
    [{folder:false,files:[f('02_Organigramm.csv')]},'preview','eine einzelne Liste wird sofort gezeigt und laesst sich richtigstellen'],
    [{folder:false,files:[f('03_Kurse.xlsx')]},'preview','auch als Excel'],
    [{folder:false,files:[f('Vertrag.pdf')]},'intake','eine PDF muss erst ausgelesen werden'],
    [{folder:false,files:[f('paket.zip')]},'intake','ein Archiv enthaelt viele Unterlagen'],
    [{folder:false,files:[f('a.csv'),f('b.csv')]},'intake','mehrere Dateien gehoeren in den Eingang'],
    [{folder:true,files:[f('a.csv')]},'intake','ein Ordner bleibt ein Ordner, auch mit nur einer Datei darin'],
  ];
  for(const [result,expected,why] of cases)
    assert.equal(folderDrop.routeDropped(result),expected,why);
}

console.log('Die fensterweite Ablegeflaeche zeigt sich beim Ziehen und verschwindet in jedem Fall wieder - auch ohne jedes weitere Ereignis: OK');
