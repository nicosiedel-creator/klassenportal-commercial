const exact=new Map(Object.entries({
  'tenant_admin':'Kunden-Admin',
  'class_admin':'Klassenverantwortliche/r (z. B. Klassensprecher)',
  'Klassen-Admin':'Klassenverantwortliche/r (z. B. Klassensprecher)',
  'participant':'Teilnehmer/in',
  'guest':'Gast',
  'platform_admin':'Plattform-Admin',
  'login':'Anmeldung erforderlich',
  'public':'Öffentlich',
  'link_code':'Link / Zugangscode',
  'hybrid':'Anmeldung oder Zugangscode',
  'active':'Aktiv',
  'disabled':'Deaktiviert',
  'suspended':'Gesperrt',
  'ended':'Beendet',
  'deleting':'Wird gelöscht',
  'trial':'Testphase',
  'past_due':'Zahlung überfällig',
  'cancelled':'Gekündigt',
  'starter':'Starter',
  'provider':'Bildungsträger',
  'white_label':'White-Label',
  'homework':'Hausaufgaben / Aufgaben',
  'appointments':'Termine',
  'announcements':'Meldungen / Informationen',
  'links':'Links',
  'lessons':'Stundenplan / Unterricht',
  'exams':'Prüfungen',
  'learning_progress':'Lernfortschritt',
  'personal_grades':'Persönliche Noten',
  'materials':'Materialien',
  'surveys':'Umfragen',
  'substitution':'Vertretungen',
  'teams':'Microsoft Teams',
  'm365':'Microsoft 365',
  'statistics':'Statistiken'
}));

function localize(root=document){
  root.querySelectorAll?.('option,td,.pill,strong,.muted').forEach(el=>{
    if(el.children.length)return;
    const t=el.textContent?.trim();
    if(t&&exact.has(t))el.textContent=exact.get(t);
  });
}

new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)localize(n);}).observe(document.documentElement,{subtree:true,childList:true});
localize();
