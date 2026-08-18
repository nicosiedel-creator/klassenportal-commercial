const GRADEBOOK_SCALE_PATHS=new Set(['/kunden-admin','/klassen-admin']);
if(GRADEBOOK_SCALE_PATHS.has(location.pathname.replace(/\/$/,''))){
  const legacy='1;92;100\n2;81;91.99\n3;67;80.99';
  const complete='1;92;100\n2;81;91.99\n3;67;80.99\n4;50;66.99\n5;30;49.99\n6;0;29.99';
  const normalized=value=>String(value||'').replace(/\r\n?/g,'\n').trim();
  function upgradeLegacyExample(){
    document.querySelectorAll('#ls-scale textarea[name="items"]').forEach(textarea=>{
      if(normalized(textarea.value)===legacy)textarea.value=complete;
    });
  }
  new MutationObserver(()=>queueMicrotask(upgradeLegacyExample)).observe(document.body,{subtree:true,childList:true});
  upgradeLegacyExample();
}
