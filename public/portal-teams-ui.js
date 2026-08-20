const KP_TEAMS_PORTAL=/^\/portal\/[^/]+\/[^/]+\/?$/.test(location.pathname);
if(KP_TEAMS_PORTAL){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.clone().json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  function safeTeamsUrl(raw){try{const u=new URL(String(raw||''));const h=u.hostname.toLowerCase();return u.protocol==='https:'&&(h==='teams.microsoft.com'||h.endsWith('.teams.microsoft.com')||h==='teams.live.com'||h==='teams.cloud.microsoft'||h.endsWith('.teams.cloud.microsoft'))?u.href:null;}catch{return null;}}
  const p=location.pathname.split('/').filter(Boolean),tenantSlug=decodeURIComponent(p[1]||''),courseCode=decodeURIComponent(p[2]||'');
  async function context(){const d=await api(`/public/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(courseCode)}/overview`);if(!['participant','class_admin'].includes(d.viewer?.role)||!d.viewer?.tenantId||!d.course?.id)return null;return{tenantId:d.viewer.tenantId,courseId:d.course.id,timezone:d.course.timezone||'Europe/Berlin'};}
  function fmt(v,tz){const d=new Date(String(v||''));return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('de-DE',{timeZone:tz,weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d):'';}
  async function load(){let c;try{c=await context()}catch{return}if(!c)return;let d;try{d=await api(`/api/integrations/microsoft/meetings?tenant_id=${encodeURIComponent(c.tenantId)}&course_id=${encodeURIComponent(c.courseId)}&from=${encodeURIComponent(new Date(Date.now()-60000).toISOString())}`);}catch{return}const meetings=(d.meetings||[]).filter(x=>safeTeamsUrl(x.join_url)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));render(c,meetings);}
  function render(c,meetings){
    document.querySelector('#kp-teams-schedule')?.remove();if(!meetings.length)return;
    const host=document.createElement('div');host.id='kp-teams-schedule';host.className='portal-day';
    host.innerHTML=`<h3>Teams-Besprechungen</h3><div class="portal-list">${meetings.map(m=>{const href=safeTeamsUrl(m.join_url);return `<div class="portal-item"><div class="portal-item-top"><div><strong>${esc(m.subject||'Teams-Besprechung')}</strong><div class="meta">${esc(fmt(m.starts_at,c.timezone))}</div></div><a class="portal-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Teams beitreten</a></div></div>`;}).join('')}</div>`;
    const schedule=document.querySelector('#stundenplan .portal-list')||document.querySelector('#woche .portal-calendar')||document.querySelector('.portal-main');schedule?.append(host);
  }
  let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(load,120)};
  new MutationObserver(schedule).observe(document.querySelector('#class-portal')||document.body,{subtree:true,childList:true});
  load();
}
