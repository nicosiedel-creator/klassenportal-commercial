// Wann ich arbeiten moechte - im Dozentenportal.
//
// Fuer Honorarkraefte ist das der eigentliche Planungsschluessel: das Portal kannte bisher nur
// die Abwesenheit, also wann jemand NICHT kann. Hier gibt die Person selbst an, wann sie zur
// Verfuegung steht. Die Angabe ist freiwillig: wer nichts eintraegt, wird geplant wie bisher.
const teacherAvailabilityRoot=document.querySelector('#teacher-portal');

if(teacherAvailabilityRoot){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TAGE=[['1','Montag'],['2','Dienstag'],['3','Mittwoch'],['4','Donnerstag'],['5','Freitag'],['6','Samstag'],['7','Sonntag']];
  const TAG_NAME=new Map(TAGE);
  const fehler=e=>window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(e):String(e?.message||e);
  let zuordnungen=[],aktuell=null,eintraege=[];

  async function api(url,opt={}){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,
      headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});
    let d={};try{d=await r.json();}catch{}
    if(!r.ok)throw Object.assign(new Error(d.error||`HTTP_${r.status}`),{status:r.status});
    return d;
  }
  const q=(path,z,extra={})=>{const p=new URLSearchParams({tenant_id:z.tenant_id});for(const [k,v] of Object.entries(extra))if(v)p.set(k,String(v));return `${path}?${p}`;};

  // Die eigenen geleisteten Stunden - fuer Honorarkraefte die Grundlage ihrer Rechnung.
  function monatsGrenzen(){
    const heute=new Date(),von=new Date(Date.UTC(heute.getUTCFullYear(),heute.getUTCMonth(),1)),
      bis=new Date(Date.UTC(heute.getUTCFullYear(),heute.getUTCMonth()+1,0));
    return[von.toISOString().slice(0,10),bis.toISOString().slice(0,10)];
  }
  const stunden=m=>`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`;
  async function meineStunden(host){
    const box=host.querySelector('[data-stunden]');if(!box)return;
    const f=box.querySelector('form'),out=box.querySelector('[data-stunden-ergebnis]');
    const zeigen=async()=>{
      const von=f.elements.from.value,bis=f.elements.to.value;
      if(!von||!bis||von>bis){out.innerHTML='<div class="muted">Bitte einen gültigen Zeitraum wählen.</div>';return;}
      out.textContent='Wird berechnet …';
      try{
        const d=await api(q('/api/education/planning/teacher-workload',aktuell,{from:von,to:bis,teacher_id:aktuell.teacher_id}));
        const z=(d.workload?.rows||[])[0]||{held_minutes:0,held_lessons:0,planned_minutes:0};
        out.innerHTML=`<div class="notice ok"><strong>${E(stunden(Number(z.held_minutes||0)))} gehalten</strong>`
          +`<div class="muted">${E(Number(z.held_lessons||0))} Termin(e) im gewählten Zeitraum.`
          +(Number(z.planned_minutes||0)?` Zusätzlich ${E(stunden(Number(z.planned_minutes)))} geplant, aber noch nicht stattgefunden.`:'')
          +`</div></div>`;
      }catch(x){out.innerHTML=`<div class="muted">${E(fehler(x))}</div>`;}
    };
    f.onsubmit=e=>{e.preventDefault();void zeigen();};
    void zeigen();
  }

  async function laden(){
    if(!aktuell)return;
    eintraege=(await api(q('/api/education/planning/teacher-availability',aktuell,{teacher_id:aktuell.teacher_id}))).availability||[];
  }

  function karte(){
    const main=teacherAvailabilityRoot.querySelector('.portal-main');if(!main||!aktuell)return null;
    let host=main.querySelector('#tp-availability');
    if(!host){host=document.createElement('section');host.id='tp-availability';main.append(host);}
    return host;
  }

  function zeichnen(meldung=''){
    const host=karte();if(!host)return;
    const zeilen=eintraege.map(x=>`<tr><td>${E(TAG_NAME.get(String(x.weekday))||x.weekday)}</td><td>${E(x.starts_time)} – ${E(x.ends_time)}</td>`
      +`<td>${x.preference==='preferred'?'bevorzugt':'möglich'}</td>`
      +`<td>${x.valid_from||x.valid_until?`${E(x.valid_from||'sofort')} bis ${E(x.valid_until||'unbefristet')}`:'unbefristet'}</td>`
      +`<td><button class="btn danger" type="button" data-weg="${E(x.id)}">Entfernen</button></td></tr>`).join('');
    host.innerHTML=`<div class="tp-workspace-card"><div class="tp-workspace-head"><strong>Wann ich arbeiten möchte</strong><span>${eintraege.length} Zeitfenster</span></div>`
      +`<div class="notice"><div class="muted">Diese Angabe ist freiwillig. Solange Du nichts einträgst, ändert sich nichts an der Planung. Sobald Du mindestens ein Zeitfenster angibst, wirst Du nur noch innerhalb Deiner Zeitfenster für die Planung vorgeschlagen.</div></div>`
      +(zeilen?`<div class="table-wrap" style="margin-top:10px"><table><tr><th>Tag</th><th>Zeit</th><th>Art</th><th>Gültigkeit</th><th></th></tr>${zeilen}</table></div>`
             :'<div class="muted" style="margin-top:10px">Noch kein Zeitfenster eingetragen.</div>')
      +`<form data-neu style="margin-top:12px"><div class="row">`
      +`<label class="field">Tag<select name="weekday">${TAGE.map(([w,n])=>`<option value="${w}">${n}</option>`).join('')}</select></label>`
      +`<label class="field">Von<input name="starts_time" type="time" value="08:00" required></label>`
      +`<label class="field">Bis<input name="ends_time" type="time" value="16:00" required></label>`
      +`<label class="field">Art<select name="preference"><option value="available">möglich</option><option value="preferred">bevorzugt</option></select></label>`
      +`</div><div class="row"><label class="field">Gültig ab <span class="muted">optional</span><input name="valid_from" type="date"></label>`
      +`<label class="field">Gültig bis <span class="muted">optional</span><input name="valid_until" type="date"></label></div>`
      +`<button class="btn" type="submit">Zeitfenster hinzufügen</button> <span class="muted" data-status>${E(meldung)}</span></form></div>`
      +`<div class="tp-workspace-card" data-stunden style="margin-top:12px"><div class="tp-workspace-head"><strong>Meine geleisteten Stunden</strong></div>`
      +`<form><div class="row"><label class="field">Von<input name="from" type="date" value="${E(monatsGrenzen()[0])}"></label>`
      +`<label class="field">Bis<input name="to" type="date" value="${E(monatsGrenzen()[1])}"></label></div>`
      +`<button class="btn secondary" type="submit">Stunden anzeigen</button></form><div data-stunden-ergebnis style="margin-top:10px"></div></div>`;
    binden(host);
    void meineStunden(host);
  }

  function binden(host){
    const f=host.querySelector('[data-neu]'),st=host.querySelector('[data-status]');
    f.onsubmit=async e=>{
      e.preventDefault();if(!f.reportValidity())return;
      const von=f.elements.starts_time.value,bis=f.elements.ends_time.value;
      if(!von||!bis||von>=bis){st.textContent='Das Ende muss nach dem Beginn liegen.';return;}
      st.textContent='Wird gespeichert …';
      try{
        await api(q('/api/education/planning/teacher-availability',aktuell),{method:'POST',body:JSON.stringify({
          teacher_id:aktuell.teacher_id,weekday:Number(f.elements.weekday.value),starts_time:von,ends_time:bis,
          preference:f.elements.preference.value,
          valid_from:f.elements.valid_from.value||undefined,valid_until:f.elements.valid_until.value||undefined})});
        await laden();zeichnen('Gespeichert.');
      }catch(x){st.textContent=fehler(x);}
    };
    host.querySelectorAll('[data-weg]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Dieses Zeitfenster wirklich entfernen?'))return;
      b.disabled=true;
      try{await api(q(`/api/education/planning/teacher-availability/${encodeURIComponent(b.dataset.weg)}`,aktuell),{method:'DELETE'});await laden();zeichnen('Entfernt.');}
      catch(x){b.disabled=false;host.querySelector('[data-status]').textContent=fehler(x);}
    });
  }

  async function start(){
    if(aktuell)return;
    try{
      zuordnungen=(await api('/api/attendance/teacher/courses')).courses||[];
      // Eine Person kann bei mehreren Traegern unterrichten; die Arbeitszeiten gelten je Traeger.
      aktuell=zuordnungen.find(c=>c.tenant_id&&c.teacher_id)||null;
      if(!aktuell)return;
      await laden();zeichnen();
    }catch{/* das Portal bleibt ohne diese Karte bedienbar */}
  }
  window.addEventListener('kp:teacher-modules-ready',start);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
}
