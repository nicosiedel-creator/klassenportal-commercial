const compactRoot=document.querySelector('#class-portal,#class-admin-portal');

function compactText(section){
  const empty=section.querySelector('.portal-empty,.class-admin-empty');
  if(empty?.textContent?.trim())return empty.textContent.trim();
  const first=section.querySelector('.portal-item strong,.class-admin-person strong,.class-admin-module h3');
  if(first?.textContent?.trim()){
    const meta=first.closest('.portal-item,.class-admin-person,.class-admin-module')?.querySelector('.meta');
    return `${first.textContent.trim()}${meta?.textContent?.trim()?` · ${meta.textContent.trim()}`:''}`;
  }
  const sub=section.querySelector('.class-admin-section-sub');
  if(sub?.textContent?.trim())return sub.textContent.trim();
  return 'Bereich öffnen, um Details anzuzeigen.';
}
function enhanceSection(section){
  if(section.dataset.compactReady==='1')return;
  section.dataset.compactReady='1';
  if(section.id==='uebersicht'){section.dataset.keepOpen='1';return;}
  const head=section.querySelector(':scope > .portal-section-head');if(!head)return;
  const rest=[...section.children].filter(x=>x!==head);if(!rest.length)return;
  const body=document.createElement('div');body.className='portal-compact-body';for(const node of rest)body.append(node);
  const preview=document.createElement('div');preview.className='portal-compact-preview';preview.textContent=compactText(body);
  const actions=document.createElement('div');actions.className='portal-compact-actions';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='portal-compact-toggle';toggle.textContent='Öffnen';toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click',()=>{const open=section.classList.toggle('portal-compact-open');toggle.textContent=open?'Schließen':'Öffnen';toggle.setAttribute('aria-expanded',open?'true':'false');});
  actions.append(toggle);section.classList.add('portal-compact-card');section.append(preview,actions,body);
}
function compactScan(){if(!compactRoot)return;compactRoot.querySelectorAll('.portal-grid > .portal-section').forEach(enhanceSection);}
if(compactRoot){
  let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;compactScan();});};
  // The base portal replaces the root shell as one direct child. Watching nested
  // feature mutations caused every enhancement to wake every other enhancement.
  new MutationObserver(schedule).observe(compactRoot,{childList:true});
  compactScan();
}
