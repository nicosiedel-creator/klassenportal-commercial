const CUSTOMER_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(CUSTOMER_PATH){
  const groups=[
    [
      '/class-role-ui.js?v=20260816-14','/commerce-safe-ui.js?v=20260816-14','/billing-addons-ui.js?v=20260816-14','/area-mode.js?v=20260816-14',
      '/enterprise-admin-ui.js?v=20260817-1','/responsibility-ui.js?v=20260817-1','/participant-import-ui.js?v=20260817-1','/organization-import-ui.js?v=20260819-1'
    ],
    [
      '/intake-center-ui.js?v=20260817-1','/intake-quick-upload-ui.js?v=20260818-1','/communication-admin-ui.js?v=20260818-1','/teacher-message-admin-ui.js?v=20260819-1',
      '/teacher-assignment-ui.js?v=20260819-1','/exam-documentation-admin-ui.js?v=20260819-1','/department-lead-admin-ui.js?v=20260819-1','/planning-resource-ui.js?v=20260820-1'
    ],
    [
      '/planning-resource-suggestion-fix.js?v=20260820-1','/education-operations-admin-ui.js?v=20260819-1','/education-operations-extended-ui.js?v=20260819-1','/education-signature-compose-ui.js?v=20260819-1',
      '/education-os-ui.js?v=20260819-3','/education-os-readiness-ui.js?v=20260819-2','/education-os-innovation-ui.js?v=20260819-2','/assignment-gradebook-ui.js?v=20260818-1'
    ],
    [
      '/learning-report-collab-admin-ui.js?v=20260820-1','/gradebook-policy-ui.js?v=20260818-2','/gradebook-default-scale-ui.js?v=20260818-1','/participant-360-ui.js?v=20260818-1',
      '/certificate-workflow-ui.js?v=20260818-1','/stripe-customer-portal-ui.js?v=20260816-14','/class-portal-admin-ui.js?v=20260816-14','/materials-admin-ui.js?v=20260816-14'
    ],
    [
      '/operational-crud-ui.js?v=20260816-14','/module-catalog-ui.js?v=20260816-14','/module-cancellation-ui.js?v=20260816-14','/custom-domain-ui.js?v=20260816-14',
      '/advanced-module-ui.js?v=20260816-14','/teams-management-ui.js?v=20260820-1','/legal-footer-ui.js?v=20260816-14'
    ]
  ];

  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  const waitForShell=()=>new Promise(resolve=>{
    if(document.querySelector('.layout,.content,#tenantPick')){resolve();return;}
    const observer=new MutationObserver(()=>{if(document.querySelector('.layout,.content,#tenantPick')){observer.disconnect();resolve();}});
    observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
    setTimeout(()=>{observer.disconnect();resolve();},2500);
  });
  const loadGroup=async group=>{
    await Promise.allSettled(group.map(src=>import(src)));
    window.dispatchEvent(new CustomEvent('kp:customer-modules-loaded'));
    await nextFrame();
  };
  const run=async()=>{
    await waitForShell();
    await nextFrame();
    for(const group of groups)await loadGroup(group);
  };
  if('requestIdleCallback'in window)requestIdleCallback(()=>void run(),{timeout:350});
  else setTimeout(()=>void run(),80);
}
