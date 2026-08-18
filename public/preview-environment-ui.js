(()=>{
  const host=location.hostname.toLowerCase();
  const preview=host.endsWith('.workers.dev')||host.endsWith('.pages.dev')||host==='localhost'||host==='127.0.0.1';
  if(!preview)return;

  document.documentElement.dataset.kpEnvironment='preview';
  if(!document.title.startsWith('VORSCHAU · '))document.title=`VORSCHAU · ${document.title}`;

  const style=document.createElement('style');
  style.textContent='.kp-preview-environment{box-sizing:border-box;width:100%;padding:8px 14px;background:#fff7ed;border-bottom:1px solid #fed7aa;color:#9a3412;font:700 12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;letter-spacing:.01em}.kp-preview-environment strong{font-weight:850}.kp-preview-environment code{font:700 11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#ffedd5;border-radius:5px;padding:2px 5px}.kp-preview-environment[data-state="unverified"]{background:#fef2f2;border-color:#fecaca;color:#991b1b}';
  document.head.append(style);

  const banner=document.createElement('div');banner.className='kp-preview-environment';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');banner.dataset.state='loading';banner.textContent='Vorschau · nicht Produktion · Build-Stand wird geprüft …';
  document.body.prepend(banner);

  const render=(meta)=>{
    const branch=String(meta?.branch||'').trim(),commit=String(meta?.commit||'').trim(),short=commit?commit.slice(0,10):'';
    banner.replaceChildren();
    const strong=document.createElement('strong');strong.textContent=branch&&branch!=='main'?'BRANCH-VORSCHAU':'BUILD-VORSCHAU';banner.append(strong,document.createTextNode(' · nicht Produktion'));
    if(branch)banner.append(document.createTextNode(' · Branch '),Object.assign(document.createElement('code'),{textContent:branch}));
    if(short)banner.append(document.createTextNode(' · Commit '),Object.assign(document.createElement('code'),{textContent:short}));
    banner.dataset.state=commit?'verified':'unverified';
    if(!commit)banner.append(document.createTextNode(' · Build-Stand nicht verifiziert'));
  };

  fetch('/build-meta.json',{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(render).catch(()=>render(null));
})();
