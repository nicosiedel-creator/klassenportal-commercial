const GRADEBOOK_POLICY_PATHS=new Set(['/kunden-admin','/klassen-admin']);
if(GRADEBOOK_POLICY_PATHS.has(location.pathname.replace(/\/$/,''))){
  const MESSAGES={
    CATEGORY_POLICY_INVALID:'Bitte ein gültiges Kategoriengewicht zwischen 0 und 100 % eingeben.',
    CATEGORY_NAME_DUPLICATE:'Diese Kategorie gibt es in diesem Kurs bereits.',
    CATEGORY_WEIGHT_TOTAL_EXCEEDED:'Die Summe aller Kategorien darf 100 % nicht überschreiten.',
    CATEGORY_WEIGHT_TOTAL_INVALID:'Die gespeicherten Kategorien überschreiten zusammen 100 %. Bitte die Gewichtung korrigieren.',
    GRADING_SCALE_INVALID:'Der Notenschlüssel enthält ungültige Angaben.',
    GRADING_SCALE_LABEL_DUPLICATE:'Jede Note/Bewertung darf im Notenschlüssel nur einmal vorkommen.',
    GRADING_SCALE_COVERAGE_REQUIRED:'Der Notenschlüssel muss den gesamten Bereich von 0,00 % bis 100,00 % abdecken.',
    GRADING_SCALE_OVERLAP:'Die Bereiche des Notenschlüssels überschneiden sich. Jeder Prozentwert darf nur einer Note zugeordnet sein.',
    GRADING_SCALE_GAP:'Im Notenschlüssel besteht eine Lücke. Bei zwei Nachkommastellen müssen die Bereiche direkt aufeinander folgen.',
    GRADING_SCALE_STORED_INVALID:'Der gespeicherte Notenschlüssel ist nicht eindeutig oder nicht vollständig. Bitte korrigiere ihn vor dem CSV-Export.',
  };
  const FULL_SCALE_EXAMPLE='1;92;100\n2;81;91.99\n3;67;80.99\n4;50;66.99\n5;30;49.99\n6;0;29.99';
  const clean=v=>String(v??'').trim();
  const number=v=>Number(clean(v).replace(',','.'));
  const round2=v=>Math.round((number(v)+Number.EPSILON)*100)/100;
  const cents=v=>Math.round(round2(v)*100);
  const displayNumber=v=>String(round2(v)).replace('.',',');

  async function api(url,opt={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let data={};
    try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data.error||`HTTP_${response.status}`);return data;
  }
  function messageFor(error){const key=clean(error?.message||error);return MESSAGES[key]||key||'Die Eingabe konnte nicht gespeichert werden.';}
  function statusBox(form){let box=form.querySelector(':scope > .kp-gradebook-policy-status');if(box)return box;box=document.createElement('div');box.className='kp-gradebook-policy-status muted';box.style.marginTop='10px';form.append(box);return box;}
  function showStatus(form,text,kind='muted'){const box=statusBox(form);box.className=`kp-gradebook-policy-status ${kind==='bad'?'notice bad':kind==='ok'?'notice ok':'muted'}`;box.textContent=text;}
  function scopeFromForm(form){
    const root=form.closest('#ls-pane')||form.closest('#ls-work')||document;
    const link=root.querySelector('a[href*="/api/learning-suite/gradebook/export.csv"]');if(!link)return null;
    const url=new URL(link.getAttribute('href')||link.href,location.origin),tenantId=url.searchParams.get('tenant_id')||'',courseId=url.searchParams.get('course_id')||'';
    return tenantId&&courseId?{tenantId,courseId}:null;
  }
  function endpoint(path,scope){return`${path}?tenant_id=${encodeURIComponent(scope.tenantId)}&course_id=${encodeURIComponent(scope.courseId)}`;}
  function refreshGradebook(form){const root=form.closest('#ls-work')||document;const tab=root.querySelector('.ls-tab[data-tab="gradebook"]');if(tab instanceof HTMLElement)tab.click();}

  function categoryState(form){
    const card=form.closest('.card'),existing=[...(card?.querySelectorAll('.item')||[])];
    const current=existing.reduce((sum,item)=>{const text=clean(item.querySelector('.muted')?.textContent),match=text.match(/(-?\d+(?:[.,]\d+)?)\s*%/);return sum+(match?number(match[1]):0);},0);
    const names=new Set(existing.map(item=>clean(item.querySelector('strong')?.textContent).toLocaleLowerCase('de-DE')).filter(Boolean));
    return{current,names};
  }
  function validateCategory(form){
    const name=clean(form.elements.name?.value),weight=number(form.elements.weight?.value),state=categoryState(form);
    if(!name||!Number.isFinite(weight)||weight<0||weight>100)return MESSAGES.CATEGORY_POLICY_INVALID;
    if(state.names.has(name.toLocaleLowerCase('de-DE')))return MESSAGES.CATEGORY_NAME_DUPLICATE;
    if(state.current+weight>100.000001)return MESSAGES.CATEGORY_WEIGHT_TOTAL_EXCEEDED;
    return'';
  }

  function parseScale(text){
    const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(lines.length<2||lines.length>30)return{message:MESSAGES.GRADING_SCALE_INVALID,items:[]};
    const items=[];
    for(const line of lines){
      const parts=line.split(';');if(parts.length!==3)return{message:'Jede Zeile muss genau „Note;Minimum;Maximum“ enthalten.',items:[]};
      const label=clean(parts[0]),min=round2(parts[1]),max=round2(parts[2]);
      if(!label||!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>100||min>max)return{message:MESSAGES.GRADING_SCALE_INVALID,items:[]};
      items.push({label,min_percent:min,max_percent:max});
    }
    if(new Set(items.map(x=>x.label.toLocaleLowerCase('de-DE'))).size!==items.length)return{message:MESSAGES.GRADING_SCALE_LABEL_DUPLICATE,items:[]};
    const ordered=[...items].sort((a,b)=>a.min_percent-b.min_percent||a.max_percent-b.max_percent);
    if(cents(ordered[0].min_percent)!==0||cents(ordered.at(-1).max_percent)!==10000)return{message:MESSAGES.GRADING_SCALE_COVERAGE_REQUIRED,items:[]};
    for(let i=1;i<ordered.length;i++){
      const prev=cents(ordered[i-1].max_percent),next=cents(ordered[i].min_percent);
      if(next<=prev)return{message:MESSAGES.GRADING_SCALE_OVERLAP,items:[]};
      if(next!==prev+1)return{message:MESSAGES.GRADING_SCALE_GAP,items:[]};
    }
    return{message:'',items};
  }

  async function submitCategory(form){
    const validation=validateCategory(form);if(validation)return showStatus(form,validation,'bad');const scope=scopeFromForm(form);if(!scope)return showStatus(form,'Kursbezug konnte nicht ermittelt werden.','bad');
    const weight=number(form.elements.weight.value),drop=Math.trunc(number(form.elements.drop?.value||0));showStatus(form,'Speichert …');
    try{await api(endpoint('/api/learning-suite/gradebook/categories',scope),{method:'PUT',body:JSON.stringify({name:clean(form.elements.name.value),weight_basis_points:Math.round(weight*100),drop_lowest:drop})});showStatus(form,'Kategorie gespeichert.','ok');refreshGradebook(form);}catch(error){showStatus(form,messageFor(error),'bad');}
  }
  async function submitScale(form){
    const parsed=parseScale(form.elements.items?.value),scope=scopeFromForm(form);if(parsed.message)return showStatus(form,parsed.message,'bad');if(!scope)return showStatus(form,'Kursbezug konnte nicht ermittelt werden.','bad');
    const payload={name:clean(form.elements.name?.value),is_default:true,items:parsed.items};if(form.dataset.scaleId)payload.id=form.dataset.scaleId;showStatus(form,'Speichert …');
    try{await api(endpoint('/api/learning-suite/gradebook/scales',scope),{method:'PUT',body:JSON.stringify(payload)});showStatus(form,'Notenschlüssel gespeichert.','ok');refreshGradebook(form);}catch(error){showStatus(form,messageFor(error),'bad');}
  }

  document.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement)||!['ls-cat','ls-scale'].includes(form.id))return;
    event.preventDefault();event.stopImmediatePropagation();
    void(form.id==='ls-cat'?submitCategory(form):submitScale(form));
  },true);

  async function hydrateScale(form){
    if(form.dataset.scaleHydrated)return;form.dataset.scaleHydrated='loading';const scope=scopeFromForm(form);if(!scope){form.dataset.scaleHydrated='';return;}
    try{
      const report=await api(endpoint('/api/learning-suite/gradebook/report',scope)),scale=report.scale;if(!scale){form.dataset.scaleHydrated='1';return;}
      form.dataset.scaleId=String(scale.id||'');if(form.elements.name)form.elements.name.value=scale.name||'Notenschlüssel';
      if(form.elements.items&&Array.isArray(scale.items))form.elements.items.value=scale.items.map(item=>`${item.label};${displayNumber(item.min_percent)};${displayNumber(item.max_percent)}`).join('\n');
      if(scale.valid===false)showStatus(form,MESSAGES.GRADING_SCALE_STORED_INVALID,'bad');form.dataset.scaleHydrated='1';
    }catch(error){form.dataset.scaleHydrated='';const code=clean(error?.message);if(MESSAGES[code])showStatus(form,MESSAGES[code],'bad');}
  }
  function enhance(){
    document.querySelectorAll('#ls-cat').forEach(form=>{if(form.dataset.gradebookPolicyReady)return;form.dataset.gradebookPolicyReady='1';const state=categoryState(form),note=document.createElement('div');note.className='muted';note.style.margin='8px 0';note.textContent=`Bereits gewichtet: ${displayNumber(state.current)} %. Verfügbar: ${displayNumber(Math.max(0,100-state.current))} %.`;form.querySelector('.row')?.after(note);});
    document.querySelectorAll('#ls-scale').forEach(form=>{if(form.dataset.gradebookPolicyReady)return;form.dataset.gradebookPolicyReady='1';const textarea=form.elements.items;if(textarea){textarea.placeholder=FULL_SCALE_EXAMPLE;const note=document.createElement('div');note.className='muted';note.style.marginTop='6px';note.textContent='Vollständig und eindeutig: 0,00–100,00 %, ohne Lücken oder Überschneidungen. Punkt oder Komma sind zulässig; ausgewertet wird auf zwei Nachkommastellen.';textarea.after(note);}void hydrateScale(form);});
    document.querySelectorAll('.notice.bad').forEach(box=>{const key=clean(box.textContent);if(MESSAGES[key])box.textContent=MESSAGES[key];});
  }
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.body,{subtree:true,childList:true});enhance();
}
