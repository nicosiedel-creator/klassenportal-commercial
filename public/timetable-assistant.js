const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={date:'Datum',start:'Beginn',end:'Ende',subject:'Fach / Modul',teacher:'Dozent / Lehrkraft',room:'Raum / Ort',notes:'Hinweise / Informationen',course:'Klasse / Kurs',mode:'Unterrichtsart / Format'};
const required=new Set(['date','start','end']);
const fieldOrder=['date','start','end','subject','teacher','room','notes','course','mode'];
const headerAliases={
  date:['datum','date','tag','unterrichtstag','schultag'],start:['beginn','start','von','startzeit','uhrzeitvon'],end:['ende','end','bis','endzeit','uhrzeitbis'],
  subject:['fach','subject','unterrichtsfach','modul','lernfeld','thema'],teacher:['dozent','dozentin','lehrer','lehrkraft','trainer','trainerin','teacher','referent','referentin'],
  room:['raum','room','ort','unterrichtsraum'],notes:['hinweis','hinweise','info','infos','information','informationen','bemerkung','bemerkungen','notiz','notizen'],
  course:['klasse','kurs','course','class','gruppe','lehrgang'],mode:['unterricht','unterrichtsart','format','modus','durchfuhrung','durchfuehrung','prasenzonline','praesenzonline']
};
let pdfJsPromise=null;

function tenantId(){return document.querySelector('#tenantPick')?.value||'';}
function humanHeader(v){return String(v||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());}
function norm(v){return String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');}
async function getJson(url,opt={}){const r=await fetch(url,{credentials:'same-origin',...opt});let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d.error||`HTTP_${r.status}`);e.data=d;throw e;}return d;}

function errorText(code){return ({
  TIMETABLE_FILE_REQUIRED:'Bitte zuerst eine Stundenplandatei auswählen.',
  TIMETABLE_FILE_UNSUPPORTED:'Unterstützt werden PDF, Excel (.xlsx) und CSV.',
  TIMETABLE_FILE_TOO_LARGE:'Die Stundenplandatei ist zu groß.',
  TIMETABLE_TOO_MANY_ROWS:'Die Datei enthält mehr als 5.000 Stundenplanzeilen.',
  TIMETABLE_EMPTY:'In der Datei wurden keine Stundenplanzeilen gefunden.',
  TIMETABLE_VALIDATION_FAILED:'Der Stundenplan enthält noch nicht eindeutig zuordenbare oder fehlerhafte Zeilen.',
  TIMETABLE_TARGET_REVIEW_REQUIRED:'Standort, Organisationsbereich oder Klasse/Kurs konnten nicht in allen Zeilen eindeutig zugeordnet werden. Es wurde noch nichts übernommen.',
  TIMETABLE_NO_VALID_ROWS:'Es wurden keine gültigen Stundenplanzeilen erkannt.',
  TIMETABLE_PDF_NO_TEXT:'Das PDF enthält keine auslesbare Textschicht. Es handelt sich wahrscheinlich um einen Scan. Das Original kann gespeichert werden, der Stundenplan muss daraus aber geprüft bzw. anderweitig strukturiert werden.',
  TIMETABLE_PDF_STRUCTURE_NOT_RECOGNIZED:'Die Tabelle im PDF konnte nicht sicher erkannt werden. Bitte prüfe, ob das PDF Tabellenüberschriften wie Datum, Beginn und Ende enthält.',
  TIMETABLE_PDF_TOO_MANY_PAGES:'Das PDF ist für den automatischen Import zu umfangreich.',
  PDFJS_LOAD_FAILED:'Die lokale PDF-Erkennung konnte nicht geladen werden.',
  FORBIDDEN_ROLE:'Für den Stundenplan-Import fehlt die erforderliche Berechtigung.',
  FORBIDDEN_COURSE:'Für mindestens eine Klasse fehlt die Berechtigung.'
})[code]||(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(code):code);}

async function loadPdfJs(){
  if(!pdfJsPromise)pdfJsPromise=import('/vendor/pdfjs/pdf.mjs').then(m=>{m.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';return m;}).catch(()=>{throw new Error('PDFJS_LOAD_FAILED')});
  return pdfJsPromise;
}
function semanticFor(text){const n=norm(text);for(const [key,aliases] of Object.entries(headerAliases)){if(aliases.some(a=>n===norm(a)||n.includes(norm(a))||norm(a).includes(n)))return key;}return null;}
function groupLines(items){
  const lines=[];
  for(const item of items.sort((a,b)=>b.y-a.y||a.x-b.x)){
    let line=lines.find(l=>Math.abs(l.y-item.y)<=2.8);
    if(!line){line={y:item.y,items:[]};lines.push(line);}
    line.items.push(item);
  }
  lines.forEach(l=>l.items.sort((a,b)=>a.x-b.x));
  return lines.sort((a,b)=>b.y-a.y);
}
function findHeader(lines){
  let best=null;
  for(const line of lines.slice(0,35)){
    const sem=line.items.map(i=>semanticFor(i.str)).filter(Boolean);
    const unique=new Set(sem);let score=unique.size;
    if(unique.has('date'))score+=2;if(unique.has('start'))score+=2;if(unique.has('end'))score+=2;
    if(score>=7&&(!best||score>best.score))best={line,score};
  }
  return best?.line||null;
}
function uniqueHeaders(items){
  const used=new Map();
  return items.map((i,idx)=>{let h=String(i.str||'').trim()||`Spalte ${idx+1}`;const n=(used.get(h)||0)+1;used.set(h,n);if(n>1)h=`${h} ${n}`;return h;});
}
function assignLine(line,columns){
  const out=Array(columns.length).fill('');
  for(const item of line.items){
    let best=0,dist=Infinity;columns.forEach((c,i)=>{const d=Math.abs(item.x-c.x);if(d<dist){dist=d;best=i;}});
    out[best]=out[best]?`${out[best]} ${item.str}`:item.str;
  }
  return out.map(x=>x.trim());
}
function csvEscape(v){const s=String(v??'');return /[;"\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function rowsToCsv(headers,rows){return [headers,...rows].map(r=>r.map(csvEscape).join(';')).join('\r\n');}

async function pdfToStructuredFile(file,onProgress=()=>{}){
  if(file.size>20*1024*1024)throw new Error('TIMETABLE_FILE_TOO_LARGE');
  const pdfjs=await loadPdfJs();
  const data=new Uint8Array(await file.arrayBuffer());
  const task=pdfjs.getDocument({data,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
  const pdf=await task.promise;if(pdf.numPages>80)throw new Error('TIMETABLE_PDF_TOO_MANY_PAGES');
  let template=null,totalText=0;const rows=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    onProgress(`PDF wird gelesen: Seite ${pageNo} von ${pdf.numPages} …`);
    const page=await pdf.getPage(pageNo),tc=await page.getTextContent();
    const items=tc.items.filter(x=>typeof x.str==='string'&&x.str.trim()).map(x=>({str:x.str.trim(),x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0)}));
    totalText+=items.length;if(!items.length)continue;
    const lines=groupLines(items),headerLine=findHeader(lines);
    if(headerLine){
      const headers=uniqueHeaders(headerLine.items),columns=headerLine.items.map((x,i)=>({x:x.x,header:headers[i],semantic:semanticFor(x.str)}));
      if(!template)template={headers,columns};
      const active=template&&columns.length===template.columns.length?{headers,columns}:template;
      const startIndex=lines.indexOf(headerLine)+1;
      const dateIdx=active.columns.findIndex(c=>c.semantic==='date'),startIdx=active.columns.findIndex(c=>c.semantic==='start'),endIdx=active.columns.findIndex(c=>c.semantic==='end');
      for(const line of lines.slice(startIndex)){
        if(findHeader([line]))continue;
        const row=assignLine(line,active.columns);if(row.filter(Boolean).length<2)continue;
        const hasCore=[dateIdx,startIdx,endIdx].some(i=>i>=0&&row[i]);
        if(!hasCore&&rows.length){const prev=rows[rows.length-1];row.forEach((v,i)=>{if(v)prev[i]=prev[i]?`${prev[i]} ${v}`:v;});continue;}
        rows.push(row);
      }
    }else if(template){
      for(const line of lines){const row=assignLine(line,template.columns);if(row.filter(Boolean).length<2)continue;rows.push(row);}
    }
  }
  if(totalText<5)throw new Error('TIMETABLE_PDF_NO_TEXT');
  if(!template||!rows.length)throw new Error('TIMETABLE_PDF_STRUCTURE_NOT_RECOGNIZED');
  const csv=rowsToCsv(template.headers,rows);
  return new File([csv],`${file.name.replace(/\.pdf$/i,'')}-ausgelesen.csv`,{type:'text/csv'});
}

async function openAssistant(){
  const tenant=tenantId();if(!tenant){alert('Bitte zuerst einen Bildungsträger auswählen.');return;}
  let courses=[];try{courses=(await getJson(`/api/courses?tenant_id=${encodeURIComponent(tenant)}`)).courses||[];}catch(e){alert(errorText(e.message));return;}
  const back=document.createElement('div');back.className='modal-back';back.innerHTML=`<div class="modal" style="width:min(980px,96vw);max-height:92vh;overflow:auto"><div class="top"><div><h3 style="margin:0">Stundenplan automatisch einlesen</h3><div class="muted">PDF, Excel oder CSV hochladen – auch mit mehreren Standorten, Bereichen und Klassen/Kursen.</div></div><button type="button" class="btn secondary" id="tti-close">×</button></div>
    <div class="card" style="margin-top:14px">
      <div class="row"><label class="field">Klasse / Kurs <span class="muted">(optional)</span><select id="tti-course"><option value="">Automatisch aus Datei und Organisationsstruktur erkennen</option>${courses.map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select></label><label class="field">Stundenplandatei<input id="tti-file" type="file" accept=".pdf,.xlsx,.csv,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label></div>
      <p class="muted">Standort, Bereich/Maßnahme und Klasse/Kurs werden – soweit in der Datei vorhanden – gemeinsam gegen die hinterlegte Organisationsstruktur geprüft. Nur eindeutige Treffer werden automatisch übernommen. Eine ausgewählte Klasse dient als Fallback für Dateien ohne eigene Zielangaben.</p>
      <button class="btn" type="button" id="tti-preview">Datei analysieren</button><span id="tti-status" class="muted" style="margin-left:10px"></span>
    </div>
    <div id="tti-result"></div>
  </div>`;document.body.append(back);
  const close=()=>back.remove();back.querySelector('#tti-close').onclick=close;back.addEventListener('click',e=>{if(e.target===back)close()});
  const course=back.querySelector('#tti-course'),file=back.querySelector('#tti-file'),status=back.querySelector('#tti-status'),result=back.querySelector('#tti-result');
  if(courses.length===1)course.value=courses[0].id;
  let preparedOriginal=null,preparedFile=null,lastTargeting=null;

  function mappingObject(){const out={};back.querySelectorAll('[data-map]').forEach(s=>{if(s.value)out[s.dataset.map]=s.value});return out;}
  async function prepareFile(){
    const original=file.files?.[0];if(!original)throw new Error('TIMETABLE_FILE_REQUIRED');
    if(preparedOriginal===original&&preparedFile)return preparedFile;
    preparedOriginal=original;preparedFile=null;
    if(original.type==='application/pdf'||original.name.toLowerCase().endsWith('.pdf'))preparedFile=await pdfToStructuredFile(original,t=>status.textContent=t);
    else preparedFile=original;
    return preparedFile;
  }
  async function makeForm(withMapping=false){const fd=new FormData();fd.append('file',await prepareFile());if(course.value)fd.append('course_id',course.value);if(withMapping)fd.append('mapping',JSON.stringify(mappingObject()));return fd;}
  function issueList(xs=[]){if(!xs.length)return '<div class="notice ok">Keine Zuordnungsfehler erkannt.</div>';return `<div class="notice" style="background:#fef2f2;color:#991b1b"><strong>Bitte prüfen:</strong><ul style="margin-bottom:0">${xs.slice(0,20).map(x=>`<li>${x.row>1?`Zeile ${x.row}: `:''}${E(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(x):x.message)}${x.value!==undefined&&x.value!==null&&String(x.value)!==''?` <span class="muted">(${E(x.value)})</span>`:''}</li>`).join('')}</ul>${xs.length>20?`<div>… und ${xs.length-20} weitere Hinweise.</div>`:''}</div>`;}
  function targetingBox(t){if(!t?.hierarchyDetected)return '';const groups=new Map();for(const d of t.decisions||[]){if(d.status!=='automatic')continue;const key=[d.orgPath,d.courseName].filter(Boolean).join(' › ')||d.courseName||d.courseCode||'Klasse/Kurs';groups.set(key,(groups.get(key)||0)+1);}return `<div class="card" style="margin-top:14px"><h3>Standorte & Zielklassen</h3><div class="grid"><div><div class="muted">Automatisch zugeordnet</div><strong>${E(t.automatic)}</strong></div><div><div class="muted">Prüfung nötig</div><strong>${E(t.review)}</strong></div><div><div class="muted">Blockiert</div><strong>${E(t.blocked)}</strong></div></div>${groups.size?`<ul>${[...groups.entries()].slice(0,30).map(([k,n])=>`<li><strong>${E(k)}</strong> · ${E(n)} Zeile(n)</li>`).join('')}</ul>`:''}<p class="muted">Die Organisationsangaben geben keine zusätzlichen Rechte. Es können nur Klassen/Kurse importiert werden, für die dein Konto bereits berechtigt ist.</p></div>`;}
  function sampleTable(rows=[]){if(!rows.length)return '<p class="muted">Keine gültige Vorschau verfügbar.</p>';return `<div class="table-wrap"><table><tr><th>Zeile</th><th>Klasse</th><th>Datum</th><th>Beginn</th><th>Ende</th><th>Fach</th><th>Dozent</th><th>Raum</th></tr>${rows.map(r=>`<tr><td>${E(r.row)}</td><td>${E(r.klasse)}</td><td>${E(r.datum)}</td><td>${E(r.beginn)}</td><td>${E(r.ende)}</td><td>${E(r.fach||'')}</td><td>${E(r.dozent||'')}</td><td>${E(r.raum||'')}</td></tr>`).join('')}</table></div>`;}
  function renderPreview(d){const options=`<option value="">— nicht zuordnen —</option>${d.headers.map(h=>`<option value="${E(h)}">${E(humanHeader(h))}</option>`).join('')}`;result.innerHTML=`${targetingBox(d.targeting)}<div class="card" style="margin-top:14px"><h3>Automatische Spaltenzuordnung</h3><div class="grid">${fieldOrder.map(k=>`<label class="field">${labels[k]}${required.has(k)?' *':''}<select data-map="${k}">${options}</select></label>`).join('')}</div><p class="muted">Die Zuordnung wurde automatisch vorgeschlagen. Bei abweichenden Formaten kannst du sie korrigieren und danach erneut prüfen.</p><button type="button" class="btn secondary" id="tti-recheck">Zuordnung erneut prüfen</button></div>
      <div class="card" style="margin-top:14px"><h3>Prüfergebnis</h3><div class="grid"><div><div class="muted">Zeilen erkannt</div><strong>${E(d.rowsSeen)}</strong></div><div><div class="muted">Gültig</div><strong>${E(d.rowsValid)}</strong></div><div><div class="muted">Fehlerhaft</div><strong>${E(d.rowsInvalid)}</strong></div><div><div class="muted">Doppelte Zeilen</div><strong>${E(d.duplicates)}</strong></div><div><div class="muted">Zeitraum</div><strong>${E(d.dateFrom||'—')} – ${E(d.dateTo||'—')}</strong></div></div>${issueList(d.issues)}<h4>Vorschau</h4>${sampleTable(d.sample)}</div>
      <div class="card" style="margin-top:14px"><h3>Übernahme</h3><label class="field">Verhalten<select id="tti-mode"><option value="sync">Mit bisher automatisch importiertem Stundenplan abgleichen (empfohlen)</option><option value="append">Nur ergänzen</option></select></label><p class="muted"><strong>Abgleichen:</strong> Im Zeitraum der Datei werden nur frühere automatisch importierte Stundenplanzeilen dieser Klassen ersetzt. Manuell angelegte Einträge bleiben bestehen.</p><button type="button" class="btn" id="tti-apply" ${d.issues?.length?'disabled':''}>Stundenplan übernehmen</button><span id="tti-apply-status" class="muted" style="margin-left:10px"></span></div>`;
    fieldOrder.forEach(k=>{const s=result.querySelector(`[data-map="${k}"]`);if(s&&d.mapping?.[k])s.value=d.mapping[k];});
    const markStale=()=>{const a=result.querySelector('#tti-apply');if(a)a.disabled=true;const st=result.querySelector('#tti-apply-status');if(st)st.textContent='Zuordnung geändert – bitte erneut prüfen.';};
    result.querySelectorAll('[data-map]').forEach(x=>x.addEventListener('change',markStale));course.addEventListener('change',markStale,{once:true});
    result.querySelector('#tti-recheck').onclick=()=>runPreview(true);result.querySelector('#tti-apply').onclick=runApply;
  }

  async function runPreview(withMapping=false){
    if(!file.files?.[0]){status.textContent='Bitte eine Datei auswählen.';return;}
    status.textContent='Datei wird analysiert …';try{const d=await getJson(`/api/timetable/preview?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',body:await makeForm(withMapping)});lastTargeting=d.targeting||null;renderPreview(d);status.textContent=d.targeting?.hierarchyDetected?`Analyse abgeschlossen: ${d.targeting.automatic} Zeile(n) eindeutig Standort/Klasse zugeordnet.`:'Analyse abgeschlossen.';}catch(e){lastTargeting=e.data?.targeting||null;status.textContent=errorText(e.message);const issues=e.data?.issues||[];result.innerHTML=`${targetingBox(lastTargeting)}${issues.length?`<div class="card" style="margin-top:14px">${issueList(issues)}</div>`:''}`;}
  }
  async function archiveOriginal(targeting){
    const original=file.files?.[0];if(!original)return;const fd=new FormData();fd.append('file',original);const targetIds=[...new Set((targeting?.decisions||[]).filter(x=>x.status==='automatic'&&x.courseId).map(x=>x.courseId))];if(targetIds.length===1)fd.append('course_id',targetIds[0]);else if(!targeting&&course.value)fd.append('course_id',course.value);
    await getJson(`/api/timetable/source?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',body:fd});
  }
  async function runApply(){
    const btn=result.querySelector('#tti-apply'),st=result.querySelector('#tti-apply-status');btn.disabled=true;st.textContent='Stundenplan wird übernommen …';
    const fd=await makeForm(true);fd.append('mode',result.querySelector('#tti-mode').value);
    try{const d=await getJson(`/api/timetable/apply?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',body:fd});lastTargeting=d.targeting||lastTargeting;let archived=true;try{await archiveOriginal(lastTargeting);}catch{archived=false;}st.textContent=`Fertig: ${d.imported} Unterrichtseinträge übernommen${d.skipped?`, ${d.skipped} Dubletten übersprungen`:''}.${archived?' Originaldatei archiviert.':' Stundenplan übernommen; die Originaldatei konnte nicht archiviert werden.'}`;btn.textContent='Übernommen';setTimeout(()=>{close();document.querySelector('[data-v="content"]')?.click();},1800);}catch(e){btn.disabled=false;lastTargeting=e.data?.targeting||lastTargeting;st.textContent=errorText(e.message);const issues=e.data?.issues||[];if(issues.length)result.querySelector('.notice')?.remove(),result.querySelector('#tti-mode')?.closest('.card')?.insertAdjacentHTML('beforebegin',`${targetingBox(lastTargeting)}<div class="card" style="margin-top:14px">${issueList(issues)}</div>`);}
  }
  file.addEventListener('change',()=>{preparedOriginal=null;preparedFile=null;lastTargeting=null;result.innerHTML='';status.textContent='';});
  back.querySelector('#tti-preview').onclick=()=>runPreview(false);
}

function enhance(){
  const title=[...document.querySelectorAll('.content h2')].find(x=>x.textContent?.trim()==='Inhalte');if(!title)return;
  const content=title.closest('.content'),toolbar=content?.querySelector('.toolbar');if(!toolbar||toolbar.querySelector('#timetable-import-open'))return;
  const b=document.createElement('button');b.className='btn';b.id='timetable-import-open';b.type='button';b.textContent='Stundenplan automatisch einlesen';b.onclick=openAssistant;toolbar.prepend(b);
  const hint=document.createElement('div');hint.className='muted';hint.style.cssText='width:100%;margin:4px 0 8px';hint.textContent='PDF, Excel oder CSV automatisch erkennen, prüfen und mit dem vorhandenen Stundenplan abgleichen – auf Wunsch auch mehrere Standorte, Bereiche und Klassen/Kurse in einer Datei.';toolbar.after(hint);
}
new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});enhance();