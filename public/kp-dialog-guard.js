(()=>{
  const selector='.modal-back,.class-admin-modal-back,.kp-modal-back';
  const panelSelector='.modal,.class-admin-modal,.kp-modal';
  const liveSelector='[role="status"],[role="alert"],[aria-live]';
  const closeSelector='[data-close],.close,.op-close,.class-admin-close,button[id$="-close"],button[id$="-x"]';
  const closeLabel=/^(×|✕|✖|x|schließen|schliessen|abbrechen|zurück)$/i;
  const skipTags=['SCRIPT','LINK','STYLE','TEMPLATE','NOSCRIPT'];
  const focusableSelector='a[href],area[href],button,input,select,textarea,iframe,summary,audio[controls],video[controls],[contenteditable]:not([contenteditable="false"]),[tabindex]';
  const supportsInert='inert' in HTMLElement.prototype;
  const held=new Set();
  let opener=null,armed=null,armedTimer=0,hadOverlay=false;

  function overlays(){return [...document.querySelectorAll(selector)];}
  function topmost(){const all=overlays();return all.length?all[all.length-1]:null;}
  function panelOf(overlay){return overlay.querySelector(panelSelector)||overlay;}

  function closeControl(overlay){
    const panel=panelOf(overlay);
    return panel.querySelector(closeSelector)
      ||[...panel.querySelectorAll('button')].find(b=>closeLabel.test((b.getAttribute('aria-label')||b.textContent||'').trim()))
      ||null;
  }

  /* Every admin dialog announces itself as a dialog and carries a reachable close control,
     no matter which module built it. */
  function describe(overlay){
    const panel=panelOf(overlay);
    if(!panel.getAttribute('role'))panel.setAttribute('role','dialog');
    if(!panel.getAttribute('aria-modal'))panel.setAttribute('aria-modal','true');
    if(!panel.getAttribute('aria-label')&&!panel.getAttribute('aria-labelledby')){
      const heading=(panel.querySelector('h1,h2,h3,h4')?.textContent||'').trim();
      if(heading)panel.setAttribute('aria-label',heading);
    }
    const control=closeControl(overlay);
    if(control&&!control.getAttribute('aria-label')&&!control.getAttribute('aria-labelledby')
      &&!(control.textContent||'').replace(/[×✕✖\sxX]/g,''))control.setAttribute('aria-label','Schließen');
  }

  /* Content behind the dialog stays out of the tab order and out of assistive technology.
     Status and error messages are exempt so their announcements still reach the user. */
  function shield(top){
    const keep=new Set();
    for(const el of document.body.children){
      if(skipTags.includes(el.tagName))continue;
      if(top&&el!==top&&!el.matches(liveSelector)){
        keep.add(el);
        if(supportsInert&&el.inert!==true){el.inert=true;el.dataset.kpInert='1';}
      }
    }
    for(const el of [...held]){
      if(keep.has(el))continue;
      held.delete(el);
      if(el.dataset?.kpInert==='1'){el.inert=false;delete el.dataset.kpInert;}
    }
    for(const el of keep)held.add(el);
  }

  /* Ein Dialog, aus dem der Tabulator herausläuft, lässt den Nutzer hinter einer Abdunklung
     arbeiten, die er nicht sieht. inert hält den Fokus nicht im Dokument, nur aus dem
     Hintergrund heraus - der Umlauf muss deshalb selbst geschlossen werden. */
  function tabbables(panel){
    return [...panel.querySelectorAll(focusableSelector)]
      .filter(el=>!el.disabled&&el.tabIndex>=0&&(el.offsetWidth||el.offsetHeight||el.getClientRects().length));
  }

  function trapTab(event,overlay){
    const panel=panelOf(overlay),list=tabbables(panel);
    if(!list.length){event.preventDefault();focusInside(overlay);return;}
    const first=list[0],last=list[list.length-1],active=document.activeElement;
    const outside=!panel.contains(active)||active===panel;
    if(event.shiftKey?(outside||active===first):(outside&&active!==panel||active===last)){
      event.preventDefault();
      (event.shiftKey?last:first).focus({preventScroll:true});
    }
  }

  function focusInside(overlay){
    const active=document.activeElement;
    if(active&&active!==document.body&&overlay.contains(active))return;
    const panel=panelOf(overlay);
    if(!panel.hasAttribute('tabindex'))panel.setAttribute('tabindex','-1');
    try{panel.focus({preventScroll:true});}catch{}
  }

  function restoreFocus(){
    if(opener&&opener.isConnected&&typeof opener.focus==='function'&&document.activeElement===document.body)
      try{opener.focus({preventScroll:true});}catch{}
  }

  function hint(overlay,text){
    const panel=panelOf(overlay);
    let box=panel.querySelector('[data-kp-close-hint]');
    if(!text){box?.remove();return;}
    if(!box){
      box=document.createElement('div');
      box.dataset.kpCloseHint='';
      box.className='notice';
      box.setAttribute('role','status');
      box.setAttribute('aria-live','polite');
      const head=panel.querySelector(':scope > .top,:scope > .class-admin-modal-head');
      if(head)head.after(box);else panel.prepend(box);
    }
    box.textContent=text;
  }

  /* Escape must never silently discard typed input, so a dialog the user has typed into
     asks for a second Escape first. Only real keystrokes count: modules seed fields
     programmatically, and that must not look like unsaved work. */
  const edited=new WeakSet();
  function markEdited(event){
    if(!event.isTrusted)return;
    const overlay=event.target instanceof Element?event.target.closest(selector):null;
    if(overlay)edited.add(overlay);
  }
  document.addEventListener('input',markEdited,true);
  document.addEventListener('change',markEdited,true);
  document.addEventListener('reset',event=>{
    const overlay=event.target instanceof Element?event.target.closest(selector):null;
    if(overlay)edited.delete(overlay);
  },true);
  function hasUnsavedInput(overlay){return edited.has(overlay);}

  function disarm(){armed=null;clearTimeout(armedTimer);}

  function requestClose(overlay){
    const control=closeControl(overlay);
    if(control)control.click();
    if(overlay.isConnected)overlay.remove();
  }

  function normalize(){
    for(const el of overlays())if(el.parentElement!==document.body)document.body.append(el);
    const open=overlays();
    const top=open.length?open[open.length-1]:null;
    document.body.classList.toggle('kp-admin-modal-open',open.length>0);
    if(armed&&!armed.isConnected)disarm();
    shield(top);
    if(top){for(const overlay of open)describe(overlay);focusInside(top);}
    else if(hadOverlay)restoreFocus();
    hadOverlay=!!top;
  }

  document.addEventListener('focusin',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const top=topmost();
    if(!top){if(!target.closest(selector))opener=target;return;}
    if(top.contains(target)||target.closest(liveSelector))return;
    focusInside(top);
  },true);

  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.isComposing)return;
    const top=topmost();
    if(!top)return;
    if(event.key==='Tab'){trapTab(event,top);return;}
    if(event.key!=='Escape')return;
    if(armed!==top&&hasUnsavedInput(top)){
      armed=top;
      clearTimeout(armedTimer);
      armedTimer=setTimeout(()=>{if(armed===top)hint(top,'');disarm();},6000);
      hint(top,'Zum Schließen erneut Esc drücken. Nicht gespeicherte Eingaben gehen dabei verloren.');
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    disarm();
    requestClose(top);
    event.preventDefault();
  },true);

  const observer=new MutationObserver(normalize);
  const start=()=>{normalize();observer.observe(document.documentElement,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
