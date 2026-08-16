(()=>{
  let me=null,lastTenant='',available=false,checking=false;
  const api=async(url,opt={})=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;};
  const tenantId=()=>document.querySelector('#tenantPick')?.value||'';
  function role(tid){
    if(me?.isPlatformAdmin||me?.supportPlatformAdmin)return'tenant_admin';
    const rank={tenant_admin:4,class_admin:3,participant:2,guest:1};
    return [...(me?.tenantRoles||[]).filter(x=>x.tenantId===tid)].sort((a,b)=>(rank[b.role]||0)-(rank[a.role]||0))[0]?.role||'';
  }
  function remove(){document.querySelector('#kp-stripe-customer-portal')?.remove();}
  async function check(tid){
    if(!tid||checking)return;checking=true;
    try{
      const d=await api(`/api/billing/summary?tenant_id=${encodeURIComponent(tid)}`),p=d.paymentAccount||{};
      available=!!p.stripe_customer_id&&['test','active'].includes(String(d.billingProvider?.status||''));
    }catch{available=false;}
    finally{checking=false;install();}
  }
  function install(){
    const side=document.querySelector('.side'),tid=tenantId();
    if(!side||!tid||role(tid)!=='tenant_admin'){remove();return;}
    if(tid!==lastTenant){lastTenant=tid;available=false;remove();void check(tid);return;}
    if(!available){remove();return;}
    if(side.querySelector('#kp-stripe-customer-portal'))return;
    const b=document.createElement('button');b.className='nav';b.id='kp-stripe-customer-portal';b.textContent='Zahlungsdaten & Rechnungen';
    b.onclick=async()=>{
      b.disabled=true;const old=b.textContent;b.textContent='Stripe wird geöffnet …';
      try{const r=await api(`/api/billing/stripe-portal?tenant_id=${encodeURIComponent(tid)}`,{method:'POST',body:'{}'});if(!r.url)throw new Error('STRIPE_PORTAL_URL_MISSING');location.assign(r.url);}
      catch(e){alert(e.message==='STRIPE_CUSTOMER_NOT_FOUND'?'Für diesen Kunden ist noch kein Stripe-Zahlungskonto vorhanden.':e.message);b.disabled=false;b.textContent=old;}
    };
    const billing=side.querySelector('#kp-commerce-tenant');billing?.after(b)||side.append(b);
  }
  async function init(){
    try{me=(await api('/api/auth/me')).user;if(!me)return;}catch{return;}
    document.addEventListener('change',e=>{if(e.target?.id==='tenantPick'){lastTenant='';available=false;remove();setTimeout(install,0);}});
    install();setInterval(install,1500);
  }
  void init();
})();
