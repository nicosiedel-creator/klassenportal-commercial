const H=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function clamp(v,min=0,max=1){return Math.max(min,Math.min(max,v));}
function hex(r,g,b){return '#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');}
function rgb(hexValue){const x=hexValue.replace('#','');return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)];}
function rgbToHsl([r,g,b]){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);if(h<0)h+=360;}return[h,s,l];}
function hslToRgb([h,s,l]){h=((h%360)+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let a=[0,0,0];if(h<60)a=[c,x,0];else if(h<120)a=[x,c,0];else if(h<180)a=[0,c,x];else if(h<240)a=[0,x,c];else if(h<300)a=[x,0,c];else a=[c,0,x];return a.map(v=>(v+m)*255);}
function tune(color,{h=0,s=0,l=0,sm=1}={}){const x=rgbToHsl(rgb(color));return hex(...hslToRgb([x[0]+h,clamp(x[1]*sm+s),clamp(x[2]+l)]));}
function distance(a,b){const A=rgb(a),B=rgb(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2]);}
function luminance(color){const vals=rgb(color).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*vals[0]+.7152*vals[1]+.0722*vals[2];}
function textOn(bg){return luminance(bg)>.42?'#0f172a':'#ffffff';}

async function bitmapFromFile(file){
  if('createImageBitmap' in window){try{return await createImageBitmap(file);}catch{}}
  return await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('LOGO_LESEN_FEHLGESCHLAGEN'))};img.src=url;});
}

async function colorsFromLogo(file){
  const image=await bitmapFromFile(file),w=image.width||image.naturalWidth,h=image.height||image.naturalHeight;
  const max=180,scale=Math.min(1,max/Math.max(w,h)),cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale));
  const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,cw,ch);ctx.drawImage(image,0,0,cw,ch);
  const data=ctx.getImageData(0,0,cw,ch).data,bins=new Map();
  for(let i=0;i<data.length;i+=16){const a=data[i+3];if(a<150)continue;const r=data[i],g=data[i+1],b=data[i+2];const maxc=Math.max(r,g,b),minc=Math.min(r,g,b);if(maxc>248&&minc>248)continue;const qr=Math.round(r/24)*24,qg=Math.round(g/24)*24,qb=Math.round(b/24)*24,key=`${Math.min(qr,255)},${Math.min(qg,255)},${Math.min(qb,255)}`;bins.set(key,(bins.get(key)||0)+1);}
  let candidates=[...bins.entries()].sort((a,b)=>b[1]-a[1]).map(([k,count])=>{const c='#'+k.split(',').map(v=>Number(v).toString(16).padStart(2,'0')).join('');const [,s,l]=rgbToHsl(rgb(c));return{c,count,s,l};});
  if(!candidates.length)candidates=[{c:'#2563eb',count:1,s:.8,l:.5}];
  const colorful=candidates.filter(x=>x.s>.18&&x.l>.08&&x.l<.92);
  const primary=(colorful[0]||candidates.find(x=>x.l<.9)||candidates[0]).c;
  const second=(colorful.find(x=>x.c!==primary&&distance(x.c,primary)>95)||candidates.find(x=>x.c!==primary&&distance(x.c,primary)>110))?.c||tune(primary,{h:35,l:-.12});
  const [ph,ps,pl]=rgbToHsl(rgb(primary));
  const complementary=hex(...hslToRgb([ph+180,Math.max(.48,ps),pl<.45?.55:.42]));
  return [
    {name:'Originalgetreu',primary,secondary:second,background:tune(primary,{s:-.32,l:.44,sm:.35})},
    {name:'Modern',primary:tune(primary,{s:.05,l:-.03}),secondary:tune(primary,{h:32,s:.08,l:-.14}),background:tune(primary,{s:-.38,l:.47,sm:.25})},
    {name:'Kontrastreich',primary,secondary:complementary,background:luminance(primary)>.56?'#0f172a':'#ffffff'},
  ];
}

function currentTenant(){return document.querySelector('#tenantPick')?.value||'';}
function setColor(form,name,value){const el=form.querySelector(`[name="${name}"]`);if(el){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}
function addBackgroundField(form){if(form.querySelector('[name="background_color"]'))return;const primary=form.querySelector('[name="primary_color"]')?.closest('.row');if(!primary)return;const label=document.createElement('label');label.className='field';label.innerHTML='Hintergrundfarbe<input name="background_color" value="#f8fafc">';primary.after(label);}
function updateLive(form,box){const p=form.querySelector('[name="primary_color"]')?.value||'#2563eb',s=form.querySelector('[name="secondary_color"]')?.value||'#0f172a',b=form.querySelector('[name="background_color"]')?.value||'#f8fafc';box.style.background=b;box.style.color=textOn(b);box.querySelector('.brand-preview-head').style.background=p;box.querySelector('.brand-preview-head').style.color=textOn(p);box.querySelector('.brand-preview-button').style.background=s;box.querySelector('.brand-preview-button').style.color=textOn(s);}

function paletteCard(p,i){return `<button type="button" class="branding-palette" data-palette="${i}" style="text-align:left;border:1px solid #cbd5e1;border-radius:12px;padding:12px;background:#fff;cursor:pointer"><strong>${H(p.name)}</strong><div style="display:flex;gap:6px;margin-top:8px"><span style="height:24px;flex:1;border-radius:6px;background:${p.primary}"></span><span style="height:24px;flex:1;border-radius:6px;background:${p.secondary}"></span><span style="height:24px;flex:1;border:1px solid #e2e8f0;border-radius:6px;background:${p.background}"></span></div><small style="color:#64748b">${p.primary} · ${p.secondary} · ${p.background}</small></button>`;}

function enhanceBranding(){
  const form=document.querySelector('#brand');if(!form||form.dataset.logoAssistent==='1')return;form.dataset.logoAssistent='1';addBackgroundField(form);
  const logoInput=form.querySelector('[name="logo_url"]');const logoLabel=logoInput?.closest('label');if(logoLabel)logoLabel.style.display='none';
  const wrap=document.createElement('section');wrap.style.cssText='border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:0 0 18px;background:#f8fafc';
  wrap.innerHTML=`<h3 style="margin-top:0">Logo & automatische Farben</h3><p class="muted">Logo auswählen. Das Portal erkennt die Markenfarben direkt im Browser und erstellt drei Vorschläge. PNG, JPG, WebP und SVG bis 5 MB.</p><label class="field">Logo auswählen<input id="branding-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><div id="branding-logo-current"></div><div id="branding-palettes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0"></div><div id="branding-live" style="display:none;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;margin:12px 0"><div class="brand-preview-head" style="padding:12px;font-weight:700">Portalvorschau</div><div style="padding:16px"><div>Willkommen im Lernportal</div><button type="button" class="brand-preview-button" style="border:0;border-radius:8px;padding:8px 12px;margin-top:10px">Beispiel-Schaltfläche</button></div></div><button type="button" class="btn" id="branding-apply" disabled>Logo & Farben übernehmen</button><p id="branding-msg" class="muted" style="margin-bottom:0"></p>`;
  form.prepend(wrap);
  if(logoInput?.value)wrap.querySelector('#branding-logo-current').innerHTML=`<div class="muted" style="margin:8px 0">Aktuelles Logo</div><img src="${H(logoInput.value)}" alt="Aktuelles Logo" style="max-width:220px;max-height:100px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px">`;
  const fileEl=wrap.querySelector('#branding-logo-file'),palettesEl=wrap.querySelector('#branding-palettes'),apply=wrap.querySelector('#branding-apply'),msg=wrap.querySelector('#branding-msg'),live=wrap.querySelector('#branding-live');let file=null,palettes=[];
  const colorInputs=['primary_color','secondary_color','background_color'].map(n=>form.querySelector(`[name="${n}"]`)).filter(Boolean);colorInputs.forEach(x=>x.addEventListener('input',()=>{live.style.display='block';updateLive(form,live)}));
  fileEl.addEventListener('change',async()=>{file=fileEl.files?.[0]||null;palettesEl.innerHTML='';apply.disabled=true;if(!file)return;if(file.size>5*1024*1024){msg.textContent='Das Logo ist größer als 5 MB.';return;}msg.textContent='Farben werden aus dem Logo ermittelt …';try{palettes=await colorsFromLogo(file);palettesEl.innerHTML=palettes.map(paletteCard).join('');wrap.querySelectorAll('.branding-palette').forEach(b=>b.addEventListener('click',()=>{const p=palettes[Number(b.dataset.palette)];setColor(form,'primary_color',p.primary);setColor(form,'secondary_color',p.secondary);setColor(form,'background_color',p.background);wrap.querySelectorAll('.branding-palette').forEach(x=>x.style.outline='');b.style.outline='3px solid #2563eb';live.style.display='block';updateLive(form,live)}));wrap.querySelector('.branding-palette')?.click();apply.disabled=false;msg.textContent='Drei Farbvorschläge wurden erstellt. Du kannst einen wählen oder die Farben darunter manuell ändern.';}catch(e){msg.textContent='Die Farben konnten aus diesem Logo nicht automatisch gelesen werden. Das Logo kann trotzdem hochgeladen und die Farben können manuell gewählt werden.';apply.disabled=false;live.style.display='block';updateLive(form,live);}});
  apply.addEventListener('click',async()=>{const tenant=currentTenant();if(!tenant){msg.textContent='Kein Bildungsträger ausgewählt.';return;}if(!file){msg.textContent='Bitte zuerst ein Logo auswählen.';return;}apply.disabled=true;msg.textContent='Logo und Branding werden gespeichert …';try{const fd=new FormData();fd.append('logo',file);const up=await fetch(`/api/tenant/logo?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',credentials:'same-origin',body:fd});const uj=await up.json().catch(()=>({}));if(!up.ok)throw new Error(uj.error||`HTTP_${up.status}`);if(logoInput)logoInput.value=uj.logo_url;const values=Object.fromEntries(new FormData(form));const save=await fetch(`/api/tenant/settings?tenant_id=${encodeURIComponent(tenant)}`,{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(values)});const sj=await save.json().catch(()=>({}));if(!save.ok)throw new Error(sj.error||`HTTP_${save.status}`);wrap.querySelector('#branding-logo-current').innerHTML=`<div class="muted" style="margin:8px 0">Aktuelles Logo</div><img src="${H(uj.logo_url)}" alt="Aktuelles Logo" style="max-width:220px;max-height:100px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px">`;msg.textContent='Logo und Farben wurden gespeichert.';}catch(e){const map={LOGO_FORMAT_INVALID:'Dieses Bildformat wird nicht unterstützt.',LOGO_TOO_LARGE:'Das Logo ist größer als 5 MB.',LOGO_REQUIRED:'Bitte ein Logo auswählen.',FORBIDDEN_ROLE:'Nur der Kunden-Admin darf das Branding ändern.'};msg.textContent=map[e.message]||e.message;}finally{apply.disabled=false;}});
}

const observer=new MutationObserver(enhanceBranding);observer.observe(document.documentElement,{subtree:true,childList:true});enhanceBranding();
