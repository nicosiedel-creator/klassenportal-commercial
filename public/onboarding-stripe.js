const nativeFetch=window.fetch.bind(window);
let checkoutUrl='';
let fallbackTimer=0;

function safeCheckout(value){
  try{const u=new URL(String(value||''));return u.protocol==='https:'&&/\.stripe\.com$/i.test(u.hostname)?u.href:'';}catch{return'';}
}
function go(){
  if(!checkoutUrl)return;
  const target=checkoutUrl;checkoutUrl='';
  if(fallbackTimer)clearTimeout(fallbackTimer);
  location.assign(target);
}

window.fetch=async function(input,init){
  const requestUrl=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
  const method=String(init?.method||(typeof input==='object'&&input?.method)||'GET').toUpperCase();
  const response=await nativeFetch(input,init);
  let path='';try{path=new URL(requestUrl,location.href).pathname;}catch{}

  if(method==='POST'&&/^\/api\/onboarding\/[^/]+$/.test(path)&&response.ok){
    try{
      const data=await response.clone().json();
      const url=safeCheckout(data?.commercial?.checkoutUrl);
      if(url){checkoutUrl=url;fallbackTimer=setTimeout(go,2500);}
    }catch{}
  }

  if(method==='POST'&&path==='/api/auth/login'&&checkoutUrl){
    setTimeout(go,0);
  }
  return response;
};
