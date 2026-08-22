const portalRoot=document.querySelector('#class-portal');
const portalPath=location.pathname.split('/').filter(Boolean);
const layoutTenant=decodeURIComponent(portalPath[1]||'');
const layoutCourse=decodeURIComponent(portalPath[2]||'');
const accessStoreKey=`kp_access_${layoutTenant}_${layoutCourse}`;
let layoutIdentity='browser',serverContext=null,serverOrder=null,customized=false,contextReady=false;

function storageKey(){return `kp_layout_v2_${layoutTenant}_${layoutCourse}_${layoutIdentity}`;}
function legacyStorageKey(){return `kp_layout_v1_${layoutTenant}_${layoutCourse}`;}
function safeLoadOrder(){
  try{
    const current=localStorage.getItem(storageKey());
    if(current){const parsed=JSON.parse(current);return Array.isArray(parsed)?parsed.map(String):[];}
    const legacy=localStorage.getItem(legacyStorageKey());if(!legacy)return[];
    const parsed=JSON.parse(legacy);if(Array.isArray(parsed)){localStorage.setItem(storageKey(),JSON.stringify(parsed));return parsed.map(String);}return[];
  }catch{return[];}
}
function saveOrderLocal(ids){try{localStorage.setItem(storageKey(),JSON.stringify(ids));}catch{}}
function clearOrderLocal(){try{localStorage.removeItem(storageKey());}catch{}}
function sectionIds(grid){return [...grid.querySelectorAll(':scope > .portal-section[id]')].map(x=>x.id);}
function combinedSavedOrder(current){const source=(serverOrder?.length?serverOrder:safeLoadOrder()).filter(id=>current.includes(id));return [...source,...current.filter(id=>!source.includes(id))];}
async function apiJson(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
async function resolveContext(){
  if(contextReady)return;contextReady=true;
  try{
    const code=sessionStorage.getItem(accessStoreKey)||'';
    const [me,overview]=await Promise.all([
      apiJson('/api/auth/me').catch(()=>({user:null})),
      apiJson(`/public/${encodeURIComponent(layoutTenant)}/${encodeURIComponent(layoutCourse)}/overview`,{headers:code?{'X-Klassenportal-Access-Code':code}:{}}).catch(()=>null),
    ]);
    if(me?.user?.userId)layoutIdentity=String(me.user.userId);
    const tenantId=overview?.viewer?.authenticated?String(overview.viewer.tenantId||''):'';
    const courseId=String(overview?.course?.id||'');
    if(tenantId&&courseId&&me?.user?.userId){
      serverContext={tenantId,courseId};
      try{const r=await apiJson(`/api/personal/portal-layout?tenant_id=${encodeURIComponent(tenantId)}&course_id=${encodeURIComponent(courseId)}`);serverOrder=Array.isArray(r.order)?r.order.map(String):[];}catch{serverOrder=null;}
    }
  }catch{}
  customized=(serverOrder?.length||safeLoadOrder().length)>0;
}
async function saveOrderServer(ids){if(!serverContext)return;try{const r=await apiJson(`/api/personal/portal-layout?tenant_id=${encodeURIComponent(serverContext.tenantId)}&course_id=${encodeURIComponent(serverContext.courseId)}`,{method:'PUT',body:JSON.stringify({order:ids})});serverOrder=Array.isArray(r.order)?r.order.map(String):ids;}catch{}}
async function resetOrderServer(){if(!serverContext)return;try{await apiJson(`/api/personal/portal-layout?tenant_id=${encodeURIComponent(serverContext.tenantId)}&course_id=${encodeURIComponent(serverContext.courseId)}`,{method:'DELETE'});serverOrder=[];}catch{}}
function reorderNav(order){
  const nav=portalRoot?.querySelector('.portal-nav');if(!nav)return;
  const links=[...nav.querySelectorAll('a[href^="#"]')],byId=new Map(links.map(a=>[decodeURIComponent(a.hash.slice(1)),a]));
  for(const id of order){const a=byId.get(id);if(a)nav.append(a);}
  for(const a of links)if(!order.includes(decodeURIComponent(a.hash.slice(1))))nav.append(a);
}
function persistGrid(grid){const ids=sectionIds(grid);saveOrderLocal(ids);serverOrder=ids;customized=true;reorderNav(ids);updateResetButton();void saveOrderServer(ids);}
function moveSection(section,direction){
  const grid=section.parentElement;if(!grid)return;
  const sections=[...grid.querySelectorAll(':scope > .portal-section[id]')],index=sections.indexOf(section),next=index+direction;
  if(index<0||next<0||next>=sections.length)return;
  if(direction<0)grid.insertBefore(section,sections[next]);else grid.insertBefore(sections[next],section);
  persistGrid(grid);section.focus({preventScroll:true});
}
function updateResetButton(){const button=portalRoot?.querySelector('#portal-layout-reset');if(button)button.hidden=!customized;}
function addResetButton(defaultOrder,grid){
  const actions=portalRoot?.querySelector('.portal-header-actions');if(!actions||actions.querySelector('#portal-layout-reset'))return;
  const button=document.createElement('button');button.type='button';button.id='portal-layout-reset';button.className='portal-btn secondary portal-layout-reset';button.textContent='Anordnung zurücksetzen';
  button.addEventListener('click',()=>{clearOrderLocal();serverOrder=[];customized=false;for(const id of defaultOrder){const section=grid.querySelector(`#${CSS.escape(id)}`);if(section)grid.append(section);}reorderNav(sectionIds(grid));updateResetButton();void resetOrderServer();});
  actions.prepend(button);updateResetButton();
}
function addControls(section){
  const head=section.querySelector(':scope > .portal-section-head');if(!head||head.querySelector('.portal-layout-controls'))return;
  const count=head.querySelector(':scope > span');
  const controls=document.createElement('div');controls.className='portal-layout-controls';
  const up=document.createElement('button');up.type='button';up.className='portal-layout-step';up.title='Kachel nach oben/vorn verschieben';up.setAttribute('aria-label','Kachel nach oben oder vorn verschieben');up.textContent='↑';
  const drag=document.createElement('button');drag.type='button';drag.className='portal-layout-drag';drag.title='Kachel ziehen und verschieben';drag.setAttribute('aria-label','Kachel ziehen und verschieben');drag.draggable=true;drag.textContent='⋮⋮';
  const down=document.createElement('button');down.type='button';down.className='portal-layout-step';down.title='Kachel nach unten/hinten verschieben';down.setAttribute('aria-label','Kachel nach unten oder hinten verschieben');down.textContent='↓';
  up.addEventListener('click',()=>moveSection(section,-1));down.addEventListener('click',()=>moveSection(section,1));
  drag.addEventListener('dragstart',e=>{section.classList.add('portal-layout-dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',section.id);});
  drag.addEventListener('dragend',()=>{section.classList.remove('portal-layout-dragging');section.parentElement?.querySelectorAll('.portal-layout-drop-before,.portal-layout-drop-after').forEach(x=>x.classList.remove('portal-layout-drop-before','portal-layout-drop-after'));});
  controls.append(up,drag,down);if(count)controls.prepend(count);head.append(controls);section.tabIndex=-1;
}
function installDropTargets(grid){
  if(grid.dataset.layoutDropReady==='1')return;grid.dataset.layoutDropReady='1';
  grid.addEventListener('dragover',e=>{
    const dragged=grid.querySelector('.portal-layout-dragging'),target=e.target.closest('.portal-section');if(!dragged||!target||dragged===target)return;
    e.preventDefault();e.dataTransfer.dropEffect='move';grid.querySelectorAll('.portal-layout-drop-before,.portal-layout-drop-after').forEach(x=>x.classList.remove('portal-layout-drop-before','portal-layout-drop-after'));
    const rect=target.getBoundingClientRect(),sameRow=Math.abs(e.clientY-(rect.top+rect.height/2))<rect.height*.32,before=sameRow?e.clientX<rect.left+rect.width/2:e.clientY<rect.top+rect.height/2;
    target.classList.add(before?'portal-layout-drop-before':'portal-layout-drop-after');
  });
  grid.addEventListener('drop',e=>{
    const dragged=grid.querySelector('.portal-layout-dragging'),target=e.target.closest('.portal-section');if(!dragged||!target||dragged===target)return;
    e.preventDefault();const before=target.classList.contains('portal-layout-drop-before');grid.insertBefore(dragged,before?target:target.nextSibling);persistGrid(grid);
    grid.querySelectorAll('.portal-layout-drop-before,.portal-layout-drop-after').forEach(x=>x.classList.remove('portal-layout-drop-before','portal-layout-drop-after'));
  });
}
async function enhanceLayout(){
  const grid=portalRoot?.querySelector('.portal-grid');if(!grid||grid.dataset.layoutEnhanced==='1')return;
  await resolveContext();if(!grid.isConnected||grid.dataset.layoutEnhanced==='1')return;
  grid.dataset.layoutEnhanced='1';const defaultOrder=sectionIds(grid),wanted=combinedSavedOrder(defaultOrder);
  for(const id of wanted){const section=grid.querySelector(`#${CSS.escape(id)}`);if(section)grid.append(section);}
  for(const section of grid.querySelectorAll(':scope > .portal-section[id]'))addControls(section);
  installDropTargets(grid);reorderNav(sectionIds(grid));addResetButton(defaultOrder,grid);
}

if(portalRoot){
  let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;void enhanceLayout();});};
  // Only a complete shell replacement requires re-enhancement. Nested feature
  // mutations must not fan out into a document-wide observer cascade.
  new MutationObserver(schedule).observe(portalRoot,{childList:true});
  void enhanceLayout();
}
