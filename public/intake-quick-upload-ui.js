const INTAKE_QUICK_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(INTAKE_QUICK_PATH){
  const tenant=()=>document.querySelector('#tenantPick')?.value||'';
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body&&!((opt.body) instanceof FormData)?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  async function pdfText(file){try{const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';const doc=await pdfjs.getDocument({data:await file.arrayBuffer(),cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'}).promise;let text='';for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),c=await page.getTextContent();text+='\n'+c.items.map(x=>'str'in x?x.str+(x.hasEOL?'\n':' '):'').join('');}return text.replace(/[-\s]/g,'').length>=20?text.slice(0,300000):'';}catch{return'';}}
  function overlay(){const w=document.createElement('div');w.className='modal-back';w.innerHTML='<div class="modal" style="width:min(620px,94vw)"><h3 style="margin-top:0">Unterlagen werden verarbeitet</h3><p data-state>Bereite sicheren Einmal-Upload vor …</p><progress data-progress style="width:100%"></progress><p class="muted">Verträge, Teilnehmerlisten, Kurslisten, Fachlisten, Dozentenlisten - auch alles gemischt in einem Ordner. Das System sortiert selbst, legt Eindeutiges selbst an und stellt nur Unklarheiten ins Prüf-Cockpit.</p></div>';document.body.append(w);return w;}
  async function upload(files,opt={}){const t=tenant();if(!t)throw new Error('Kein Kunde ausgewählt.');if(!files.length)return;if(files.length>100)throw new Error(opt.folder?'Dieser Ordner enthält mehr als 100 lesbare Dateien. Packe ihn als ZIP-Datei und wirf diese ein - dann wird er in einem Zug eingelesen.':'Maximal 100 Dateien pro Stapel.');const total=files.reduce((n,f)=>n+f.size,0);if(total>50*1024*1024)throw new Error('Der Stapel darf maximal 50 MB groß sein.');const w=overlay(),state=w.querySelector('[data-state]');try{const created=await api(`/api/enterprise/intake/upload-links?tenant_id=${encodeURIComponent(t)}`,{method:'POST',body:JSON.stringify({label:'Interner Sofort-Upload',valid_days:1,max_uploads:1})}),url=new URL(created.link.url,location.origin),token=decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1)||'');if(!token)throw new Error('Upload-Token konnte nicht erzeugt werden.');const fd=new FormData();for(let i=0;i<files.length;i++){const file=files[i];fd.append('files',file);state.textContent=`Bereite Datei ${i+1} von ${files.length} vor …`;if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){const text=await pdfText(file);if(text)fd.append(`client_text_${i}`,text);}}state.textContent=`Übertrage ${files.length} Datei(en) sicher …`;const result=await api(`/api/intake/upload/${encodeURIComponent(token)}`,{method:'POST',body:fd});state.innerHTML=result.status?.includes('automatisch')?`✅ <strong>${files.length} Datei(en) eingegangen und eindeutige Teilnehmer automatisch verarbeitet.</strong>`:`✅ <strong>${files.length} Datei(en) eingegangen.</strong> Unklare Fälle liegen jetzt im Eingang & Automationen-Cockpit.`;if(opt.dropped)state.innerHTML+=`<br><span class="muted">${opt.dropped} Datei(en) im Ordner waren keine lesbaren Unterlagen und wurden nicht übertragen.</span>`;w.querySelector('[data-progress]').remove();setTimeout(()=>w.remove(),4200);}catch(e){state.textContent=`Upload nicht abgeschlossen: ${window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(e):e.message}`;w.querySelector('[data-progress]')?.remove();setTimeout(()=>w.remove(),5000);}}
  const ACCEPT='.pdf,.csv,.xlsx,.json,.txt,.docx,.odt,.zip,.png,.jpg,.jpeg,.webp,.tif,.tiff';
  const SUPPORTED=/\.(?:pdf|csv|xlsx|json|txt|docx|odt|zip|png|jpe?g|webp|tiff?|heic)$/i;
  // Ein ausgewaehlter Ordner enthaelt fast immer auch Dinge, die hier nichts zu suchen haben:
  // .DS_Store, Thumbs.db, versteckte Dateien, Bilder aus einer Signatur. Sie werden vorher
  // aussortiert, damit der Stapel nicht an ihnen scheitert und der Mandant nichts sortieren muss.
  function usable(files){return files.filter(f=>f.size>0&&SUPPORTED.test(f.name)&&!f.name.startsWith('.')&&!/(^|\/)__MACOSX\//.test(f.webkitRelativePath||''));}
  function choose(folder){
    const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=ACCEPT;
    if(folder){input.webkitdirectory=true;input.setAttribute('webkitdirectory','');input.setAttribute('directory','');}
    input.style.display='none';document.body.append(input);
    input.onchange=()=>{
      const picked=[...(input.files||[])];input.remove();
      const files=usable(picked),dropped=picked.length-files.length;
      if(!files.length){alert(folder?'In diesem Ordner ist keine lesbare Unterlage. Unterstuetzt werden PDF, Word, OpenDocument, CSV, Excel, JSON, Text und Bilder.':'Keine lesbare Unterlage ausgewaehlt.');return;}
      upload(files,{folder,dropped}).catch(e=>alert(e.message));
    };
    input.click();
  }
  // Ein ganzer Ordner soll sich einfach ins Fenster ziehen lassen. Der Browser gibt beim Ablegen
  // eines Ordners keine Dateiliste heraus, sondern einen Verzeichniseintrag, den man selbst
  // durchlaufen muss - und readEntries liefert hoechstens 100 Eintraege je Aufruf, deshalb wird
  // bis zur leeren Antwort weitergelesen. Ohne das kaeme von einem grossen Ordner nur der Anfang an.
  const MAX_DROP_FILES=500,MAX_DROP_DEPTH=8;
  async function entryFiles(entry,out,depth){
    if(!entry||out.length>=MAX_DROP_FILES||depth>MAX_DROP_DEPTH)return out;
    if(entry.isFile){const file=await new Promise(res=>entry.file(res,()=>res(null)));if(file)out.push(file);return out;}
    if(entry.isDirectory){const reader=entry.createReader();for(;;){const batch=await new Promise(res=>reader.readEntries(res,()=>res([])));if(!batch.length)break;for(const child of batch)await entryFiles(child,out,depth+1);if(out.length>=MAX_DROP_FILES)break;}}
    return out;
  }
  const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
  function dropZone(){
    if(document.querySelector('#intake-drop-overlay'))return;
    const zone=document.createElement('div');zone.id='intake-drop-overlay';zone.hidden=true;
    zone.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72);pointer-events:none';
    zone.innerHTML='<div style="border:3px dashed #fff;border-radius:18px;padding:38px 46px;text-align:center;color:#fff;font-size:1.1rem;max-width:min(560px,90vw)"><strong style="display:block;font-size:1.35rem;margin-bottom:8px">Ordner hier ablegen</strong>Ganze Ordner, einzelne Dateien oder ein ZIP-Archiv. Das Portal sortiert selbst und fragt nur nach, was wirklich unklar ist.</div>';
    document.body.append(zone);
    const show=()=>{zone.hidden=false;},hide=()=>{zone.hidden=true;};
    let depth=0;
    // Ein Ablegebereich, den es schon gibt - etwa im Stundenplan-Dialog -, behandelt seinen Wurf
    // selbst und hat dann preventDefault gesetzt. Diese Uebernahme hier darf ihm nicht dazwischen-
    // funken, sonst laende dieselbe Datei zusaetzlich im Eingang.
    const foreign=e=>e.defaultPrevented||!!(e.target instanceof Element&&e.target.closest('.modal-back,.modal'));
    addEventListener('dragenter',e=>{if(!hasFiles(e)||foreign(e))return;e.preventDefault();depth++;show();});
    addEventListener('dragover',e=>{if(!hasFiles(e)||foreign(e))return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';});
    addEventListener('dragleave',e=>{if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)hide();});
    addEventListener('drop',async e=>{
      if(!hasFiles(e)||foreign(e))return;
      e.preventDefault();depth=0;hide();
      // Die Eintraege muessen synchron aus dem Ereignis geholt werden - nach dem ersten await ist
      // die Ablage des Browsers geleert.
      const entries=[...(e.dataTransfer?.items||[])].map(x=>x.webkitGetAsEntry?.()).filter(Boolean);
      const plain=[...(e.dataTransfer?.files||[])];
      let picked=plain,folder=false;
      if(entries.length){const out=[];for(const entry of entries)await entryFiles(entry,out,0);if(out.length)picked=out;folder=entries.some(x=>x.isDirectory);}
      const files=usable(picked),dropped=picked.length-files.length;
      if(!files.length)return alert(folder?'In diesem Ordner ist keine lesbare Unterlage. Unterstützt werden PDF, Word, OpenDocument, CSV, Excel, JSON, Text, ZIP und Bilder.':'Keine lesbare Unterlage abgelegt.');
      upload(files,{folder,dropped}).catch(x=>alert(x.message));
    });
  }
  function enhance(){const side=document.querySelector('.side');if(!side||side.querySelector('#intake-quick-upload-nav'))return;const anchor=side.querySelector('#intake-center-nav');
    const b=document.createElement('button');b.id='intake-quick-upload-nav';b.className='nav';b.type='button';b.textContent='Unterlagen jetzt einwerfen';
    const f=document.createElement('button');f.id='intake-folder-upload-nav';f.className='nav';f.type='button';f.textContent='Ganzen Ordner einlesen';
    // Ohne diese Markierung sortiert die Kundenverwaltung den Knopf hinter "Weitere Bereiche" -
    // die Liste der dauerhaft sichtbaren Eintraege ist fest, und neue stehen nicht darin. Der
    // Weg, auf dem ein Bildungstraeger seine Daten ueberhaupt ins Portal bekommt, darf nicht
    // der vierzehnte Eintrag in einem Klappmenue sein.
    f.dataset.customerNavPrimary='1';
    f.dataset.customerNavSourceLabel='Ganzen Ordner einlesen';
    if(anchor?.nextSibling)side.insertBefore(b,anchor.nextSibling);else side.append(b);
    b.insertAdjacentElement('afterend',f);
    b.onclick=()=>choose(false);f.onclick=()=>choose(true);
    f.title='Ordner lassen sich auch einfach ins Fenster ziehen.';
    dropZone();}
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});enhance();
}
