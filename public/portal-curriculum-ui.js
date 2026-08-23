const curriculumPortal=/^\/portal\/[^/]+\/[^/]+\/?$/.test(location.pathname);
if(curriculumPortal){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  let loading=false,loadedKey='';
  async function api(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  function contextFromPortal(data){if(!data?.viewer?.authenticated||!data.viewer.tenantId||!data.course?.id)return null;return{tenantId:String(data.viewer.tenantId),courseId:String(data.course.id)};}
  async function render(ctx,force=false){
    if(loading||!ctx)return;const main=document.querySelector('#class-portal .portal-main'),key=`${ctx.tenantId}:${ctx.courseId}`;if(!main||(!force&&loadedKey===key))return;loading=true;
    try{
      const d=await api(`/api/education/courses/${encodeURIComponent(ctx.courseId)}/curriculum/me?tenant_id=${encodeURIComponent(ctx.tenantId)}&course_id=${encodeURIComponent(ctx.courseId)}`);loadedKey=key;document.querySelector('#lehrplanfortschritt')?.remove();if(!d.framework)return;
      const section=document.createElement('section');section.id='lehrplanfortschritt';section.className='portal-section wide';const s=d.summary||{},items=d.items||[];
      section.innerHTML=`<div class="portal-section-head"><div><h2>Lehrplanfortschritt</h2><div class="meta">${E(d.framework.name)}${d.framework.version?` · ${E(d.framework.version)}`:''}</div></div><span>${E(s.percent||0)}%</span></div><div class="portal-compact-body"><div style="display:grid;grid-template-columns:minmax(220px,.7fr) 1.3fr;gap:14px;align-items:start"><div><div style="height:12px;background:#e8edf5;border-radius:999px;overflow:hidden"><i style="display:block;height:100%;width:${Math.max(0,Math.min(100,Number(s.percent||0)))}%;background:var(--portal-primary,#4f46e5)"></i></div><div class="portal-rich-row" style="margin-top:10px"><strong>${E(s.percent||0)}% abgedeckt</strong><span>${Math.round(Number(s.covered_minutes||0)/6)/10} von ${Math.round(Number(s.target_minutes||0)/6)/10} Stunden</span></div><p class="meta">Das ist der gemeinsame fachliche Fortschritt der Klasse – keine Noten, Anwesenheiten oder Daten anderer Schüler.</p></div><details><summary class="portal-compact-toggle">Lernfelder und Themen anzeigen</summary><div class="portal-list" style="margin-top:8px">${items.map(i=>`<div class="portal-item"><div class="portal-item-top"><div><strong>${E([i.code,i.title].filter(Boolean).join(' · '))}</strong>${i.learning_objectives?`<div class="body">${E(i.learning_objectives)}</div>`:''}</div><span class="portal-pill">${E(i.percent||0)}%</span></div><div class="meta">${Math.round(Number(i.covered_minutes||0)/6)/10} / ${Math.round(Number(i.target_minutes||0)/6)/10} h${Number(i.exam_relevant)?' · prüfungsrelevant':''}</div></div>`).join('')||'<div class="portal-empty">Noch keine Lernfelder hinterlegt.</div>'}</div></details></div></div>`;
      const calendar=main.querySelector('#kalender');calendar?.after(section)||main.append(section);
    }catch{}finally{loading=false;}
  }
  function onPortalData(data){const ctx=contextFromPortal(data);loadedKey='';if(ctx)void render(ctx);else document.querySelector('#lehrplanfortschritt')?.remove();}
  window.addEventListener('kp:portal-data',event=>onPortalData(event.detail?.data));
  if(window.__KP_PORTAL_DATA)onPortalData(window.__KP_PORTAL_DATA);
}
