// Ordner, Dateien und ZIP-Archive entgegennehmen - per Ablegen oder per Auswahl.
//
// Gemeinsam genutzt vom Sofort-Eingang und vom Bildungstraeger-Import. Beide Wege muessen sich
// gleich verhalten: der Kunde darf nicht raten muessen, welcher Knopf einen ganzen Ordner annimmt,
// und die Ablegeflaeche darf nicht nur zufaellig auftauchen, waehrend man etwas ueber das Fenster
// zieht. Deshalb liegt sie sichtbar im Dialog, und die Erkennung dahinter ist an beiden Stellen
// dieselbe.
(function(){
  const ACCEPT='.pdf,.csv,.xlsx,.json,.txt,.docx,.odt,.zip,.png,.jpg,.jpeg,.webp,.tif,.tiff';
  const SUPPORTED=/\.(?:pdf|csv|xlsx|json|txt|docx|odt|zip|png|jpe?g|webp|tiff?|heic)$/i;
  const STRUCTURED=/\.(?:csv|xlsx|json|txt)$/i;
  const MAX_FILES=500,MAX_DEPTH=8;

  // Ein ausgewaehlter oder abgelegter Ordner enthaelt fast immer auch Dinge, die hier nichts zu
  // suchen haben: .DS_Store, Thumbs.db, versteckte Dateien, Bilder aus einer Signatur. Sie werden
  // vorher aussortiert, damit der Stapel nicht an ihnen scheitert.
  const usable=files=>files.filter(f=>f.size>0&&SUPPORTED.test(f.name)&&!f.name.startsWith('.')&&!/(^|\/)__MACOSX\//.test(f.webkitRelativePath||''));

  // Der Browser gibt beim Ablegen eines Ordners keine Dateiliste heraus, sondern einen
  // Verzeichniseintrag, den man selbst durchlaufen muss - und readEntries liefert hoechstens 100
  // Eintraege je Aufruf. Ohne die Schleife bis zur leeren Antwort kaeme von einem grossen Ordner
  // nur der Anfang an.
  async function entryFiles(entry,out,depth){
    if(!entry||out.length>=MAX_FILES||depth>MAX_DEPTH)return out;
    if(entry.isFile){const file=await new Promise(res=>entry.file(res,()=>res(null)));if(file)out.push(file);return out;}
    if(entry.isDirectory){const reader=entry.createReader();for(;;){const batch=await new Promise(res=>reader.readEntries(res,()=>res([])));if(!batch.length)break;for(const child of batch)await entryFiles(child,out,depth+1);if(out.length>=MAX_FILES)break;}}
    return out;
  }

  const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');

  // Die Eintraege muessen synchron aus dem Ereignis geholt werden - nach dem ersten await ist die
  // Ablage des Browsers geleert. Deshalb greift diese Funktion sofort zu und gibt erst danach eine
  // Zusage zurueck, die den Ordner durchlaeuft.
  function captureDrop(event){
    const items=[...(event.dataTransfer?.items||[])],plain=[...(event.dataTransfer?.files||[])];
    const entries=items.map(x=>{try{return x.webkitGetAsEntry?.();}catch{return null;}}).filter(Boolean);
    const folder=entries.some(x=>x.isDirectory);
    return async()=>{
      let picked=plain;
      if(entries.length){const out=[];for(const entry of entries)await entryFiles(entry,out,0);if(out.length)picked=out;}
      const files=usable(picked);
      return{files,folder,dropped:picked.length-files.length};
    };
  }

  function pick(folder){
    return new Promise(resolve=>{
      const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=ACCEPT;
      if(folder){input.webkitdirectory=true;input.setAttribute('webkitdirectory','');input.setAttribute('directory','');}
      input.style.display='none';document.body.append(input);
      input.onchange=()=>{const picked=[...(input.files||[])];input.remove();const files=usable(picked);resolve({files,folder,dropped:picked.length-files.length});};
      input.oncancel=()=>{input.remove();resolve(null);};
      input.click();
    });
  }

  const emptyMessage=folder=>folder
    ?'In diesem Ordner ist keine lesbare Unterlage. Unterstützt werden PDF, Word, OpenDocument, CSV, Excel, JSON, Text, ZIP und Bilder.'
    :'Keine lesbare Unterlage dabei. Unterstützt werden PDF, Word, OpenDocument, CSV, Excel, JSON, Text, ZIP und Bilder.';

  // Eine sichtbare Ablegeflaeche mit beiden Auswahlknoepfen. Sie meldet jedes Ergebnis in derselben
  // Form zurueck, egal ob abgelegt, als Ordner oder als Einzeldateien gewaehlt.
  function dropCard(options){
    const opt=options||{};
    const card=document.createElement('div');
    card.className='card';
    card.dataset.kpDropCard='1';
    card.style.cssText='border:2px dashed var(--line,#94a3b8);text-align:center;padding:24px 18px;margin-top:14px;transition:background .12s,border-color .12s';
    card.innerHTML=`<strong style="display:block;font-size:1.05rem">${opt.title||'Ordner, Dateien oder ZIP hier ablegen'}</strong>`
      +`<div class="muted" style="margin-top:6px">${opt.hint||'Ganze Ordner werden mit allen Unterordnern eingelesen. Das Portal sortiert selbst und fragt nur nach, was wirklich unklar ist.'}</div>`
      +`<div class="toolbar" style="justify-content:center;margin-top:12px"><button class="btn secondary" type="button" data-kp-pick-folder>Ordner wählen</button><button class="btn secondary" type="button" data-kp-pick-files>Dateien wählen</button></div>`;
    const deliver=async result=>{
      if(!result)return;
      if(!result.files.length){(opt.onError||(m=>alert(m)))(emptyMessage(result.folder));return;}
      try{await opt.onFiles(result);}catch(e){(opt.onError||(m=>alert(m)))(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(e):(e?.message||String(e)));}
    };
    card.querySelector('[data-kp-pick-folder]').onclick=async()=>deliver(await pick(true));
    card.querySelector('[data-kp-pick-files]').onclick=async()=>deliver(await pick(false));
    const lit=on=>{card.style.background=on?'rgba(37,99,235,.08)':'';card.style.borderColor=on?'#2563eb':'';};
    for(const type of ['dragenter','dragover'])card.addEventListener(type,e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';lit(true);});
    card.addEventListener('dragleave',e=>{if(!card.contains(e.relatedTarget))lit(false);});
    // stopPropagation haelt den Wurf hier: sonst nimmt ihn zusaetzlich die fensterweite
    // Ablegeflaeche entgegen und dieselben Dateien gingen zweimal ein.
    card.addEventListener('drop',async e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();lit(false);const collect=captureDrop(e);deliver(await collect());});
    return card;
  }

  // Die fensterweite Ablegeflaeche.
  //
  // Sie zaehlte frueher dragenter gegen dragleave. Diese Zaehlung driftet zwangslaeufig: dragenter
  // wurde nur gezaehlt, wenn der Wurf nicht einem vorhandenen Ablegebereich galt, dragleave aber
  // immer; ein Wurf, der einem solchen Bereich galt, verliess die Behandlung sogar ganz ohne
  // Ausblenden. Ergebnis beim Kunden: die dunkle Flaeche blieb ueber der ganzen Kundenverwaltung
  // stehen und ging nicht mehr weg.
  //
  // Jetzt wird nicht gezaehlt. Solange gezogen wird, feuert dragover fortlaufend; bleibt es
  // laenger als IDLE_MS aus, blendet die Aufsicht die Flaeche aus. Der Zustand heilt sich damit
  // selbst - auch wenn der Zug ausserhalb des Fensters endet und gar kein Ereignis mehr kommt.
  const IDLE_MS=250;
  function windowDropOverlay(options){
    const opt=options||{},scope=opt.scope||window,doc=opt.document||document;
    if(doc.querySelector('#intake-drop-overlay'))return null;
    const zone=doc.createElement('div');zone.id='intake-drop-overlay';zone.hidden=true;
    zone.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72);pointer-events:none';
    zone.innerHTML='<div style="border:3px dashed #fff;border-radius:18px;padding:38px 46px;text-align:center;color:#fff;font-size:1.1rem;max-width:min(560px,90vw)"><strong style="display:block;font-size:1.35rem;margin-bottom:8px">Ordner hier ablegen</strong>Ganze Ordner, einzelne Dateien oder ein ZIP-Archiv. Das Portal sortiert selbst und fragt nur nach, was wirklich unklar ist.</div>';
    doc.body.append(zone);
    const now=opt.now||(()=>Date.now()),every=opt.setInterval||scope.setInterval.bind(scope),stop=opt.clearInterval||scope.clearInterval.bind(scope);
    let lastDragAt=0,watchdog=0;
    const hide=()=>{zone.hidden=true;if(watchdog){stop(watchdog);watchdog=0;}};
    const show=()=>{lastDragAt=now();zone.hidden=false;if(!watchdog)watchdog=every(()=>{if(now()-lastDragAt>IDLE_MS)hide();},120);};
    // Ein Ablegebereich, den es schon gibt - der Stundenplan-Dialog, die sichtbare Flaeche im
    // Import-Dialog -, behandelt seinen Wurf selbst. Diese Uebernahme darf ihm nicht
    // dazwischenfunken, sonst laende dieselbe Datei zweimal im Eingang.
    const foreign=opt.isForeign||(e=>e.defaultPrevented||!!(e.target&&typeof e.target.closest==='function'&&e.target.closest('[data-kp-drop-card],.modal-back,.modal')));
    for(const type of ['dragenter','dragover'])scope.addEventListener(type,e=>{if(!hasFiles(e)||foreign(e))return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';show();});
    // Jeder dieser Faelle beendet den Zug endgueltig. Sie sind die schnelle Abkuerzung; die
    // Aufsicht oben ist die Zusicherung, dass es auch ohne sie funktioniert.
    for(const type of ['dragend','drop','mouseleave','blur'])scope.addEventListener(type,hide,true);
    scope.addEventListener('dragleave',e=>{if(!e.relatedTarget)hide();});
    scope.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)hide();});
    // Ausgeblendet wird jeder Wurf schon von der Aufnahme-Behandlung oben: sie laeuft am Fenster
    // in der Aufnahmephase und damit vor jedem Ziel, das seinen Wurf selbst behandelt und die
    // Weitergabe stoppt. Genau daran fehlte es frueher - ein Wurf, der nicht hierher gehoerte,
    // liess die Flaeche stehen.
    scope.addEventListener('drop',async e=>{
      if(!hasFiles(e)||foreign(e))return;
      e.preventDefault();
      const collect=captureDrop(e);
      try{await opt.onResult(await collect());}catch(error){(opt.onError||(m=>alert(m)))(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(error):(error?.message||String(error)));}
    });
    return{element:zone,show,hide,visible:()=>!zone.hidden};
  }

  // Wohin ein Wurf gehoert: eine einzelne strukturierte Liste direkt in die Vorschau, in der sich
  // unklare Zeilen sofort im Typ richtigstellen lassen - alles andere (ein ganzer Ordner, ein
  // ZIP, mehrere Dateien, eine PDF) ueber den Eingang, der sortiert und die offenen Faelle zur
  // Pruefung stellt.
  const routeDropped=result=>(!result.folder&&result.files.length===1&&STRUCTURED.test(result.files[0].name))?'preview':'intake';

  window.KPFolderDrop={ACCEPT,SUPPORTED,STRUCTURED,IDLE_MS,routeDropped,usable,captureDrop,pick,dropCard,windowDropOverlay,hasFiles,emptyMessage};
})();
