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
    GRADING_SCALE_STORED_INVALID:'Der gespeicherte Notenschlüssel ist nicht eindeutig oder nicht vollständig. Bitte einen vollständigen Notenschlüssel von 0,00 % bis 100,00 % speichern.',
  };
  const FULL_SCALE_EXAMPLE='1;92;100\n2;81;91.99\n3;67;80.99\n4;50;66.99\n5;30;49.99\n6;0;29.99';
  const clean=v=>String(v??'').trim();
  const round2=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
  const cents=v=>Math.round(round2(v)*100);

  function validateScale(text){
    const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(lines.length<2||lines.length>30)return MESSAGES.GRADING_SCALE_INVALID;
    const items=[];
    for(const line of lines){
      const parts=line.split(';');if(parts.length!==3)return'Jede Zeile muss genau „Note;Minimum;Maximum“ enthalten.';
      const label=clean(parts[0]),min=round2(parts[1]),max=round2(parts[2]);
      if(!label||!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>100||min>max)return MESSAGES.GRADING_SCALE_INVALID;
      items.push({label,min,max});
    }
    if(new Set(items.map(x=>x.label.toLocaleLowerCase('de-DE'))).size!==items.length)return MESSAGES.GRADING_SCALE_LABEL_DUPLICATE;
    items.sort((a,b)=>a.min-b.min||a.max-b.max);
    if(cents(items[0].min)!==0||cents(items.at(-1).max)!==10000)return MESSAGES.GRADING_SCALE_COVERAGE_REQUIRED;
    for(let i=1;i<items.length;i++){
      const prev=cents(items[i-1].max),next=cents(items[i].min);
      if(next<=prev)return MESSAGES.GRADING_SCALE_OVERLAP;
      if(next!==prev+1)return MESSAGES.GRADING_SCALE_GAP;
    }
    return'';
  }

  function validateCategory(form){
    const name=clean(form.elements.name?.value),weight=Number(form.elements.weight?.value);
    if(!name||!Number.isFinite(weight)||weight<0||weight>100)return MESSAGES.CATEGORY_POLICY_INVALID;
    const card=form.closest('.card'),existing=[...(card?.querySelectorAll('.item')||[])];
    const duplicate=existing.some(item=>clean(item.querySelector('strong')?.textContent).toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE'));
    if(duplicate)return MESSAGES.CATEGORY_NAME_DUPLICATE;
    const current=existing.reduce((sum,item)=>{const text=clean(item.querySelector('.muted')?.textContent),match=text.match(/(-?\d+(?:[.,]\d+)?)\s*%/);return sum+(match?Number(match[1].replace(',','.')):0);},0);
    if(current+weight>100.000001)return MESSAGES.CATEGORY_WEIGHT_TOTAL_EXCEEDED;
    return'';
  }

  document.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement))return;
    let message='';
    if(form.id==='ls-cat')message=validateCategory(form);
    if(form.id==='ls-scale')message=validateScale(form.elements.items?.value);
    if(!message)return;
    event.preventDefault();event.stopImmediatePropagation();
    alert(message);
  },true);

  function enhance(){
    document.querySelectorAll('#ls-scale textarea[name="items"]').forEach(textarea=>{
      if(textarea.dataset.gradebookPolicyReady)return;textarea.dataset.gradebookPolicyReady='1';textarea.placeholder=FULL_SCALE_EXAMPLE;
      const note=document.createElement('div');note.className='muted';note.style.marginTop='6px';note.textContent='Vollständig und eindeutig angeben: 0,00–100,00 %, ohne Lücken oder Überschneidungen. Prozentwerte werden auf zwei Nachkommastellen bewertet.';textarea.after(note);
    });
    document.querySelectorAll('.notice.bad').forEach(box=>{const key=clean(box.textContent);if(MESSAGES[key])box.textContent=MESSAGES[key];});
  }
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.body,{subtree:true,childList:true});
  enhance();
}
