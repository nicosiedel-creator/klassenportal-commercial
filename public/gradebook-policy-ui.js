const GRADEBOOK_POLICY_PATHS=new Set(['/kunden-admin','/klassen-admin']);
if(GRADEBOOK_POLICY_PATHS.has(location.pathname.replace(/\/$/,''))){
  const MESSAGES={
    CATEGORY_POLICY_INVALID:'Bitte ein gültiges Kategoriengewicht zwischen 0 und 100 % eingeben.',
    CATEGORY_NAME_DUPLICATE:'Diese Kategorie gibt es in diesem Kurs bereits.',
    CATEGORY_RENAME_NOT_ALLOWED:'Der Kategoriename bleibt beim Bearbeiten unverändert, damit vorhandene Bewertungen sicher zugeordnet bleiben.',
    CATEGORY_WEIGHT_TOTAL_EXCEEDED:'Die Summe aller Kategorien darf 100 % nicht überschreiten.',
    CATEGORY_WEIGHT_TOTAL_INVALID:'Die gespeicherten Kategorien überschreiten zusammen 100 %. Bitte reduziere die Gewichtung bestehender Kategorien.',
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
    const domTotal=existing.reduce((sum,item)=>{const text=clean(item.querySelector('.muted')?.textContent),match=text.match(/(-?\d+(?:[.,]\d+)?)\s*%/);return sum+(match?number(match[1]):0);},0);
    const storedTotal=number(form.dataset.categoryTotal),current=Number.isFinite(storedTotal)&&form.dataset.categoryTotal!==''?storedTotal:domTotal;
    const originalWeight=form.dataset.categoryId?number(form.dataset.categoryOriginalWeight||0):0;
    const names=new Set(existing.map(item=>clean(item.querySelector('strong')?.textContent).toLocaleLowerCase('de-DE')).filter(Boolean));
    return{current,currentExcludingEdit:Math.max(0,current-originalWeight),names,originalName:clean(form.dataset.categoryOriginalName).toLocaleLowerCase('de-DE')};
  }
  function validateCategory(form){
    const name=clean(form.elements.name?.value),weight=number(form.elements.weight?.value),state=categoryState(form),normalized=name.toLocaleLowerCase('de-DE');
    if(!name||!Number.isFinite(weight)||weight<0||weight>100)return MESSAGES.CATEGORY_POLICY_INVALID;
    if(state.names.has(normalized)&&normalized!==state.originalName)return MESSAGES.CATEGORY_NAME_DUPLICATE;
    if(state.currentExcludingEdit+weight>100.000001)return MESSAGES.CATEGORY_WEIGHT_TOTAL_EXCEEDED;
    return'';
  }
  function resetCategoryEdit(form){
    delete form.dataset.categoryId;delete form.dataset.categoryOriginalName;delete form.dataset.categoryOriginalWeight;
    if(form.elements.name){form.elements.name.readOnly=false;form.elements.name.value='';}if(form.elements.weight)form.elements.weight.value='0';if(form.elements.drop)form.elements.drop.value='0';
    const submit=form.querySelector('button[type="submit"]');if(submit)submit.textContent='Kategorie speichern';const cancel=form.querySelector('.kp-category-edit-cancel');if(cancel)cancel.hidden=true;const box=form.querySelector('.kp-gradebook-policy-status');if(box)box.remove();
  }
  function beginCategoryEdit(form,category){
    form.dataset.categoryId=String(category.id);form.dataset.categoryOriginalName=String(category.name);form.dataset.categoryOriginalWeight=String(Number(category.weight_basis_points||0)/100);
    if(form.elements.name){form.elements.name.value=category.name;form.elements.name.readOnly=true;}if(form.elements.weight)form.elements.weight.value=String(Number(category.weight_basis_points||0)/100);if(form.elements.drop)form.elements.drop.value=String(Number(category.drop_lowest||0));
    const submit=form.querySelector('button[type="submit"]');if(submit)submit.textContent='Kategorie aktualisieren';const cancel=form.querySelector('.kp-category-edit-cancel');if(cancel)cancel.hidden=false;showStatus(form,'Bearbeitungsmodus: Name bleibt zum Schutz vorhandener Zuordnungen unverändert.');form.scrollIntoView({block:'nearest'});
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
    const weight=number(form.elements.weight.value),drop=Math.trunc(number(form.elements.drop?.value||0)),payload={name:clean(form.elements.name.value),weight_basis_points:Math.round(weight*100),drop_lowest:drop};if(form.dataset.categoryId)payload.id=form.dataset.categoryId;showStatus(form,'Speichert …');
    try{await api(endpoint('/api/learning-suite/gradebook/categories',scope),{method:'PUT',body:JSON.stringify(payload)});showStatus(form,'Kategorie gespeichert.','ok');refreshGradebook(form);}catch(error){showStatus(form,messageFor(error),'bad');}
  }
  async function submitScale(form){
    const parsed=parseScale(form.elements.items?.value),scope=scopeFromForm(form);if(parsed.message)return showStatus(form,parsed.message,'bad');if(!scope)return showStatus(form,'Kursbezug konnte nicht ermittelt werden.','bad');
    const payload={name:clean(form.elements.name?.value),is_default:true,items:parsed.items};if(form.dataset.scaleId)payload.id=form.dataset.scaleId;showStatus(form,'Speichert …');
    try{await api(endpoint('/api/learning-suite/gradebook/scales',scope),{method:'PUT',body:JSON.stringify(payload)});showStatus(form,'Notenschlüssel gespeichert.','ok');refreshGradebook(form);}catch(error){showStatus(form,messageFor(error),'bad');}
  }

  document.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement)||!['ls-cat','ls-scale'].includes(form.id))return;
    event.preventDefault();event.stopImmediatePropagation();void(form.id==='ls-cat'?submitCategory(form):submitScale(form));
  },true);

  async function hydrateCategories(form){
    if(form.dataset.categoriesHydrated)return;form.dataset.categoriesHydrated='loading';const scope=scopeFromForm(form);if(!scope){form.dataset.categoriesHydrated='';return;}
    try{
      const data=await api(endpoint('/api/learning-suite/gradebook',scope)),categories=Array.isArray(data.categories)?data.categories:[],total=Number(data.policy?.category_weight_basis_points??categories.reduce((sum,c)=>sum+Number(c.weight_basis_points||0),0))/100;
      form.dataset.categoryTotal=String(total);const note=form.querySelector('.kp-category-weight-note');if(note)note.textContent=`Bereits gewichtet: ${displayNumber(total)} %. Verfügbar: ${displayNumber(Math.max(0,100-total))} %.`;
      if(data.policy?.category_weight_valid===false)showStatus(form,MESSAGES.CATEGORY_WEIGHT_TOTAL_INVALID,'bad');
      const card=form.closest('.card'),items=[...(card?.querySelectorAll('.item')||[])];for(const category of categories){const item=items.find(x=>clean(x.querySelector('strong')?.textContent)===clean(category.name));if(!item||item.querySelector('.kp-category-edit'))continue;const button=document.createElement('button');button.type='button';button.className='btn secondary kp-category-edit';button.style.marginTop='8px';button.textContent='Bearbeiten';button.addEventListener('click',()=>beginCategoryEdit(form,category));item.append(button);}
      form.dataset.categoriesHydrated='1';
    }catch(error){form.dataset.categoriesHydrated='';const code=clean(error?.message);if(MESSAGES[code])showStatus(form,MESSAGES[code],'bad');}
  }
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
    document.querySelectorAll('#ls-cat').forEach(form=>{if(form.dataset.gradebookPolicyReady)return;form.dataset.gradebookPolicyReady='1';const state=categoryState(form),note=document.createElement('div');note.className='muted kp-category-weight-note';note.style.margin='8px 0';note.textContent=`Bereits gewichtet: ${displayNumber(state.current)} %. Verfügbar: ${displayNumber(Math.max(0,100-state.current))} %.`;form.querySelector('.row')?.after(note);const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary kp-category-edit-cancel';cancel.hidden=true;cancel.style.marginLeft='8px';cancel.textContent='Bearbeiten abbrechen';cancel.addEventListener('click',()=>resetCategoryEdit(form));form.querySelector('button[type="submit"]')?.after(cancel);void hydrateCategories(form);});
    document.querySelectorAll('#ls-scale').forEach(form=>{if(form.dataset.gradebookPolicyReady)return;form.dataset.gradebookPolicyReady='1';const textarea=form.elements.items;if(textarea){textarea.placeholder=FULL_SCALE_EXAMPLE;const note=document.createElement('div');note.className='muted';note.style.marginTop='6px';note.textContent='Vollständig und eindeutig: 0,00–100,00 %, ohne Lücken oder Überschneidungen. Punkt oder Komma sind zulässig; ausgewertet wird auf zwei Nachkommastellen.';textarea.after(note);}void hydrateScale(form);});
    document.querySelectorAll('.notice.bad').forEach(box=>{const key=clean(box.textContent);if(MESSAGES[key])box.textContent=MESSAGES[key];});
  }
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.body,{subtree:true,childList:true});enhance();
}
