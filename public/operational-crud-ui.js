const OP_ROOT=document.querySelector('#app');
const opEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opTenant=()=>document.querySelector('#tenantPick')?.value||localStorage.getItem('kp_tenant')||'';
async function opApi(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
function opModal(title,body){const back=document.createElement('div');back.className='modal-back';back.innerHTML=`<div class="modal" style="width:min(1050px,96vw);max-height:92vh;overflow:auto"><div class="top"><h3 style="margin:0">${opEsc(title)}</h3><button type="button" class="btn secondary op-close">×</button></div><div class="op-body" style="margin-top:14px">${body}</div></div>`;document.body.append(back);const close=()=>back.remove();back.querySelector('.op-close').onclick=close;back.addEventListener('click',e=>{if(e.target===back)close()});return back;}
function opForm(title,html,onSubmit){const back=opModal(title,`<form class="op-form">${html}<div class="toolbar" style="margin-top:14px"><button class="btn">Speichern</button><span class="muted op-status"></span></div></form>`);back.querySelector('.op-form').onsubmit=async e=>{e.preventDefault();const status=back.querySelector('.op-status'),btn=e.currentTarget.querySelector('button');btn.disabled=true;status.textContent='Speichert …';try{await onSubmit(new FormData(e.currentTarget));back.remove();setTimeout(()=>location.reload(),50);}catch(x){status.textContent=(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(x):x.message);btn.disabled=false;}};return back;}
async function opCourses(){const t=opTenant();if(!t)return[];return (await opApi(`/api/courses?tenant_id=${encodeURIComponent(t)}`)).courses||[];}
function opOptions(courses,value,allowGlobal=false){return `${allowGlobal?`<option value="" ${!value?'selected':''}>Alle Klassen/Kurse</option>`:''}${courses.map(c=>`<option value="${opEsc(c.id)}" ${String(c.id)===String(value||'')?'selected':''}>${opEsc(c.name)}</option>`).join('')}`;}
function opDateTime(v){if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).slice(0,16);const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;}
function opDate(v){return v?String(v).slice(0,10):'';}
function opWhen(v){const d=new Date(v);return Number.isNaN(d.getTime())?String(v||''):d.toLocaleString('de-DE');}
function opCopy(value,button){navigator.clipboard?.writeText(value).then(()=>{const old=button.textContent;button.textContent='Kopiert';setTimeout(()=>button.textContent=old,1200)}).catch(()=>prompt('Kopieren:',value));}

async function openCourseManager(){
  const tenant=opTenant(),courses=await opCourses();const back=opModal('Klassen/Kurse verwalten',`<div class="table-wrap"><table><tr><th>Name</th><th>Code</th><th>Zugriff</th><th>Status</th><th></th></tr>${courses.map(c=>`<tr><td>${opEsc(c.name)}</td><td>${opEsc(c.code)}</td><td>${opEsc(c.access_mode)}</td><td>${Number(c.is_active)?'Aktiv':'Deaktiviert'}</td><td><button class="btn secondary op-course-edit" data-id="${opEsc(c.id)}">Bearbeiten</button></td></tr>`).join('')}</table></div>`);
  back.querySelectorAll('.op-course-edit').forEach(b=>b.onclick=()=>{const c=courses.find(x=>x.id===b.dataset.id);if(!c)return;back.remove();opForm('Klasse/Kurs bearbeiten',`<label class="field">Name<input name="name" value="${opEsc(c.name)}" required></label><div class="row"><label class="field">Code<input name="code" value="${opEsc(c.code)}" required></label><label class="field">Zugriff<select name="access_mode"><option value="login" ${c.access_mode==='login'?'selected':''}>Login</option><option value="public" ${c.access_mode==='public'?'selected':''}>Öffentlich</option><option value="link_code" ${c.access_mode==='link_code'?'selected':''}>Link/Code</option><option value="hybrid" ${c.access_mode==='hybrid'?'selected':''}>Hybrid</option></select></label></div><div class="row"><label class="field">Start<input type="date" name="start_date" value="${opEsc(opDate(c.start_date))}"></label><label class="field">Ende<input type="date" name="end_date" value="${opEsc(opDate(c.end_date))}"></label></div><label class="field">Neuer Zugangscode <span class="muted">(nur ausfüllen, wenn er geändert werden soll; mindestens 6 Zeichen)</span><input name="access_code" minlength="6"></label><label class="field"><span><input type="checkbox" name="is_active" ${Number(c.is_active)?'checked':''}> Klasse/Kurs aktiv</span></label>`,async f=>{const data=Object.fromEntries(f);data.is_active=f.has('is_active');if(!data.access_code)delete data.access_code;await opApi(`/api/courses/${encodeURIComponent(c.id)}?tenant_id=${encodeURIComponent(tenant)}`,{method:'PATCH',body:JSON.stringify(data)});});});
}

function showTemporaryPassword(result){
  const back=opModal('Temporäres Passwort',`<div class="notice ok"><strong>${opEsc(result.display_name||result.email)}</strong><p>Das bisherige Passwort wurde ungültig gemacht und alle bestehenden Sitzungen wurden beendet. Beim nächsten Login muss ein neues Passwort vergeben werden.</p><label class="field">Temporäres Passwort<div style="display:flex;gap:8px"><input id="op-temp-password" value="${opEsc(result.temporary_password)}" readonly style="flex:1"><button type="button" class="btn" id="op-copy-password">Kopieren</button></div></label><p class="muted">Dieses Passwort wird nur jetzt angezeigt. Gib es ausschließlich an die betreffende Person weiter.</p></div>`);
  back.querySelector('#op-copy-password').onclick=e=>opCopy(result.temporary_password,e.currentTarget);
}
async function openMembershipManager(){
  const tenant=opTenant(),[users,courses,me]=await Promise.all([
    opApi(`/api/tenant/users?tenant_id=${encodeURIComponent(tenant)}`).then(x=>x.users||[]),
    opCourses(),
    opApi('/api/auth/me').then(x=>x.user||null).catch(()=>null),
  ]);
  const back=opModal('Benutzer & Rollen verwalten',`<div class="table-wrap"><table><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Klasse/Kurs</th><th></th></tr>${users.map(u=>`<tr><td>${opEsc(u.display_name)}</td><td>${opEsc(u.email)}</td><td>${opEsc(u.role)}</td><td>${opEsc(courses.find(c=>c.id===u.course_id)?.name||'Organisation')}</td><td style="white-space:nowrap"><button class="btn secondary op-member-edit" data-id="${opEsc(u.membership_id||'')}">Bearbeiten</button> <button class="btn secondary op-user-reset" data-user="${opEsc(u.id)}">Passwort neu</button> <button class="btn secondary op-member-delete" data-id="${opEsc(u.membership_id||'')}">Entfernen</button></td></tr>`).join('')}</table></div><p class="muted">„Entfernen“ löscht nur die Zuordnung zu diesem Kunden bzw. dieser Klasse, nicht das Benutzerkonto bei anderen Mandanten.</p>`);
  // Zwei Dinge waren hier nur ueber eine Fehlermeldung zu erfahren, und in einem frisch
  // eingerichteten Mandanten scheiterte dadurch jede denkbare Eingabe:
  //
  // 1. Wer sich selbst bearbeitet, kann sein eigenes Kunden-Admin-Recht nicht abgeben
  //    (CANNOT_REMOVE_OWN_TENANT_ADMIN) - richtig so, sonst sperrt man sich aus. In einem neuen
  //    Mandanten ist man aber der einzige Benutzer, also fuehrte jeder Versuch dorthin.
  // 2. Jede Rolle ausser Kunden-Admin braucht eine Klasse (COURSE_ID_REQUIRED). Die Klassenaus-
  //    wahl stand aber auf "Organisation" - also scheiterte auch das.
  //
  // Beides steht jetzt im Dialog, bevor etwas abgeschickt wird.
  back.querySelectorAll('.op-member-edit').forEach(b=>b.onclick=()=>{const u=users.find(x=>x.membership_id===b.dataset.id);if(!u)return;const self=String(u.id)===String(me?.id||'');back.remove();openMemberForm(u,self,courses,tenant);});
  function openMemberForm(u,self,courses,tenant){
    const roles=[['tenant_admin','Kunden-Admin'],['class_admin','Klassenverantwortliche/r'],['participant','Teilnehmer/in'],['guest','Gast']];
    const selbstHinweis=self&&u.role==='tenant_admin'
      ? '<div class="notice"><strong>Das ist dein eigenes Konto.</strong><div class="muted" style="margin-top:4px">Dein Kunden-Admin-Recht kannst du dir nicht selbst entziehen – sonst sperrst du dich aus deinem eigenen Portal aus. Lege zuerst eine zweite Person als Kunden-Admin an; danach kann diese deine Rolle ändern.</div></div>'
      : '';
    const keineKlassen=!courses.length
      ? '<div class="notice"><strong>Es gibt noch keine Klasse.</strong><div class="muted" style="margin-top:4px">Klassenverantwortliche, Teilnehmer und Gäste brauchen eine Klasse. Lege zuerst unter „Klassen/Kurse“ eine an – oder lies sie unter „Bildungsträger importieren“ ein.</div></div>'
      : '';
    const form=opForm('Rolle/Zuweisung bearbeiten',
      `<div class="notice"><strong>${opEsc(u.display_name)}</strong><div class="muted">${opEsc(u.email)}</div></div>${selbstHinweis}${keineKlassen}`
      +`<div class="row"><label class="field">Rolle<select name="role" ${self&&u.role==='tenant_admin'?'disabled':''}>`
      +roles.map(([v,l])=>`<option value="${v}" ${u.role===v?'selected':''} ${self&&u.role==='tenant_admin'&&v!=='tenant_admin'?'disabled':''}>${opEsc(l)}</option>`).join('')
      +`</select></label><label class="field">Klasse/Kurs<select name="course_id" data-member-course><option value="">Ganze Organisation (nur für Kunden-Admin)</option>${opOptions(courses,u.course_id)}</select></label></div>`
      +`<div class="muted" data-member-hint style="margin-top:6px"></div>`,
      f=>opApi(`/api/tenant/memberships/${encodeURIComponent(u.membership_id)}?tenant_id=${encodeURIComponent(tenant)}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(f))}));
    // Die Klassenauswahl haengt an der Rolle. Wer "Teilnehmer/in" waehlt und die Klasse auf
    // "Ganze Organisation" stehen laesst, bekam bisher erst nach dem Absenden COURSE_ID_REQUIRED.
    const rolle=form?.querySelector('[name="role"]'),klasse=form?.querySelector('[data-member-course]'),hinweis=form?.querySelector('[data-member-hint]'),senden=form?.querySelector('.op-form button.btn');
    const abgleichen=()=>{
      if(!rolle||!klasse)return;
      const braucht=rolle.value!=='tenant_admin';
      klasse.disabled=!braucht;
      if(!braucht)klasse.value='';
      else if(!klasse.value&&courses.length)klasse.value=courses[0].id;
      const fehlt=braucht&&!klasse.value;
      if(hinweis)hinweis.textContent=braucht
        ? (fehlt?'Für diese Rolle wird eine Klasse benötigt.':'Diese Rolle gilt für die gewählte Klasse.')
        : 'Kunden-Admins gelten für die ganze Organisation, nicht für eine einzelne Klasse.';
      if(senden)senden.disabled=fehlt||(self&&u.role==='tenant_admin'&&rolle.value!=='tenant_admin');
    };
    rolle?.addEventListener('change',abgleichen);klasse?.addEventListener('change',abgleichen);abgleichen();
  }
  back.querySelectorAll('.op-user-reset').forEach(b=>b.onclick=async()=>{const u=users.find(x=>String(x.id)===String(b.dataset.user));if(!u||!confirm(`Passwort für ${u.display_name} wirklich zurücksetzen? Alle bestehenden Anmeldungen dieser Person werden beendet.`))return;b.disabled=true;try{const r=await opApi(`/api/tenant/users/${encodeURIComponent(u.id)}/reset-password?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',body:'{}'});back.remove();showTemporaryPassword(r);}catch(x){alert(x.message);b.disabled=false;}});
  back.querySelectorAll('.op-member-delete').forEach(b=>b.onclick=async()=>{const u=users.find(x=>x.membership_id===b.dataset.id);if(!u||!confirm(`Zuordnung von ${u.display_name} wirklich entfernen?`))return;try{await opApi(`/api/tenant/memberships/${encodeURIComponent(u.membership_id)}?tenant_id=${encodeURIComponent(tenant)}`,{method:'DELETE'});back.remove();location.reload();}catch(x){alert(x.message);}});
}

const opActions={
  'membership.created':'Benutzer/Rolle angelegt','membership.updated':'Rolle/Zuweisung geändert','membership.deleted':'Rolle/Zuweisung entfernt','user.password_reset':'Passwort zurückgesetzt',
  'course.created':'Klasse/Kurs angelegt','course.updated':'Klasse/Kurs geändert','announcements.created':'Meldung angelegt','announcements.updated':'Meldung geändert','announcements.deleted':'Meldung gelöscht',
  'homework.created':'Aufgabe angelegt','homework.updated':'Aufgabe geändert','homework.deleted':'Aufgabe gelöscht','appointments.created':'Termin angelegt','appointments.updated':'Termin geändert','appointments.deleted':'Termin gelöscht',
  'links.created':'Link angelegt','links.updated':'Link geändert','links.deleted':'Link gelöscht','lessons.created':'Unterricht angelegt','lessons.updated':'Unterricht geändert','lessons.deleted':'Unterricht gelöscht',
  'exams.created':'Prüfung angelegt','exams.updated':'Prüfung geändert','exams.deleted':'Prüfung gelöscht','learning_material.created':'Lernmaterial hochgeladen','learning_material.updated':'Lernmaterial geändert','learning_material.deleted':'Lernmaterial gelöscht',
  'settings.updated':'Branding/Einstellungen geändert','feature.updated':'Modul geändert','timetable.applied':'Stundenplan übernommen'
};
async function openAuditLog(){
  const tenant=opTenant(),[data,courses]=await Promise.all([opApi(`/api/tenant/audit?tenant_id=${encodeURIComponent(tenant)}&limit=200`),opCourses()]),events=data.events||[];
  opModal('Aktivitäten',events.length?`<div class="table-wrap"><table><tr><th>Zeit</th><th>Aktion</th><th>Person</th><th>Klasse/Kurs</th></tr>${events.map(e=>`<tr><td>${opEsc(opWhen(e.created_at))}</td><td><strong>${opEsc(opActions[e.action]||e.action)}</strong>${e.entity_type?`<div class="muted">${opEsc(e.entity_type)}</div>`:''}</td><td>${opEsc(e.actor_name||'System')}</td><td>${opEsc(courses.find(c=>c.id===e.course_id)?.name||'Organisation')}</td></tr>`).join('')}</table></div>`:'<p class="muted">Noch keine Aktivitäten protokolliert.</p>');
}

const opTypeLabels={announcements:'Meldungen',homework:'Aufgaben',appointments:'Termine',links:'Links',lessons:'Unterricht',exams:'Prüfungen'};
function opSummary(type,x){if(type==='lessons')return x.notes||x.subject_name||'Unterricht';return x.title||'Eintrag';}
function contentFields(type,x,courses){
  const global=['announcements','appointments','links'].includes(type),course=`<label class="field">Klasse/Kurs<select name="course_id" ${global?'':'required'}>${opOptions(courses,x.course_id,global)}</select></label>`;
  if(type==='homework')return `${course}<label class="field">Titel<input name="title" value="${opEsc(x.title)}" required></label><label class="field">Beschreibung<textarea name="description">${opEsc(x.description||'')}</textarea></label><label class="field">Fällig<input type="datetime-local" name="due_at" value="${opEsc(opDateTime(x.due_at))}"></label><label class="field">Abgabehinweis<textarea name="submission_info">${opEsc(x.submission_info||'')}</textarea></label>`;
  if(type==='appointments')return `${course}<label class="field">Titel<input name="title" value="${opEsc(x.title)}" required></label><div class="row"><label class="field">Beginn<input type="datetime-local" name="starts_at" value="${opEsc(opDateTime(x.starts_at))}" required></label><label class="field">Ende<input type="datetime-local" name="ends_at" value="${opEsc(opDateTime(x.ends_at))}"></label></div><label class="field">Ort<input name="location" value="${opEsc(x.location||'')}"></label><label class="field">Beschreibung<textarea name="description">${opEsc(x.description||'')}</textarea></label>`;
  if(type==='announcements')return `${course}<label class="field">Titel<input name="title" value="${opEsc(x.title)}" required></label><label class="field">Text<textarea name="body" required>${opEsc(x.body||'')}</textarea></label><label class="field"><span><input type="checkbox" name="visible" ${Number(x.visible)!==0?'checked':''}> Für Teilnehmer sichtbar</span></label>`;
  if(type==='links')return `${course}<label class="field">Titel<input name="title" value="${opEsc(x.title)}" required></label><label class="field">URL<input type="url" name="url" value="${opEsc(x.url||'')}" required></label><label class="field">Kategorie<input name="category" value="${opEsc(x.category||'')}"></label>`;
  if(type==='lessons')return `${course}<div class="row"><label class="field">Beginn<input type="datetime-local" name="starts_at" value="${opEsc(opDateTime(x.starts_at))}" required></label><label class="field">Ende<input type="datetime-local" name="ends_at" value="${opEsc(opDateTime(x.ends_at))}" required></label></div><label class="field">Raum<input name="room" value="${opEsc(x.room||'')}"></label><label class="field">Hinweis<textarea name="notes">${opEsc(x.notes||'')}</textarea></label><p class="muted">Bereits zugeordnete Fach- und Dozentendaten bleiben unverändert.</p>`;
  return `${course}<label class="field">Titel<input name="title" value="${opEsc(x.title)}" required></label><div class="row"><label class="field">Beginn<input type="datetime-local" name="starts_at" value="${opEsc(opDateTime(x.starts_at))}" required></label><label class="field">Ende<input type="datetime-local" name="ends_at" value="${opEsc(opDateTime(x.ends_at))}"></label></div><label class="field">Raum<input name="room" value="${opEsc(x.room||'')}"></label><label class="field">Hilfsmittel<textarea name="allowed_aids">${opEsc(x.allowed_aids||'')}</textarea></label><label class="field">Hinweise<textarea name="notes">${opEsc(x.notes||'')}</textarea></label><label class="field"><span><input type="checkbox" name="visible_to_students" ${Number(x.visible_to_students)!==0?'checked':''}> Für Teilnehmer sichtbar</span></label>`;
}
async function openContentManager(initial='announcements'){
  const tenant=opTenant(),courses=await opCourses();let type=initial;
  const back=opModal('Einträge verwalten',`<div class="toolbar"><label class="field" style="min-width:240px">Bereich<select id="op-content-type">${Object.entries(opTypeLabels).map(([k,v])=>`<option value="${k}" ${k===type?'selected':''}>${v}</option>`).join('')}</select></label><button class="btn secondary" id="op-content-refresh">Aktualisieren</button></div><div id="op-content-list"></div>`);
  const list=back.querySelector('#op-content-list');
  async function load(){list.innerHTML='<p class="muted">Lädt …</p>';try{const xs=(await opApi(`/api/content/${encodeURIComponent(type)}?tenant_id=${encodeURIComponent(tenant)}`)).items||[];list.innerHTML=xs.length?`<div class="table-wrap"><table><tr><th>Eintrag</th><th>Klasse/Kurs</th><th>Zeit/Fälligkeit</th><th></th></tr>${xs.map(x=>`<tr><td><strong>${opEsc(opSummary(type,x))}</strong></td><td>${opEsc(courses.find(c=>c.id===x.course_id)?.name||'Alle')}</td><td>${opEsc(x.due_at||x.starts_at||x.published_at||'')}</td><td><button class="btn secondary op-content-edit" data-id="${opEsc(x.id)}">Bearbeiten</button> <button class="btn secondary op-content-delete" data-id="${opEsc(x.id)}">Löschen</button></td></tr>`).join('')}</table></div>`:'<p class="muted">Keine Einträge vorhanden.</p>';list.querySelectorAll('.op-content-edit').forEach(b=>b.onclick=()=>{const x=xs.find(i=>i.id===b.dataset.id);if(!x)return;back.remove();opForm(`${opTypeLabels[type]} bearbeiten`,contentFields(type,x,courses),async f=>{const data=Object.fromEntries(f);if(type==='announcements')data.visible=f.has('visible');if(type==='exams')data.visible_to_students=f.has('visible_to_students');await opApi(`/api/content/${encodeURIComponent(type)}/${encodeURIComponent(x.id)}?tenant_id=${encodeURIComponent(tenant)}`,{method:'PATCH',body:JSON.stringify(data)});});});list.querySelectorAll('.op-content-delete').forEach(b=>b.onclick=async()=>{const x=xs.find(i=>i.id===b.dataset.id);if(!x||!confirm(`„${opSummary(type,x)}“ wirklich löschen?`))return;try{await opApi(`/api/content/${encodeURIComponent(type)}/${encodeURIComponent(x.id)}?tenant_id=${encodeURIComponent(tenant)}`,{method:'DELETE'});await load();}catch(e){alert(e.message);}});}catch(e){list.innerHTML=`<p class="error">${opEsc(e.message)}</p>`;}}
  back.querySelector('#op-content-type').onchange=e=>{type=e.target.value;load();};back.querySelector('#op-content-refresh').onclick=load;await load();
}

function opAddButton(toolbar,id,label,handler){if(!toolbar||document.querySelector(`#${id}`))return;const b=document.createElement('button');b.type='button';b.className='btn secondary';b.id=id;b.textContent=label;b.onclick=()=>handler().catch(e=>alert(e.message));toolbar.append(b);}
let opQueued=false;
function enhanceOperations(){
  const content=document.querySelector('.content');if(!content)return;const title=content.querySelector(':scope > .top h2')?.textContent?.trim()||'',toolbar=content.querySelector(':scope > .toolbar')||content.querySelector('.toolbar');if(!toolbar)return;
  if(title==='Klassen/Kurse')opAddButton(toolbar,'op-manage-courses','Klassen verwalten',openCourseManager);
  else if(title==='Benutzer & Rollen'){opAddButton(toolbar,'op-manage-members','Rollen verwalten',openMembershipManager);opAddButton(toolbar,'op-audit-users','Aktivitäten',openAuditLog);}
  else if(title==='Inhalte')opAddButton(toolbar,'op-manage-content','Einträge verwalten',()=>openContentManager('announcements'));
  else if(title==='Prüfungen')opAddButton(toolbar,'op-manage-exams','Prüfungen verwalten',()=>openContentManager('exams'));
}
function scheduleOperations(){if(opQueued)return;opQueued=true;queueMicrotask(()=>{opQueued=false;enhanceOperations();});}
if(OP_ROOT){new MutationObserver(scheduleOperations).observe(OP_ROOT,{subtree:true,childList:true});document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(scheduleOperations,0)});enhanceOperations();}
