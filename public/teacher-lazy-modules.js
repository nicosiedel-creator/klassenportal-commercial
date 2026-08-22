const KP_TEACHER_LAZY_PATH=location.pathname.replace(/\/$/,'')==='/dozentenportal.html';
if(KP_TEACHER_LAZY_PATH){
  const VERSION='20260822-1';
  const GROUPS={
    cards:['teacher-assignment-guidance','teacher-dashboard-ui','teacher-lesson-hub-ui'],
    workspace:['teacher-workspace-ui','teacher-curriculum-ui','teacher-learning-operations-ui','teacher-learning-mode-display','teacher-classbook-export-ui','teacher-operational-insights-ui','teams-management-ui']
  };
  const modulePromises=new Map(),groupPromises=new Map();
  function loadModule(name){if(modulePromises.has(name))return modulePromises.get(name);const p=import(`/${name}.js?v=${VERSION}`).catch(error=>{modulePromises.delete(name);throw error;});modulePromises.set(name,p);return p;}
  async function loadBounded(names){let cursor=0;const workers=Array.from({length:Math.min(2,names.length)},async()=>{while(cursor<names.length){const name=names[cursor++];await loadModule(name);}});await Promise.all(workers);}
  function loadGroup(name){if(groupPromises.has(name))return groupPromises.get(name);const names=GROUPS[name]||[];const p=loadBounded(names).then(()=>window.dispatchEvent(new CustomEvent('kp:teacher-modules-ready',{detail:{group:name}}))).catch(error=>{groupPromises.delete(name);console.error(`Teacher module group ${name} failed`,error);throw error;});groupPromises.set(name,p);return p;}
  function onState(event){const state=event?.detail||window.__KP_TEACHER_STATE||{};if(state.view==='login')return;if(['courses','dashboard'].includes(state.view))void loadGroup('cards');if(state.view==='dashboard')void loadGroup('workspace');}
  window.KPTeacherModules={loadGroup};
  window.addEventListener('kp:teacher-state',onState);
  onState();
}
