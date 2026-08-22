const KP_TEACHER_RUNTIME_PATH=['/dozentenportal','/dozentenportal.html'].includes(location.pathname.replace(/\/$/,''));
if(KP_TEACHER_RUNTIME_PATH){
  const root=document.querySelector('#teacher-portal');
  let courses=null,loading=false,frame=0,lastSignature='';
  async function loadCourses(){
    if(courses!==null||loading)return;
    loading=true;
    try{const r=await fetch('/api/attendance/teacher/courses',{credentials:'same-origin',cache:'no-store'});if(r.status===401)return;if(!r.ok)throw new Error(`HTTP_${r.status}`);courses=(await r.json()).courses||[];}catch{courses=[];}finally{loading=false;}
  }
  function state(){
    const login=Boolean(root?.querySelector('#tp-login'));
    const heading=root?.querySelector('.portal-main>.portal-hero h1')?.textContent?.trim()||'';
    const list=courses||[];
    const course=list.find(c=>String(c.course_name||'').trim()===heading)||null;
    const view=login?'login':course?'dashboard':'courses';
    return{view,courses:list,course};
  }
  function emit(){
    const s=state(),signature=JSON.stringify([s.view,s.course?.course_id||'',s.courses.map(c=>[c.tenant_id,c.course_id,c.course_name])]);
    if(signature===lastSignature)return;lastSignature=signature;window.__KP_TEACHER_STATE=s;window.dispatchEvent(new CustomEvent('kp:teacher-state',{detail:s}));
  }
  async function sync(){
    if(!root)return;
    if(root.querySelector('#tp-login')){courses=null;emit();return;}
    if(courses===null)await loadCourses();
    emit();
  }
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;void sync();});}
  if(root)new MutationObserver(schedule).observe(root,{childList:true});
  window.addEventListener('kp:teacher-refresh-state',()=>{courses=null;lastSignature='';schedule();});
  schedule();
}
