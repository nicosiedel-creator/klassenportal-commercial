const CPA=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cpaUser=null,cpaTenants=[],cpaBusy=false,cpaScheduled=false,cpaCache={tenantId:'',courses:[],at:0};

async function cpaJson(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
function cpaTenantId(){return document.querySelector('#tenantPick')?.value||'';}
async function cpaCourses(tenantId){if(cpaCache.tenantId===tenantId&&Date.now()-cpaCache.at<5000)return cpaCache.courses;const xs=(await cpaJson(`/api/courses?tenant_id=${encodeURIComponent(tenantId)}`)).courses||[];cpaCache={tenantId,courses:xs,at:Date.now()};return xs;}

async function enhanceClassPortalLinks(){
  if(cpaBusy||!cpaUser)return;const title=[...document.querySelectorAll('.content h2')].find(x=>x.textContent?.trim()==='Klassen/Kurse');if(!title)return;
  const tenantId=cpaTenantId();if(!tenantId)return;cpaBusy=true;
  try{
    if(!cpaTenants.length)cpaTenants=(await cpaJson('/api/platform/tenants')).tenants||[];
    const tenant=cpaTenants.find(x=>x.id===tenantId);if(!tenant?.slug)return;
    const courses=await cpaCourses(tenantId),table=title.closest('.content')?.querySelector('.table-wrap table');if(!table)return;
    const head=table.querySelector('tr');if(head&&!head.querySelector('.cpa-head')){const th=document.createElement('th');th.className='cpa-head';th.textContent='Klassenportal';head.append(th);}
    [...table.querySelectorAll('tr')].slice(1).forEach(tr=>{
      if(tr.querySelector('.cpa-cell'))return;const cells=tr.querySelectorAll('td'),code=cells[1]?.textContent?.trim()||'',course=courses.find(x=>String(x.code)===code);const td=document.createElement('td');td.className='cpa-cell';
      if(course){const href=`/portal/${encodeURIComponent(tenant.slug)}/${encodeURIComponent(course.code)}`;td.innerHTML=`<div style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn secondary" target="_blank" rel="noopener" href="${CPA(href)}">Portal öffnen</a><button type="button" class="btn secondary cpa-copy" data-href="${CPA(href)}">Link kopieren</button></div>`;td.querySelector('.cpa-copy').onclick=async e=>{const url=new URL(e.currentTarget.dataset.href,location.origin).href;try{await navigator.clipboard.writeText(url);const old=e.currentTarget.textContent;e.currentTarget.textContent='Kopiert';setTimeout(()=>e.currentTarget.textContent=old,1200);}catch{prompt('Portal-Link kopieren:',url);}};}
      else td.textContent='—';tr.append(td);
    });
  }catch{}finally{cpaBusy=false;}
}
function cpaSchedule(){if(cpaScheduled)return;cpaScheduled=true;queueMicrotask(()=>{cpaScheduled=false;enhanceClassPortalLinks();});}

(async()=>{try{cpaUser=(await cpaJson('/api/auth/me')).user||null;if(!cpaUser)return;const roles=cpaUser.tenantRoles||[],mayManage=cpaUser.isPlatformAdmin||roles.some(x=>x.role==='tenant_admin'||x.role==='class_admin');if(!mayManage)return;const target=document.querySelector('#app')||document.body;new MutationObserver(cpaSchedule).observe(target,{subtree:true,childList:true});document.addEventListener('change',e=>{if(e.target?.id==='tenantPick'){cpaCache={tenantId:'',courses:[],at:0};setTimeout(cpaSchedule,0);}});cpaSchedule();}catch{}})();
