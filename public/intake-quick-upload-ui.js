const INTAKE_QUICK_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(INTAKE_QUICK_PATH){
  const tenant=()=>document.querySelector('#tenantPick')?.value||'';
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body&&!((opt.body) instanceof FormData)?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  async function pdfText(file){try{const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';const doc=await pdfjs.getDocument({data:await file.arrayBuffer(),cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'}).promise;let text='';for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),c=await page.getTextContent();text+='\n'+c.items.map(x=>'str'in x?x.str+(x.hasEOL?'\n':' '):'').join('');}return text.replace(/[-\s]/g,'').length>=20?text.slice(0,300000):'';}catch{return'';}}
  function overlay(){const w=document.createElement('div');w.className='modal-back';w.innerHTML='<div class="modal" style="width:min(620px,94vw)"><h3 style="margin-top:0">Unterlagen werden verarbeitet</h3><p data-state>Bereite sicheren Einmal-Upload vor …</p><progress data-progress style="width:100%"></progress><p class="muted">Verträge, Teilnehmerlisten, Kurslisten, Fachlisten, Dozentenlisten - auch alles gemischt in einem Ordner. Das System sortiert selbst, legt Eindeutiges selbst an und stellt nur Unklarheiten ins Prüf-Cockpit.</p></div>';document.body.append(w);return w;}
  async function upload(files,opt={}){const t=tenant();if(!t)throw new Error('Kein Kunde ausgewählt.');if(!files.length)return;if(files.length>100)throw new Error(opt.folder?'Dieser Ordner enthält mehr als 100 lesbare Dateien. Packe ihn als ZIP-Datei und wirf diese ein - dann wird er in einem Zug eingelesen.':'Maximal 100 Dateien pro Stapel.');const total=files.reduce((n,f)=>n+f.size,0);if(total>50*1024*1024)throw new Error('Der Stapel darf maximal 50 MB groß sein.');const w=overlay(),state=w.querySelector('[data-state]');try{const created=await api(`/api/enterprise/intake/upload-links?tenant_id=${encodeURIComponent(t)}`,{method:'POST',body:JSON.stringify({label:'Interner Sofort-Upload',valid_days:1,max_uploads:1})}),url=new URL(created.link.url,location.origin),token=decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1)||'');if(!token)throw new Error('Upload-Token konnte nicht erzeugt werden.');const fd=new FormData();for(let i=0;i<files.length;i++){const file=files[i];fd.append('files',file);state.textContent=`Bereite Datei ${i+1} von ${files.length} vor …`;if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){const text=await pdfText(file);if(text)fd.append(`client_text_${i}`,text);}}state.textContent=`Übertrage ${files.length} Datei(en) sicher …`;const result=await api(`/api/intake/upload/${encodeURIComponent(token)}`,{method:'POST',body:fd});const automatic=result.status?.includes('automatisch');state.innerHTML=automatic?`✅ <strong>${files.length} Datei(en) eingegangen und alles Eindeutige automatisch angelegt.</strong>`:`✅ <strong>${files.length} Datei(en) eingegangen.</strong> Unklare Fälle warten jetzt auf deine Prüfung.`;if(opt.dropped)state.innerHTML+=`<br><span class="muted">${opt.dropped} Datei(en) im Ordner waren keine lesbaren Unterlagen und wurden nicht übertragen.</span>`;w.querySelector('[data-progress]').remove();
      // Der Hinweis "liegt im Cockpit" hilft nur dem, der weiss, wo das Cockpit ist. Hier steht
      // stattdessen der Weg dorthin - und bei offenen Faellen fuehrt er von selbst hin.
      const review=document.querySelector('#intake-center-nav');
      if(review){const go=document.createElement('button');go.className='btn';go.type='button';go.style.marginTop='12px';go.textContent=automatic?'Ergebnis ansehen':'Unklare Fälle jetzt prüfen';go.onclick=()=>{w.remove();review.click();};state.after(go);
        if(!automatic&&opt.openReview)setTimeout(()=>{if(document.body.contains(w)){w.remove();review.click();}},2600);
        else setTimeout(()=>w.remove(),9000);}
      else setTimeout(()=>w.remove(),6000);}catch(e){state.textContent=`Upload nicht abgeschlossen: ${window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(e):e.message}`;w.querySelector('[data-progress]')?.remove();setTimeout(()=>w.remove(),5000);}}
  const drop=()=>window.KPFolderDrop;
  const usable=files=>drop()?drop().usable(files):files;
  // Ein Ergebnis der gemeinsamen Ablegeflaeche - egal ob abgelegt, als Ordner oder als
  // Einzeldateien gewaehlt - geht hier immer denselben Weg.
  async function accept(result){if(!result)return;if(!result.files.length)return alert(drop()?drop().emptyMessage(result.folder):'Keine lesbare Unterlage dabei.');await upload(result.files,{folder:result.folder,dropped:result.dropped,openReview:true});}
  async function choose(folder){const d=drop();if(!d)return alert('Die Uploadhilfe ist noch nicht geladen. Bitte die Seite neu laden.');await accept(await d.pick(folder)).catch(e=>alert(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(e):e.message));}
  // Ein eigener Dialog mit sichtbarer Ablegeflaeche. Vorher sprang hier sofort der Dateidialog des
  // Browsers auf, und die Ablegeflaeche zeigte sich nur, wenn man zufaellig etwas ueber das
  // Fenster zog. Beide Einstiege - Bildungstraeger einlesen und ganzer Ordner - oeffnen jetzt
  // dieselbe Flaeche.
  function openDropDialog(){
    if(!tenant())return alert('Kein Kunde ausgewählt.');
    const d=drop();if(!d)return alert('Die Uploadhilfe ist noch nicht geladen. Bitte die Seite neu laden.');
    const w=document.createElement('div');w.className='modal-back';
    w.innerHTML='<div class="modal" style="width:min(680px,94vw)"><div class="top"><h3 style="margin:0">Ganzen Ordner einlesen</h3><button class="btn secondary" data-close type="button">×</button></div><div class="muted">Verträge, Teilnehmerlisten, Kurslisten, Fachlisten, Dozentenlisten, Organigramme, Raumlisten - auch alles gemischt. Das Portal sortiert selbst, legt Eindeutiges an und stellt nur Unklarheiten zur Prüfung.</div><div data-body></div></div>';
    document.body.append(w);
    w.querySelector('[data-close]').onclick=()=>w.remove();
    w.addEventListener('click',e=>{if(e.target===w)w.remove();});
    w.querySelector('[data-body]').append(d.dropCard({onFiles:async result=>{w.remove();await accept(result);}}));
  }
  // Die fensterweite Ablegeflaeche liegt im gemeinsamen Bauteil - dieselbe Erkennung, dieselbe
  // Aufsicht, die sie wieder ausblendet.
  function dropZone(){window.KPFolderDrop?.windowDropOverlay({onResult:accept,onError:m=>alert(m)});}
  function enhance(){const side=document.querySelector('.side');if(!side||side.querySelector('#intake-quick-upload-nav'))return;const anchor=side.querySelector('#intake-center-nav');
    const b=document.createElement('button');b.id='intake-quick-upload-nav';b.className='nav';b.type='button';b.textContent='Unterlagen jetzt einwerfen';
    const f=document.createElement('button');f.id='intake-folder-upload-nav';f.className='nav';f.type='button';f.textContent='Ganzen Ordner einlesen';
    // Ohne diese Markierung sortiert die Kundenverwaltung den Knopf hinter "Weitere Bereiche" -
    // die Liste der dauerhaft sichtbaren Eintraege ist fest, und neue stehen nicht darin. Der
    // Weg, auf dem ein Bildungstraeger seine Daten ueberhaupt ins Portal bekommt, darf nicht
    // der vierzehnte Eintrag in einem Klappmenue sein.
    f.dataset.customerNavPrimary='1';
    f.dataset.customerNavSourceLabel='Ganzen Ordner einlesen';
    // Der Anker wird mit side.querySelector() gesucht, also irgendwo unterhalb der Leiste - auf der
    // Kundenoberflaeche liegt er in .kp-customer-nav-group-items und ist damit gerade kein direktes
    // Kind von .side. side.insertBefore() verlangt aber genau das und warf deshalb
    // NotFoundError: "The node before which the new node is to be inserted is not a child of this
    // node". Der Fehler flog vor beiden append-Zeilen: gemessen im Browser fehlten danach
    // "Unterlagen jetzt einwerfen" und "Ganzen Ordner einlesen" vollstaendig in der Navigation -
    // also genau die zwei Wege, auf denen ein Bildungstraeger seine Daten ins Portal bekommt.
    // Eingefuegt wird jetzt neben dem Anker, dort wo er wirklich haengt.
    if(anchor?.parentNode)anchor.parentNode.insertBefore(b,anchor.nextSibling);else side.append(b);
    b.insertAdjacentElement('afterend',f);
    b.onclick=()=>void choose(false);f.onclick=openDropDialog;
    f.title='Ordner lassen sich auch einfach ins Fenster ziehen.';
    dropZone();}
  // Der Bildungstraeger-Import benutzt denselben Weg fuer ganze Ordner. Ohne diese Freigabe
  // muesste er den Ablauf ein zweites Mal bauen - und zwei Ablaeufe fuer dieselbe Sache laufen
  // frueher oder spaeter auseinander.
  window.KPIntakeUpload={upload,accept,openDropDialog};
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});enhance();
}
