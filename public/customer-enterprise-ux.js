if(location.pathname.replace(/\/$/,'')==='/kunden-admin'){
  const humanField=f=>({resource_id:'Raum/Ressource',teacher_id:'Dozent',course_id:'Kurs',exam_id:'Prüfung',date:'Datum',new_date:'neues Datum',new_time:'neue Uhrzeit',scenario_type:'Vorgang'})[f]||String(f).replace(/_id$/,'').replaceAll('_',' ');
  let paneObserver=null,observedPane=null,frame=0;

  function humanizeIntentPane(pane=document.querySelector('[data-pane-body="intent"]')){
    if(!pane)return;
    const result=pane.querySelector('[data-intent-result]');if(!result)return;
    result.querySelectorAll('.eo-os-note.warn').forEach(n=>{
      const text=n.textContent||'';
      if(text.trim().startsWith('Fehlt:')){
        const raw=text.split(':').slice(1).join(':').split(',').map(x=>x.trim()).filter(Boolean),labels=raw.map(humanField);
        n.innerHTML=`<strong>Noch eine Angabe nötig</strong><div class="eo-os-small">${labels.join(', ')} konnte nicht eindeutig zugeordnet werden. Verwende Namen oder Bezeichnungen statt technischer IDs.</div>`;
        n.classList.add('kp-intent-blocked');
      }
    });
    result.querySelectorAll('.eo-os-small').forEach(n=>{
      const current=n.textContent||'';
      const next=current.replace(/resource_id/g,'Raum/Ressource').replace(/teacher_id/g,'Dozent').replace(/course_id/g,'Kurs').replace(/exam_id/g,'Prüfung');
      if(next!==current)n.textContent=next;
    });
    const simulate=pane.querySelector('[data-simulate]');
    if(simulate&&!pane.querySelector('.kp-intent-human-help')){
      const help=document.createElement('div');help.className='kp-intent-human-help';help.innerHTML='<strong>Was jetzt passiert:</strong> Personen, Räume, Kurse und Zeiträume werden gegen die echten Mandantendaten aufgelöst. Danach prüft die Simulation betroffene Termine, Konflikte und sichere Alternativen. Es wird noch nichts produktiv geändert.';simulate.closest('.eo-os-card')?.append(help);
    }
    if(simulate){const title=simulate.disabled?'Sobald alle Angaben eindeutig aufgelöst sind, kann die Simulation berechnet werden.':'Berechnet Auswirkungen und Alternativen, ohne Produktivdaten zu ändern.';if(simulate.title!==title)simulate.title=title;}
  }

  function schedulePane(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;humanizeIntentPane(observedPane);});}
  function bindIntentPane(){
    const pane=document.querySelector('[data-pane-body="intent"]');
    if(pane===observedPane){humanizeIntentPane(pane);return;}
    paneObserver?.disconnect();paneObserver=null;observedPane=pane;
    if(!pane)return;
    paneObserver=new MutationObserver(ms=>{if(ms.some(m=>m.addedNodes.length||m.removedNodes.length||m.type==='characterData'))schedulePane();});
    paneObserver.observe(pane,{childList:true,subtree:true,characterData:true});
    humanizeIntentPane(pane);
  }

  window.addEventListener('kp:customer-view-changed',bindIntentPane);
  window.addEventListener('kp:customer-modules-group-ready',bindIntentPane);
  bindIntentPane();
}
