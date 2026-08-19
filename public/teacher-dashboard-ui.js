const teacherRoot=document.querySelector('#teacher-portal');
if(teacherRoot){
  function scan(){
    const main=teacherRoot.querySelector('.portal-main');
    if(!main)return;
    const direct=[...main.querySelectorAll(':scope > .portal-section')];
    let mainCard=null,sideCard=null;
    for(const section of direct){
      section.classList.remove('teacher-main-card','teacher-side-card','teacher-wide-card','teacher-main-wide','teacher-login-card');
      if(section.querySelector('#tp-login')){section.classList.add('teacher-login-card');continue;}
      const title=section.querySelector(':scope > .portal-section-head h2,:scope > h2')?.textContent?.trim()||'';
      if(title==='Unterricht & Klassenbuch'){section.classList.add('teacher-main-card');mainCard=section;continue;}
      if(title.startsWith('Abwesenheitsmeldungen')){section.classList.add('teacher-side-card');sideCard=section;continue;}
      if(title==='Anwesenheitsübersicht'){section.classList.add('teacher-wide-card');continue;}
    }
    if(mainCard&&!sideCard)mainCard.classList.add('teacher-main-wide');
    main.querySelectorAll('.portal-grid > .portal-section').forEach(x=>x.classList.add('teacher-course-card'));
  }
  let queued=false;
  const queue=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan();});};
  new MutationObserver(queue).observe(teacherRoot,{childList:true,subtree:true});
  scan();
}
