const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={date:'Datum',start:'Beginn',end:'Ende',subject:'Fach / Modul',teacher:'Dozent / Lehrkraft',room:'Raum / Ort',notes:'Hinweise / Informationen',course:'Klasse / Kurs',mode:'Unterrichtsart / Format'};
const required=new Set(['date','start','end']);
const fieldOrder=['date','start','end','subject','teacher','room','notes','course','mode'];

function tenantId(){return document.querySelector('#tenantPick')?.value||'';}
function humanHeader(v){return String(v||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());}
async function getJson(url,opt={}){const r=await fetch(url,{credentials:'same-origin',...opt});let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d.error||`HTTP_${r.status}`);e.data=d;throw e;}return d;}

function errorText(code){return ({
  TIMETABLE_FILE_REQUIRED:'Bitte zuerst eine Stundenplandatei auswählen.',
  TIMETABLE_FILE_UNSUPPORTED:'Dieses Dateiformat wird für den Stundenplan noch nicht unterstützt. Bitte Excel (.xlsx) oder CSV verwenden.',
  TIMETABLE_FILE_TOO_LARGE:'Die Datei ist größer als 12 MB.',
  TIMETABLE_TOO_MANY_ROWS:'Die Datei enthält mehr als 5.000 Stundenplanzeilen.',
  TIMETABLE_EMPTY:'In der Datei wurden keine Stundenplanzeilen gefunden.',
  TIMETABLE_VALIDATION_FAILED:'Der Stundenplan enthält noch nicht eindeutig zuordenbare oder fehlerhafte Zeilen.',
  TIMETABLE_NO_VALID_ROWS:'Es wurden keine gültigen Stundenplanzeilen erkannt.',
  FORBIDDEN_ROLE:'Für den Stundenplan-Import fehlt die erforderliche Berechtigung.',
  FORBIDDEN_COURSE:'Für mindestens eine Klasse fehlt die Berechtigung.'
})[code]||code;}

async function openAssistant(){
  const tenant=tenantId();if(!tenant){alert('Bitte zuerst einen Bildungsträger auswählen.');return;}
  let courses=[];try{courses=(await getJson(`/api/courses?tenant_id=${encodeURIComponent(tenant)}`)).courses||[];}catch(e){alert(errorText(e.message));return;}
  const back=document.createElement('div');back.className='modal-back';back.innerHTML=`<div class="modal" style="width:min(980px,96vw);max-height:92vh;overflow:auto"><div class="top"><div><h3 style="margin:0">Stundenplan automatisch einlesen</h3><div class="muted">Excel oder CSV hochladen, automatisch erkennen, prüfen und übernehmen.</div></div><button type="button" class="btn secondary" id="tti-close">×</button></div>
    <div class="card" style="margin-top:14px">
      <div class="row"><label class="field">Klasse / Kurs<select id="tti-course"><option value="">Automatisch aus Dateispalte erkennen</option>${courses.map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select></label><label class="field">Datei<input id="tti-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label></div>
      <p class="muted">Bei nur einer ausgewählten Klasse wird die gesamte Datei dieser Klasse zugeordnet. Bei „automatisch“ muss die Datei eine Klasse-/Kursspalte enthalten.</p>
      <button class="btn" type="button" id="tti-preview">Datei analysieren</button><span id="tti-status" class="muted" style="margin-left:10px"></span>
    </div>
    <div id="tti-result"></div>
  </div>`;document.body.append(back);
  const close=()=>back.remove();back.querySelector('#tti-close').onclick=close;back.addEventListener('click',e=>{if(e.target===back)close()});
  const course=back.querySelector('#tti-course'),file=back.querySelector('#tti-file'),status=back.querySelector('#tti-status'),result=back.querySelector('#tti-result');
  if(courses.length===1)course.value=courses[0].id;
  let preview=null;

  function mappingObject(){const out={};back.querySelectorAll('[data-map]').forEach(s=>{if(s.value)out[s.dataset.map]=s.value});return out;}
  function makeForm(withMapping=false){const fd=new FormData();if(file.files?.[0])fd.append('file',file.files[0]);if(course.value)fd.append('course_id',course.value);if(withMapping)fd.append('mapping',JSON.stringify(mappingObject()));return fd;}
  function issueList(xs=[]){if(!xs.length)return '<div class="notice ok">Keine Zuordnungsfehler erkannt.</div>';return `<div class="notice" style="background:#fef2f2;color:#991b1b"><strong>Bitte prüfen:</strong><ul style="margin-bottom:0">${xs.slice(0,20).map(x=>`<li>${x.row>1?`Zeile ${x.row}: `:''}${E(x.message)}${x.value!==undefined&&x.value!==null&&String(x.value)!==''?` <span class="muted">(${E(x.value)})</span>`:''}</li>`).join('')}</ul>${xs.length>20?`<div>… und ${xs.length-20} weitere Hinweise.</div>`:''}</div>`;}
  function sampleTable(rows=[]){if(!rows.length)return '<p class="muted">Keine gültige Vorschau verfügbar.</p>';return `<div class="table-wrap"><table><tr><th>Zeile</th><th>Klasse</th><th>Datum</th><th>Beginn</th><th>Ende</th><th>Fach</th><th>Dozent</th><th>Raum</th></tr>${rows.map(r=>`<tr><td>${E(r.row)}</td><td>${E(r.klasse)}</td><td>${E(r.datum)}</td><td>${E(r.beginn)}</td><td>${E(r.ende)}</td><td>${E(r.fach||'')}</td><td>${E(r.dozent||'')}</td><td>${E(r.raum||'')}</td></tr>`).join('')}</table></div>`;}
  function renderPreview(d){preview=d;const options=`<option value="">— nicht zuordnen —</option>${d.headers.map(h=>`<option value="${E(h)}">${E(humanHeader(h))}</option>`).join('')}`;result.innerHTML=`<div class="card" style="margin-top:14px"><h3>Automatische Spaltenzuordnung</h3><div class="grid">${fieldOrder.map(k=>`<label class="field">${labels[k]}${required.has(k)?' *':''}<select data-map="${k}">${options}</select></label>`).join('')}</div><p class="muted">Die Zuordnung wurde automatisch vorgeschlagen. Bei abweichenden Dateiformaten kannst du sie hier korrigieren und danach erneut prüfen.</p><button type="button" class="btn secondary" id="tti-recheck">Zuordnung erneut prüfen</button></div>
      <div class="card" style="margin-top:14px"><h3>Prüfergebnis</h3><div class="grid"><div><div class="muted">Zeilen erkannt</div><strong>${E(d.rowsSeen)}</strong></div><div><div class="muted">Gültig</div><strong>${E(d.rowsValid)}</strong></div><div><div class="muted">Fehlerhaft</div><strong>${E(d.rowsInvalid)}</strong></div><div><div class="muted">Doppelte Zeilen in Datei</div><strong>${E(d.duplicates)}</strong></div><div><div class="muted">Zeitraum</div><strong>${E(d.dateFrom||'—')} – ${E(d.dateTo||'—')}</strong></div></div>${issueList(d.issues)}<h4>Vorschau</h4>${sampleTable(d.sample)}</div>
      <div class="card" style="margin-top:14px"><h3>Übernahme</h3><label class="field">Verhalten<select id="tti-mode"><option value="sync">Mit bisher automatisch importiertem Stundenplan abgleichen (empfohlen)</option><option value="append">Nur ergänzen</option></select></label><p class="muted"><strong>Abgleichen:</strong> Im Zeitraum der Datei werden nur frühere automatisch importierte Stundenplanzeilen dieser Klassen ersetzt. Manuell angelegte Einträge bleiben bestehen. Exakte Dubletten werden nicht doppelt angelegt.</p><button type="button" class="btn" id="tti-apply" ${d.issues?.length?'disabled':''}>Stundenplan übernehmen</button><span id="tti-apply-status" class="muted" style="margin-left:10px"></span></div>`;
    fieldOrder.forEach(k=>{const s=result.querySelector(`[data-map="${k}"]`);if(s&&d.mapping?.[k])s.value=d.mapping[k];});
    const markStale=()=>{const a=result.querySelector('#tti-apply');if(a)a.disabled=true;const st=result.querySelector('#tti-apply-status');if(st)st.textContent='Zuordnung geändert – bitte erneut prüfen.';};
    result.querySelectorAll('[data-map]').forEach(x=>x.addEventListener('change',markStale));course.addEventListener('change',markStale,{once:true});
    result.querySelector('#tti-recheck').onclick=()=>runPreview(true);
    result.querySelector('#tti-apply').onclick=runApply;
  }

  async function runPreview(withMapping=false){
    if(!file.files?.[0]){status.textContent='Bitte eine Datei auswählen.';return;}
    status.textContent='Datei wird analysiert …';try{const d=await getJson(`/api/timetable/preview?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',body:makeForm(withMapping)});renderPreview(d);status.textContent='Analyse abgeschlossen.';}catch(e){status.textContent=errorText(e.message);const issues=e.data?.issues||[];if(issues.length)result.innerHTML=`<div class="card" style="margin-top:14px">${issueList(issues)}</div>`;}
  }
  async function runApply(){
    const btn=result.querySelector('#tti-apply'),st=result.querySelector('#tti-apply-status');btn.disabled=true;st.textContent='Stundenplan wird übernommen …';
    const fd=makeForm(true);fd.append('mode',result.querySelector('#tti-mode').value);
    try{const d=await getJson(`/api/timetable/apply?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',body:fd});st.textContent=`Fertig: ${d.imported} Unterrichtseinträge übernommen${d.skipped?`, ${d.skipped} Dubletten/Überschneidungen übersprungen`:''}.`;btn.textContent='Übernommen';setTimeout(()=>{close();document.querySelector('[data-v="content"]')?.click();},1400);}catch(e){btn.disabled=false;st.textContent=errorText(e.message);const issues=e.data?.issues||[];if(issues.length)result.querySelector('.notice')?.remove(),result.querySelector('#tti-mode')?.closest('.card')?.insertAdjacentHTML('beforebegin',`<div class="card" style="margin-top:14px">${issueList(issues)}</div>`);}
  }
  back.querySelector('#tti-preview').onclick=()=>runPreview(false);
}

function enhance(){
  const title=[...document.querySelectorAll('.content h2')].find(x=>x.textContent?.trim()==='Inhalte');if(!title)return;
  const content=title.closest('.content'),toolbar=content?.querySelector('.toolbar');if(!toolbar||toolbar.querySelector('#timetable-import-open'))return;
  const b=document.createElement('button');b.className='btn';b.id='timetable-import-open';b.type='button';b.textContent='Stundenplan automatisch einlesen';b.onclick=openAssistant;toolbar.prepend(b);
  const hint=document.createElement('div');hint.className='muted';hint.style.cssText='width:100%;margin:4px 0 8px';hint.textContent='Excel/CSV automatisch erkennen, prüfen und mit dem vorhandenen Stundenplan abgleichen.';toolbar.after(hint);
}
new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});enhance();
