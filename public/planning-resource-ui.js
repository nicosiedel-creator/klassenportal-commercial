if(location.pathname.replace(/\/$/,'')==='/kunden-admin'){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tenant=()=>document.querySelector('#tenantPick')?.value||'';
  const locale=()=>window.KP_I18N?.locale||'de';
  const q=(path,t,extra={})=>{const u=new URL(path,location.origin);u.searchParams.set('tenant_id',t);for(const[k,v]of Object.entries(extra))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));return u.pathname+u.search;};
  const TYPES=[
    ['teaching_room','Unterrichtsraum'],['computer_room','EDV-/PC-Raum'],['exam_room','Prüfungsraum'],['meeting_room','Besprechungsraum'],['workshop','Praxisraum / Werkstatt'],['lab','Labor'],['event_space','Veranstaltungsraum'],['office','Büro'],['storage','Lager'],['outdoor','Außenfläche'],['equipment','Ausstattung / Gerät'],['vehicle','Fahrzeug'],['online_room','Online-Raum'],['other','Sonstiges']
  ];
  const TYPE_LABEL=new Map(TYPES);
  const FRIENDLY={
    RESOURCE_NAME_EXISTS:'Eine Ressource mit diesem Namen ist bereits vorhanden.',RESOURCE_CAPACITY_INVALID:'Bitte eine gültige Kapazität angeben.',RESOURCE_FEATURES_INVALID:'Die Ausstattung konnte nicht verarbeitet werden.',RESOURCE_SUBTYPE_INVALID:'Bitte einen gültigen Ressourcentyp auswählen.',FIELD_REQUIRED:'Bitte alle Pflichtfelder ausfüllen.',DATE_INVALID:'Bitte gültige Datums- und Zeitangaben verwenden.',RESOURCE_BLOCK_TIME_INVALID:'Das Ende der Sperrzeit muss nach dem Beginn liegen.',TEACHER_BLOCK_TIME_INVALID:'Das Ende der Abwesenheit muss nach dem Beginn liegen.',BLACKOUT_TIME_INVALID:'Das Ende der Sperrzeit muss nach dem Beginn liegen.',FORBIDDEN_PLANNING_MANAGE:'Für die Planungsverwaltung fehlt die erforderliche Berechtigung.',UNAUTHENTICATED:'Die Sitzung ist abgelaufen. Bitte erneut anmelden.'
  };
  function friendly(code,status=0){if(FRIENDLY[code])return FRIENDLY[code];if(status===401)return FRIENDLY.UNAUTHENTICATED;if(status===403)return'Diese Aktion ist in deinem aktuellen Arbeitsbereich nicht freigegeben.';if(status===404)return'Die angeforderte Planungsinformation wurde nicht gefunden.';if(status===409)return'Die Änderung kollidiert mit bereits vorhandenen Planungsdaten.';if(status>=500)return'Der Planungsdienst ist gerade nicht verfügbar. Bitte später erneut versuchen.';return'Die Aktion konnte nicht ausgeführt werden. Bitte Eingaben prüfen.';}
  class ApiError extends Error{constructor(code,status){super(friendly(code,status));this.code=String(code||'');this.status=status;}}
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new ApiError(d.error||`HTTP_${r.status}`,r.status);return d;}
  async function post(t,path,payload){return api(q(path,t),{method:'POST',body:JSON.stringify(payload)});}
  const settled=(r,f)=>r.status==='fulfilled'?r.value:f;
  function formatDate(value,tz){const d=new Date(String(value||''));if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat(locale(),{timeZone:tz,dateStyle:'medium',timeStyle:'short'}).format(d);}
  function localToUtc(value,timeZone){if(!value)return'';const [date,time]=String(value).split('T');if(!date||!time)return'';const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number),wanted=Date.UTC(y,m-1,d,hh,mm,0);let guess=wanted;const parts=x=>{const a=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(x)),get=t=>Number(a.find(p=>p.type===t)?.value||0);return{year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second')}};for(let i=0;i<4;i++){const p=parts(guess),seen=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),delta=wanted-seen;if(!delta)break;guess+=delta;}return new Date(guess).toISOString();}
  function features(row){try{return JSON.parse(String(row.features_json||'[]')).filter(Boolean);}catch{return[];}}
  function typeOptions(selected='teaching_room'){return TYPES.map(([value,label])=>`<option value="${E(value)}"${value===selected?' selected':''}>${E(label)}</option>`).join('');}
  function options(rows,valueKey='id',labelKey='name',empty='Bitte auswählen …'){return `<option value="">${E(empty)}</option>${rows.map(x=>`<option value="${E(x[valueKey])}">${E(x[labelKey])}</option>`).join('')}`;}
  function modal(html){const w=document.createElement('div');w.className='modal-back';w.setAttribute('role','presentation');w.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="planning-title" style="width:min(1180px,97vw);max-height:94vh;overflow:auto"><div class="top"><h3 id="planning-title" style="margin:0">Ressourcen & Regeln</h3><button class="btn secondary" type="button" data-close aria-label="Schließen">×</button></div><div data-planning-status aria-live="polite"></div>${html}</section>`;document.body.append(w);const close=()=>{document.removeEventListener('keydown',onKey);w.remove();},onKey=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',onKey);w.querySelector('[data-close]').onclick=close;w.addEventListener('click',e=>{if(e.target===w)close();});w.querySelector('[data-close]').focus();return w;}
  function status(w,msg,kind='ok'){const box=w.querySelector('[data-planning-status]');box.innerHTML=`<div class="notice ${kind==='warn'?'':'ok'}" style="margin:10px 0">${E(msg)}</div>`;}
  function clearStatus(w){const box=w.querySelector('[data-planning-status]');if(box)box.textContent='';}
  function submitButton(form,busy){const b=form.querySelector('button[type="submit"]');if(!b)return;b.disabled=busy;if(busy){b.dataset.label=b.textContent;b.textContent='Wird gespeichert …';}else if(b.dataset.label){b.textContent=b.dataset.label;delete b.dataset.label;}}

  async function open(){
    const t=tenant();if(!t)return;
    const requests=await Promise.allSettled([
      api(q('/api/education/planning/resources',t)),api(q('/api/education/planning/resources/unavailability',t)),api(q('/api/education/planning/blackouts',t)),api(q('/api/education/planning/teacher-unavailability',t)),api(q('/api/education/planning/teachers',t)),api(q('/api/courses',t)),api(q('/api/tenant/settings',t)),api('/api/auth/me')
    ]);
    const rr=settled(requests[0],{resources:[]}),rb=settled(requests[1],{blocks:[]}),bb=settled(requests[2],{blackouts:[]}),uu=settled(requests[3],{blocks:[]}),tt=settled(requests[4],{teachers:[]}),cc=settled(requests[5],{courses:[]}),ss=settled(requests[6],{settings:{}}),me=settled(requests[7],{user:{}}).user||{};
    const errors=requests.filter(x=>x.status==='rejected').map(x=>friendly(x.reason?.code,x.reason?.status));
    const resources=rr.resources||[],resourceBlocks=rb.blocks||[],blackouts=bb.blackouts||[],teacherBlocks=uu.blocks||[],teachers=tt.teachers||[],courses=cc.courses||[],tz=ss.settings?.timezone||'Europe/Berlin',readOnly=Boolean(me.supportPlatformAdmin);
    const w=modal(`
      ${readOnly?'<div class="notice"><strong>Plattform-Supportansicht · nur lesend</strong><div class="muted" style="margin-top:4px">Planungsdaten können geprüft, aber nicht verändert werden. Schreibende End-to-End-Tests erfolgen mit einem echten Kundenadmin.</div></div>':''}
      <div class="grid2" style="margin-top:14px">
        <section class="card"><h3>Räume & Ressourcen</h3><form data-resource><input type="hidden" name="id"><input type="hidden" name="status" value="active"><div class="row"><label class="field">Name *<input name="name" required placeholder="z. B. M 102"></label><label class="field">Typ *<select name="resource_subtype" required>${typeOptions()}</select></label></div><div class="row"><label class="field">Standort<input name="location" placeholder="Gebäude / Etage / Bereich"></label><label class="field">Kürzel / Code<input name="code"></label><label class="field">Kapazität<input name="capacity" type="number" min="1" placeholder="Plätze"></label></div><label class="field">Ausstattung<input name="features" placeholder="z. B. Beamer, 24 PCs, Smartboard"></label><div class="toolbar"><button class="btn" type="submit"${readOnly?' disabled':''}>Ressource speichern</button><button class="btn secondary" type="button" data-resource-reset>Neu / zurücksetzen</button></div></form><div style="margin-top:12px;overflow:auto"><table><thead><tr><th>Name</th><th>Typ</th><th>Standort</th><th>Kapazität</th><th>Status / Konflikte</th><th></th></tr></thead><tbody data-resource-list></tbody></table></div></section>
        <section class="card"><h3>Ressourcen-Sperrzeiten</h3><form data-resource-block><label class="field">Ressource *<select name="resource_id" required>${options(resources)}</select></label><div class="row"><label class="field">Beginn *<input name="starts_at" type="datetime-local" required></label><label class="field">Ende *<input name="ends_at" type="datetime-local" required></label></div><label class="field">Grund<input name="reason" placeholder="z. B. Umbau, Wartung"></label><label class="field">Art<select name="source"><option value="manual">Manuell</option><option value="maintenance">Wartung</option></select></label><button class="btn" type="submit"${readOnly?' disabled':''}>Sperrzeit speichern</button></form><div data-resource-block-list style="margin-top:10px"></div></section>
        <section class="card"><h3>Ferien & allgemeine Sperrzeiten</h3><form data-blackout><label class="field">Bezeichnung *<input name="title" required></label><label class="field">Kurs / Klasse<select name="course_id"><option value="">Alle</option>${courses.map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select></label><div class="row"><label class="field">Beginn *<input name="starts_at" type="datetime-local" required></label><label class="field">Ende *<input name="ends_at" type="datetime-local" required></label></div><label class="field">Typ<select name="blackout_type"><option value="holiday">Ferien / Feiertag</option><option value="closure">Schließzeit</option><option value="exam_block">Prüfungsblock</option><option value="practice_block">Praxisblock</option><option value="maintenance">Wartung</option><option value="other">Sonstiges</option></select></label><button class="btn" type="submit"${readOnly?' disabled':''}>Sperrzeit speichern</button></form><div data-blackout-list style="margin-top:10px"></div></section>
        <section class="card"><h3>Dozenten-Abwesenheit</h3><form data-absence><label class="field">Dozent/in *<select name="teacher_id" required>${options(teachers)}</select></label><div class="row"><label class="field">Beginn *<input name="starts_at" type="datetime-local" required></label><label class="field">Ende *<input name="ends_at" type="datetime-local" required></label></div><label class="field">Grund<input name="reason"></label><label class="field">Art<select name="source"><option value="manual">Manuell</option><option value="sickness">Krankheit</option><option value="vacation">Urlaub</option><option value="training">Fortbildung</option><option value="external">Extern</option></select></label><button class="btn" type="submit"${readOnly?' disabled':''}>Abwesenheit speichern</button></form><div data-absence-list style="margin-top:10px"></div></section>
        <section class="card"><h3>Kursregeln</h3><form data-rules><label class="field">Kurs / Klasse *<select name="course_id" required>${options(courses)}</select></label><div class="row"><label class="field">Frühester Beginn<input name="earliest_start" type="time"></label><label class="field">Spätestes Ende<input name="latest_end" type="time"></label></div><div class="row"><label class="field">Max. Minuten/Tag<input name="max_daily_minutes" type="number" min="0"></label><label class="field">Max. am Stück<input name="max_consecutive_minutes" type="number" min="0"></label><label class="field">Mindestpause<input name="min_break_minutes" type="number" min="0"></label></div><label><input type="checkbox" name="allow_saturday"> Samstag erlauben</label> <label><input type="checkbox" name="allow_sunday"> Sonntag erlauben</label><div><button class="btn" type="submit"${readOnly?' disabled':''}>Kursregeln speichern</button></div></form></section>
        <section class="card"><h3>Automatische Planungsvorschläge</h3><form data-suggestion><label class="field">Kurs / Klasse *<select name="course_id" required>${options(courses)}</select></label><div class="row"><label class="field">Beginn *<input name="starts_at" type="datetime-local" required></label><label class="field">Ende *<input name="ends_at" type="datetime-local" required></label></div><button class="btn secondary" type="submit">Passende Dozenten & Räume suchen</button></form><div data-suggestions style="margin-top:10px"></div></section>
        <section class="card"><h3>Stundenplan automatisch entwerfen</h3><div class="notice"><strong>Erzeugt nur einen Entwurf</strong><div class="muted" style="margin-top:4px">Es wird nichts veröffentlicht und nichts im laufenden Betrieb verändert. Grundlage sind die hinterlegten Kursregeln. Wo keine freie Dozentin, kein freier Dozent oder kein freier Raum gefunden wird, entsteht bewusst kein Termin – die Lücke wird benannt.</div></div><form data-autofill style="margin-top:12px"><label class="field">Klassen / Kurse <span class="muted">nichts ausgewählt = alle mit Kursregeln</span><select name="course_ids" multiple size="6">${courses.map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select></label><div class="row"><label class="field">Von *<input name="starts_on" type="date" required></label><label class="field">Bis *<input name="ends_on" type="date" required></label></div><button class="btn" type="submit"${readOnly?' disabled':''}>Entwurf erzeugen</button></form><div data-autofill-result style="margin-top:10px"></div></section>
      </div>`);
    if(errors.length)status(w,`Einzelne Bereiche konnten nicht geladen werden: ${errors.join(' ')}`,'warn');

    const resourceList=w.querySelector('[data-resource-list]');
    function renderResources(){resourceList.innerHTML=resources.length?resources.map(r=>`<tr data-resource-row="${E(r.id)}"><td><strong>${E(r.name)}</strong>${features(r).length?`<div class="muted">${E(features(r).join(', '))}</div>`:''}</td><td>${E(TYPE_LABEL.get(r.resource_subtype)||TYPE_LABEL.get(r.resource_type)||r.resource_subtype||r.resource_type||'')}</td><td>${E(r.location||'—')}</td><td>${r.capacity==null?'—':E(r.capacity)}</td><td>${E(r.status||'active')} · ${E(r.future_blocks||0)} Sperre(n) · ${E(r.future_reservations||0)} Reservierung(en)</td><td><div class="toolbar"><button class="btn secondary" type="button" data-edit-resource="${E(r.id)}">Bearbeiten</button>${r.status==='active'?`<button class="btn secondary" type="button" data-disable-resource="${E(r.id)}"${readOnly?' disabled':''}>Deaktivieren</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6" class="muted">Noch keine Ressourcen.</td></tr>';}
    renderResources();
    w.querySelector('[data-resource-block-list]').innerHTML=resourceBlocks.length?resourceBlocks.map(b=>`<div class="item"><strong>${E(b.resource_name||'Ressource')}</strong><div class="muted">${E(formatDate(b.starts_at,tz))} – ${E(formatDate(b.ends_at,tz))}${b.reason?` · ${E(b.reason)}`:''}</div></div>`).join(''):'<div class="muted">Keine Ressourcensperren.</div>';
    w.querySelector('[data-blackout-list]').innerHTML=blackouts.length?blackouts.map(b=>`<div class="item"><strong>${E(b.title||'Sperrzeit')}</strong><div class="muted">${E(b.course_name||'Alle Kurse')} · ${E(formatDate(b.starts_at,tz))} – ${E(formatDate(b.ends_at,tz))}</div></div>`).join(''):'<div class="muted">Keine allgemeinen Sperrzeiten.</div>';
    w.querySelector('[data-absence-list]').innerHTML=teacherBlocks.length?teacherBlocks.map(b=>`<div class="item"><strong>${E(b.teacher_name||'Dozent/in')}</strong><div class="muted">${E(formatDate(b.starts_at,tz))} – ${E(formatDate(b.ends_at,tz))}${b.reason?` · ${E(b.reason)}`:''}</div></div>`).join(''):'<div class="muted">Keine Abwesenheiten.</div>';

    const reload=()=>{w.remove();void open();};
    const resourceForm=w.querySelector('[data-resource]');
    w.querySelector('[data-resource-reset]').onclick=()=>{resourceForm.reset();resourceForm.elements.id.value='';resourceForm.elements.status.value='active';resourceForm.elements.resource_subtype.value='teaching_room';resourceForm.elements.capacity.min='1';clearStatus(w);};
    resourceForm.elements.resource_subtype.onchange=()=>{const kind=resourceForm.elements.resource_subtype.value;resourceForm.elements.capacity.min=['equipment','vehicle','online_room','other'].includes(kind)?'0':'1';};
    resourceForm.onsubmit=async e=>{e.preventDefault();if(readOnly)return;submitButton(resourceForm,true);clearStatus(w);const fd=new FormData(resourceForm),featureText=String(fd.get('features')||'');try{await post(t,'/api/education/planning/resources',{id:String(fd.get('id')||'')||undefined,name:String(fd.get('name')||''),resource_subtype:String(fd.get('resource_subtype')||'teaching_room'),location:String(fd.get('location')||''),code:String(fd.get('code')||''),capacity:fd.get('capacity')===''?null:Number(fd.get('capacity')),features:featureText.split(',').map(x=>x.trim()).filter(Boolean),status:String(fd.get('status')||'active')});status(w,'Ressource gespeichert.');setTimeout(reload,250);}catch(x){status(w,friendly(x.code,x.status),'warn');submitButton(resourceForm,false);}};
    resourceList.addEventListener('click',async e=>{const edit=e.target.closest('[data-edit-resource]'),disable=e.target.closest('[data-disable-resource]');if(edit){const r=resources.find(x=>String(x.id)===edit.dataset.editResource);if(!r)return;resourceForm.elements.id.value=r.id;resourceForm.elements.name.value=r.name||'';resourceForm.elements.resource_subtype.value=r.resource_subtype||({room:'teaching_room',equipment:'equipment',vehicle:'vehicle',online_room:'online_room',other:'other'}[r.resource_type]||'teaching_room');resourceForm.elements.location.value=r.location||'';resourceForm.elements.code.value=r.code||'';resourceForm.elements.capacity.value=r.capacity??'';resourceForm.elements.features.value=features(r).join(', ');resourceForm.elements.status.value=r.status||'active';resourceForm.scrollIntoView({behavior:'smooth',block:'start'});return;}if(disable&&!readOnly){const r=resources.find(x=>String(x.id)===disable.dataset.disableResource);if(!r)return;disable.disabled=true;try{await post(t,'/api/education/planning/resources',{id:r.id,name:r.name,resource_subtype:r.resource_subtype||({room:'teaching_room',equipment:'equipment',vehicle:'vehicle',online_room:'online_room',other:'other'}[r.resource_type]||'teaching_room'),location:r.location||'',code:r.code||'',capacity:r.capacity,features:features(r),status:'inactive'});reload();}catch(x){disable.disabled=false;status(w,friendly(x.code,x.status),'warn');}}});

    const blockForm=w.querySelector('[data-resource-block]');blockForm.onsubmit=async e=>{e.preventDefault();if(readOnly)return;submitButton(blockForm,true);const fd=new FormData(blockForm);try{await post(t,'/api/education/planning/resources/unavailability',{resource_id:String(fd.get('resource_id')||''),starts_at:localToUtc(fd.get('starts_at'),tz),ends_at:localToUtc(fd.get('ends_at'),tz),reason:String(fd.get('reason')||''),source:String(fd.get('source')||'manual')});reload();}catch(x){submitButton(blockForm,false);status(w,friendly(x.code,x.status),'warn');}};
    const blackoutForm=w.querySelector('[data-blackout]');blackoutForm.onsubmit=async e=>{e.preventDefault();if(readOnly)return;submitButton(blackoutForm,true);const fd=new FormData(blackoutForm);try{await post(t,'/api/education/planning/blackouts',{title:String(fd.get('title')||''),course_id:String(fd.get('course_id')||'')||null,starts_at:localToUtc(fd.get('starts_at'),tz),ends_at:localToUtc(fd.get('ends_at'),tz),blackout_type:String(fd.get('blackout_type')||'closure'),blocks_teaching:true});reload();}catch(x){submitButton(blackoutForm,false);status(w,friendly(x.code,x.status),'warn');}};
    const absenceForm=w.querySelector('[data-absence]');absenceForm.onsubmit=async e=>{e.preventDefault();if(readOnly)return;submitButton(absenceForm,true);const fd=new FormData(absenceForm);try{const d=await post(t,'/api/education/planning/teacher-unavailability',{teacher_id:String(fd.get('teacher_id')||''),starts_at:localToUtc(fd.get('starts_at'),tz),ends_at:localToUtc(fd.get('ends_at'),tz),reason:String(fd.get('reason')||''),source:String(fd.get('source')||'manual')});status(w,`${Number(d.substitution_cases_created||0)} Vertretungsfall/-fälle automatisch angelegt.`);setTimeout(reload,350);}catch(x){submitButton(absenceForm,false);status(w,friendly(x.code,x.status),'warn');}};
    const rulesForm=w.querySelector('[data-rules]');rulesForm.onsubmit=async e=>{e.preventDefault();if(readOnly)return;submitButton(rulesForm,true);const fd=new FormData(rulesForm),course=String(fd.get('course_id')||'');try{await api(q(`/api/education/planning/courses/${encodeURIComponent(course)}/rules`,t),{method:'PUT',body:JSON.stringify({earliest_start:String(fd.get('earliest_start')||'')||null,latest_end:String(fd.get('latest_end')||'')||null,max_daily_minutes:fd.get('max_daily_minutes')===''?null:Number(fd.get('max_daily_minutes')),max_consecutive_minutes:fd.get('max_consecutive_minutes')===''?null:Number(fd.get('max_consecutive_minutes')),min_break_minutes:fd.get('min_break_minutes')===''?null:Number(fd.get('min_break_minutes')),allow_saturday:fd.get('allow_saturday')==='on',allow_sunday:fd.get('allow_sunday')==='on'})});status(w,'Kursregeln gespeichert.');}catch(x){status(w,friendly(x.code,x.status),'warn');}finally{submitButton(rulesForm,false);}};
    rulesForm.elements.course_id.onchange=async()=>{const course=rulesForm.elements.course_id.value;if(!course)return;try{const d=await api(q(`/api/education/planning/courses/${encodeURIComponent(course)}/rules`,t)),r=d.rules||{};for(const k of ['earliest_start','latest_end','max_daily_minutes','max_consecutive_minutes','min_break_minutes'])rulesForm.elements[k].value=r[k]??'';rulesForm.elements.allow_saturday.checked=Boolean(Number(r.allow_saturday));rulesForm.elements.allow_sunday.checked=Boolean(Number(r.allow_sunday));}catch(x){status(w,friendly(x.code,x.status),'warn');}};
    const suggestionForm=w.querySelector('[data-suggestion]');suggestionForm.onsubmit=async e=>{e.preventDefault();const fd=new FormData(suggestionForm),out=w.querySelector('[data-suggestions]'),course=String(fd.get('course_id')||''),starts=localToUtc(fd.get('starts_at'),tz),ends=localToUtc(fd.get('ends_at'),tz);out.textContent='Vorschläge werden berechnet …';try{const d=await api(q('/api/education/planning/suggestions',t,{course_id:course,starts_at:starts,ends_at:ends}));out.innerHTML=`<div class="notice"><strong>${E(d.participant_count||0)} Teilnehmende berücksichtigt</strong><div class="muted">Nur verfügbare und passende Optionen werden vorgeschlagen.</div></div><h4>Dozent/in wählen</h4><div class="toolbar">${(d.teachers||[]).map(x=>`<button type="button" class="pill" data-pick="teacher" data-teacher-id="${E(x.id)}" data-label="${E(x.name)}" aria-pressed="false">${E(x.name)}${Number(x.qualified)?' · fachqualifiziert':''}</button>`).join('')||'<span class="muted">Kein passender Dozent frei.</span>'}</div><h4>Raum wählen</h4><div class="toolbar">${(d.rooms||[]).map(x=>`<button type="button" class="pill" data-pick="room" data-resource-id="${E(x.id)}" data-label="${E(x.name)}" aria-pressed="false">${E(x.name)}${x.capacity!=null?` · ${E(x.capacity)} Plätze`:''}</button>`).join('')||'<span class="muted">Kein passender Raum frei.</span>'}</div><div class="toolbar" style="margin-top:12px"><button type="button" class="btn" data-apply-suggestion disabled>In Stundenplanentwurf übernehmen</button><span class="muted" data-apply-hint>Wähle Dozent/in und Raum.</span></div><div data-apply-result style="margin-top:10px"></div>`;bindeUebernahme(out,{course,starts,ends});}catch(x){out.innerHTML=`<div class="notice">${E(friendly(x.code,x.status))}</div>`;}};

    const autofillForm=w.querySelector('[data-autofill]');autofillForm.onsubmit=async e=>{
      e.preventDefault();if(readOnly)return;
      const fd=new FormData(autofillForm),ziel=w.querySelector('[data-autofill-result]'),
        von=String(fd.get('starts_on')||''),bis=String(fd.get('ends_on')||''),
        kurse=fd.getAll('course_ids').map(String).filter(Boolean);
      if(!von||!bis||von>bis){ziel.innerHTML='<div class="notice">Bitte einen gültigen Zeitraum wählen: das Ende darf nicht vor dem Beginn liegen.</div>';return;}
      submitButton(autofillForm,true);ziel.textContent='Entwurf wird erzeugt …';
      try{
        const planId=await entwurfFuer(t,`${von}T00:00:00.000Z`,`${bis}T23:59:59.000Z`);
        if(!planId)throw new ApiError('TIMETABLE_PLAN_NOT_FOUND',404);
        const r=await api(q(`/api/education/timetable-plans/${encodeURIComponent(planId)}/autofill`,t),{method:'POST',body:JSON.stringify({course_ids:kurse})});
        const geprueft=await api(q(`/api/education/timetable-plans/${encodeURIComponent(planId)}/validate`,t),{method:'POST',body:'{}'});
        ziel.innerHTML=entwurfBericht(r,geprueft);
        bindeFreigabe(ziel,planId);
      }catch(x){ziel.innerHTML=`<div class="notice">${E(friendly(x.code,x.status))}</div>`;}
      submitButton(autofillForm,false);
    };
  }

  // Die Vorschlaege waren bisher reine Anzeige: Namen, die wie Schaltflaechen aussahen, aber
  // keine waren. Wer einen passenden Dozenten und Raum gefunden hatte, musste die Stunde
  // anschliessend von Hand woanders anlegen - die Oberflaeche versprach etwas, was sie nicht
  // einloeste. Gemeldet aus dem Kundenbetrieb.
  //
  // Uebernommen wird in einen ENTWURF, nicht direkt in den laufenden Betrieb: Entwurf -> pruefen
  // -> veroeffentlichen ist der Weg, den das Portal ohnehin kennt, und er laesst dem Kunden die
  // Bestaetigung. Ein bestehender Entwurf desselben Zeitraums wird weiterverwendet, damit nicht
  // bei jedem Vorschlag ein neuer entsteht.
  async function entwurfFuer(tenant,starts,ends){
    const tag=v=>String(v||'').slice(0,10);
    const vorhandene=(await api(q('/api/education/timetable-plans',tenant))).plans||[];
    const passend=vorhandene.find(x=>String(x.status)==='draft'&&tag(x.starts_on)<=tag(starts)&&tag(x.ends_on)>=tag(ends));
    if(passend)return passend.id;
    const neu=await api(q('/api/education/timetable-plans',tenant),{method:'POST',body:JSON.stringify({
      name:`Planung ab ${tag(starts)}`,starts_on:tag(starts),ends_on:tag(ends),status:'draft'})});
    return neu.plan?.id||neu.id;
  }
  const LUECKEN_GRUND={NO_TEACHER_AVAILABLE:'keine freie Dozentin / kein freier Dozent',NO_ROOM_AVAILABLE:'kein freier Raum',LESSON_EXCEEDS_DAY:'die Kursregel ergibt keine gültige Unterrichtszeit',LESSON_AFTER_LATEST_END:'die Unterrichtszeit läge nach dem gewünschten Ende',NO_COURSE_RULES:'für diese Klasse sind keine Kursregeln hinterlegt',COURSE_NOT_FOUND:'diese Klasse wurde nicht gefunden'};
  function entwurfBericht(r,geprueft){
    const fehler=Number(geprueft.errors||0),warn=Number(geprueft.warnings||0),offen=Number(r.gap_count||0);
    const proKurs=(r.courses||[]).map(c=>`<li>${E(c.course_name)}: ${E(c.created)} Termin(e)</li>`).join('');
    const luecken=(r.gaps||[]).slice(0,50).map(g=>`<li>${E(g.course_name)} · ${E(g.date)} · ${E(LUECKEN_GRUND[g.reason]||g.reason)}</li>`).join('');
    return `<div class="notice ${fehler?'':'ok'}"><strong>${E(Number(r.created||0))} Termin(e) im Entwurf angelegt.</strong>`
      +`<div class="muted">${fehler?`${fehler} Konflikt(e) und `:''}${warn} Hinweis(e) aus der Prüfung. Nichts ist veröffentlicht.</div></div>`
      +(proKurs?`<h4>Je Klasse / Kurs</h4><ul>${proKurs}</ul>`:'')
      +(offen?`<h4>${offen} offene Lücke(n)</h4><ul>${luecken}</ul>${offen>50?'<div class="muted">Es werden die ersten 50 gezeigt.</div>':''}`:'<div class="muted">Keine offenen Lücken.</div>')
      +(r.limit_reached?'<div class="notice">Die Obergrenze je Lauf wurde erreicht. Bitte den Zeitraum verkleinern und erneut ausführen.</div>':'')
      +`<div class="toolbar" style="margin-top:12px"><button type="button" class="btn" data-release${fehler?' disabled':''}>Entwurf verbindlich veröffentlichen</button>`
      +`<span class="muted">${fehler?'Erst die Konflikte klären – mit Konflikten veröffentlicht der Server nicht.':'Erst nach Deiner Bestätigung wird veröffentlicht.'}</span></div>`
      +`<div data-release-result style="margin-top:10px"></div>`;
  }
  function bindeFreigabe(ziel,planId){
    const b=ziel.querySelector('[data-release]');if(!b||b.disabled)return;
    const out=ziel.querySelector('[data-release-result]');
    b.onclick=async()=>{
      if(!confirm('Der Entwurf wird verbindlich veröffentlicht und ist danach für alle sichtbar. Fortfahren?'))return;
      b.disabled=true;out.textContent='Wird veröffentlicht …';
      try{const r=await api(q(`/api/education/timetable-plans/${encodeURIComponent(planId)}/publish`,t),{method:'POST',body:'{}'});
        out.innerHTML=`<div class="notice ok"><strong>Veröffentlicht.</strong><div class="muted">${E(Number(r.published||0))} Termin(e) sind jetzt im Betrieb sichtbar.</div></div>`;
      }catch(x){out.innerHTML=`<div class="notice">${E(friendly(x.code,x.status))}</div>`;b.disabled=false;}
    };
  }
  function bindeUebernahme(out,ctx){
    const wahl={teacher:null,room:null};
    const knopf=out.querySelector('[data-apply-suggestion]'),hinweis=out.querySelector('[data-apply-hint]'),ergebnis=out.querySelector('[data-apply-result]');
    const auffrischen=()=>{const fertig=Boolean(wahl.teacher&&wahl.room);knopf.disabled=!fertig;
      hinweis.textContent=fertig?`${wahl.teacher.label} · ${wahl.room.label}`:'Wähle Dozent/in und Raum.';};
    out.querySelectorAll('[data-pick]').forEach(b=>{b.onclick=()=>{
      const art=b.dataset.pick;
      out.querySelectorAll(`[data-pick="${art}"]`).forEach(x=>x.setAttribute('aria-pressed','false'));
      b.setAttribute('aria-pressed','true');
      wahl[art]={id:art==='teacher'?b.dataset.teacherId:b.dataset.resourceId,label:b.dataset.label};auffrischen();};});
    knopf.onclick=async()=>{
      knopf.disabled=true;ergebnis.textContent='Wird in den Entwurf übernommen …';
      try{
        const tenant=t,planId=await entwurfFuer(tenant,ctx.starts,ctx.ends);
        if(!planId)throw new Error('TIMETABLE_PLAN_NOT_FOUND');
        await api(q(`/api/education/timetable-plans/${encodeURIComponent(planId)}/entries`,tenant),{method:'POST',
          body:JSON.stringify({course_id:ctx.course,teacher_id:wahl.teacher.id,room:wahl.room.label,
            starts_at:ctx.starts,ends_at:ctx.ends,activity_type:'classroom'})});
        const geprueft=await api(q(`/api/education/timetable-plans/${encodeURIComponent(planId)}/validate`,tenant),{method:'POST',body:'{}'});
        const fehler=Number(geprueft.errors||0),warnungen=Number(geprueft.warnings||0);
        ergebnis.innerHTML=`<div class="notice ${fehler?'':'ok'}"><strong>In den Entwurf übernommen.</strong>`
          +`<div class="muted">${fehler?`${fehler} Konflikt(e) und `:''}${warnungen} Hinweis(e). `
          +`Nichts ist im laufenden Betrieb verändert – der Entwurf wird erst nach Deiner Freigabe veröffentlicht.</div></div>`;
      }catch(x){ergebnis.innerHTML=`<div class="notice">${E(friendly(x.code,x.status))}</div>`;knopf.disabled=false;}
    };
    auffrischen();
  }

  function enhance(){const side=document.querySelector('.side');if(!side||side.querySelector('#planning-resource-nav'))return;const b=document.createElement('button');b.id='planning-resource-nav';b.className='nav';b.textContent='Ressourcen & Regeln';b.onclick=()=>void open();const spacer=side.querySelector('.spacer');side.insertBefore(b,spacer||null);}
  window.addEventListener('kp:customer-view-changed',enhance);window.addEventListener('kp:localechange',enhance);enhance();
}
