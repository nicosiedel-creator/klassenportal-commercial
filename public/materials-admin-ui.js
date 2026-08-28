const KM_ESC=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let kmUser=null,kmScheduled=false;

async function kmRequest(url,opt={}){
  const isForm=opt.body instanceof FormData;
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(isForm?{}:{'content-type':'application/json'}),...(opt.headers||{})}});
  if((r.headers.get('content-type')||'').includes('application/json')){const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  if(!r.ok)throw new Error(`HTTP_${r.status}`);return r;
}
function kmTenant(){return document.querySelector('#tenantPick')?.value||'';}
function kmRole(tenantId){if(kmUser?.isPlatformAdmin)return 'platform_admin';const rank={tenant_admin:4,class_admin:3,participant:2,guest:1};return [...(kmUser?.tenantRoles||[]).filter(x=>x.tenantId===tenantId)].sort((a,b)=>(rank[b.role]||0)-(rank[a.role]||0))[0]?.role||'';}
function kmSize(n){const x=Number(n||0);if(x<1024)return `${x} B`;if(x<1024*1024)return `${(x/1024).toFixed(1)} KB`;return `${(x/1024/1024).toFixed(1)} MB`;}
function kmCurrentContent(){return [...document.querySelectorAll('.content h2')].some(x=>x.textContent?.trim()==='Inhalte');}

async function kmOpen(){
  const tenantId=kmTenant();if(!tenantId)return;
  let courses=[],materials=[];try{[courses,materials]=await Promise.all([(await kmRequest(`/api/courses?tenant_id=${encodeURIComponent(tenantId)}`)).courses||[],(await kmRequest(`/api/materials?tenant_id=${encodeURIComponent(tenantId)}`)).materials||[]]);}catch(e){alert(e.message);return;}
  const role=kmRole(tenantId),canGlobal=['tenant_admin','platform_admin'].includes(role);
  const back=document.createElement('div');back.className='modal-back';back.innerHTML=`<div class="modal" style="width:min(1050px,96vw);max-height:92vh;overflow:auto"><div class="top"><div><h3 style="margin:0">Dateien & Lernmaterialien</h3><div class="muted">Material einmal hochladen und der Klasse direkt im Portal bereitstellen.</div></div><button type="button" class="btn secondary" id="km-close">×</button></div>
  <form id="km-upload" class="card" style="margin-top:14px"><h3>Material hochladen</h3><div class="row"><label class="field">Klasse/Kurs<select name="course_id" ${canGlobal?'':'required'}>${canGlobal?'<option value="">Alle Klassen/Kurse</option>':''}${courses.map(c=>`<option value="${KM_ESC(c.id)}">${KM_ESC(c.name)}</option>`).join('')}</select></label><label class="field">Titel<input name="title" maxlength="250" placeholder="wird sonst aus dem Dateinamen übernommen"></label></div><label class="field">Beschreibung<textarea name="description" maxlength="5000" placeholder="optional"></textarea></label><div class="row"><label class="field">Datei<input type="file" name="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.rtf,.zip,.jpg,.jpeg,.png,.webp"></label><label class="field">Sichtbarkeit<select name="visible"><option value="1">Für Teilnehmer sichtbar</option><option value="0">Noch nicht sichtbar</option></select></label></div><div class="toolbar"><button class="btn">Hochladen</button><span class="muted">Maximal 25 MB. Aktive Web-/Skriptdateien werden nicht zugelassen.</span></div><div id="km-status" class="muted"></div></form>
  <div class="card" style="margin-top:14px"><div class="top"><h3 style="margin:0">Vorhandene Materialien</h3><button type="button" class="btn secondary" id="km-refresh">Aktualisieren</button></div><div id="km-list" style="margin-top:12px"></div></div></div>`;document.body.append(back);
  const close=()=>back.remove();back.querySelector('#km-close').onclick=close;back.addEventListener('click',e=>{if(e.target===back)close()});
  const list=back.querySelector('#km-list'),courseName=id=>courses.find(c=>c.id===id)?.name||'Alle Klassen/Kurse';
  async function reload(){materials=(await kmRequest(`/api/materials?tenant_id=${encodeURIComponent(tenantId)}`)).materials||[];render();}
  function render(){
    list.innerHTML=materials.length?`<div class="table-wrap"><table><tr><th>Titel</th><th>Klasse/Kurs</th><th>Datei</th><th>Sichtbar</th><th></th></tr>${materials.map(m=>`<tr data-id="${KM_ESC(m.id)}"><td><strong>${KM_ESC(m.title||m.original_name)}</strong>${m.description?`<div class="muted">${KM_ESC(m.description)}</div>`:''}</td><td>${KM_ESC(courseName(m.course_id))}</td><td>${KM_ESC(m.original_name)}<div class="muted">${kmSize(m.size_bytes)}</div></td><td>${Number(m.visible)===1?'Ja':'Nein'}</td><td><div class="toolbar" style="margin:0"><button type="button" class="btn secondary km-download">Herunterladen</button><button type="button" class="btn secondary km-visible">${Number(m.visible)===1?'Verbergen':'Freigeben'}</button><button type="button" class="btn danger km-delete">Löschen</button></div></td></tr>`).join('')}</table></div>`:'<p class="muted">Noch keine Lernmaterialien vorhanden.</p>';
    list.querySelectorAll('tr[data-id]').forEach(tr=>{const m=materials.find(x=>x.id===tr.dataset.id);if(!m)return;
      tr.querySelector('.km-download').onclick=()=>window.open(`/api/materials/${encodeURIComponent(m.id)}/download?tenant_id=${encodeURIComponent(tenantId)}${m.course_id?`&course_id=${encodeURIComponent(m.course_id)}`:''}`,'_blank','noopener');
      tr.querySelector('.km-visible').onclick=async()=>{try{await kmRequest(`/api/materials/${encodeURIComponent(m.id)}?tenant_id=${encodeURIComponent(tenantId)}${m.course_id?`&course_id=${encodeURIComponent(m.course_id)}`:''}`,{method:'PATCH',body:JSON.stringify({visible:Number(m.visible)!==1,title:m.title,description:m.description||''})});await reload();}catch(e){alert(e.message);}};
      tr.querySelector('.km-delete').onclick=async()=>{if(!confirm(`„${m.title||m.original_name}“ wirklich löschen?`))return;try{await kmRequest(`/api/materials/${encodeURIComponent(m.id)}?tenant_id=${encodeURIComponent(tenantId)}${m.course_id?`&course_id=${encodeURIComponent(m.course_id)}`:''}`,{method:'DELETE',body:'{}'});await reload();}catch(e){alert(e.message);}};
    });
  }
  render();back.querySelector('#km-refresh').onclick=reload;
  back.querySelector('#km-upload').onsubmit=async e=>{e.preventDefault();const status=back.querySelector('#km-status'),button=e.currentTarget.querySelector('button');button.disabled=true;status.textContent='Datei wird hochgeladen …';try{const f=new FormData(e.currentTarget),cid=String(f.get('course_id')||'');const file=f.get('file');if(file?.size>25*1024*1024)throw new Error('Die Datei ist größer als 25 MB.');await kmRequest(`/api/materials?tenant_id=${encodeURIComponent(tenantId)}${cid?`&course_id=${encodeURIComponent(cid)}`:''}`,{method:'POST',body:f});status.textContent='Material wurde gespeichert.';e.currentTarget.reset();await reload();}catch(x){status.textContent=(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(x):x.message);}finally{button.disabled=false;}};
}

function kmApply(){
  if(!kmUser||!kmCurrentContent())return;const role=kmRole(kmTenant());if(!['platform_admin','tenant_admin','class_admin'].includes(role))return;
  const content=document.querySelector('.content'),toolbar=content?.querySelector('.toolbar');if(!toolbar||toolbar.querySelector('#kp-materials-admin'))return;
  const b=document.createElement('button');b.type='button';b.className='btn secondary';b.id='kp-materials-admin';b.textContent='Dateien & Lernmaterialien';b.onclick=kmOpen;toolbar.append(b);
}
function kmSchedule(){if(kmScheduled)return;kmScheduled=true;queueMicrotask(()=>{kmScheduled=false;kmApply();});}

(async()=>{try{kmUser=(await kmRequest('/api/auth/me')).user;if(!kmUser)return;new MutationObserver(kmSchedule).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(kmApply,0)});kmApply();}catch{}})();
