const ONBOARDING_PATH=location.pathname.startsWith('/einrichtung/');
const CUSTOMER_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const templates={
  organisation:{
    file:'organisation.csv',
    label:'Vorlage Organisation / Organigramm',
    content:'external_id;parent_external_id;type;name;code;course_code;course_name;responsible_name;responsible_email;profile\nORG-001;;standort;Beispielstandort;ST-01;;;Alex Beispiel;alex.beispiel@example.invalid;admin\nORG-002;ORG-001;bereich;Fachbereich Verwaltung;FB-VW;VFA-01;Verwaltung 01;Sam Beispiel;sam.beispiel@example.invalid;manager\n'
  },
  participants:{
    file:'teilnehmer.csv',
    label:'Vorlage Teilnehmer / Schüler',
    content:'Vorname;Nachname;E-Mail;Teilnehmernummer;Klasse;Klassencode;Beginn;Ende\nKim;Beispiel;kim.beispiel@example.invalid;TN-0001;Verwaltung 01;VFA-01;2026-09-01;2027-08-31\n'
  },
  timetable:{
    file:'stundenplan.csv',
    label:'Vorlage Stundenplan',
    content:'Klasse;Datum;Beginn;Ende;Fach;Fachkürzel;Dozent;Raum;Unterricht;Hinweise\nVerwaltung 01;2026-09-01;08:15;09:45;Allgemeines Verwaltungsrecht;AVR;Alex Beispiel;R101;Präsenz;Einführung\n'
  }
};

function downloadTemplate(key){
  const t=templates[key];if(!t)return;
  const blob=new Blob(['\ufeff'+t.content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=t.file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function checklistHtml(customer=false){
  const action=(view,label,extra='')=>customer?`<button type="button" class="btn secondary kp-prep-go" data-view="${E(view)}" ${extra}>${E(label)}</button>`:'';
  return `<section id="kp-setup-preparation" class="card" style="margin-top:16px">
    <div class="top"><div><h3 style="margin:0">Einrichtung vorbereiten</h3><div class="muted">Je vollständiger diese Unterlagen vorliegen, desto mehr kann das Portal automatisch einlesen.</div></div><span class="pill">Self-Service</span></div>
    <div class="notice" style="margin-top:12px"><strong>Keine echten Testdaten verwenden.</strong><div class="muted" style="margin-top:4px">Für Tests ausschließlich fiktive Personen und E-Mail-Adressen unter <code>example.invalid</code> verwenden. Für echte Einrichtungen gelten die jeweiligen Datenschutz- und Vertragsvorgaben.</div></div>
    <div class="grid" style="margin-top:14px">
      <div class="card"><strong>1. Stammdaten & Ansprechpartner</strong><div class="muted">Name, Anschrift, Telefon, Website, Rechnungs-E-Mail, Ansprechpartner und Portal-Administrator.</div></div>
      <div class="card"><strong>2. Branding</strong><div class="muted">Logo, Portalname, Wunschfarben, Willkommenstext und optional eigene Domain.</div>${action('branding','Branding öffnen')}</div>
      <div class="card"><strong>3. Organisation / Organigramm</strong><div class="muted">Standorte, Bereiche, Hierarchie, Kürzel, Verantwortliche und Rollen. Bevorzugt CSV/XLSX.</div><div class="toolbar"><button type="button" class="btn secondary kp-prep-template" data-template="organisation">CSV-Vorlage</button>${action('organization','Struktur öffnen')}</div></div>
      <div class="card"><strong>4. Klassen / Kurse</strong><div class="muted">Bezeichnungen, Kürzel, Start-/Enddaten und ggf. Zuordnung zu Standort/Bereich.</div>${action('courses','Klassen/Kurse öffnen')}</div>
      <div class="card"><strong>5. Personal & Zuständigkeiten</strong><div class="muted">Administratoren, Klassen-Admins als Teilnehmer mit Zusatzrechten sowie Lehrkräfte/Dozenten über das separate Dozentenportal.</div>${action('users','Benutzer & Rollen öffnen')}</div>
      <div class="card"><strong>6. Teilnehmer / Schüler</strong><div class="muted">Name, E-Mail, Teilnehmer-/Schülernummer, Klasse/Kurs sowie optional Beginn/Ende. CSV/XLSX/JSON/TXT; PDF kann über die Importoberfläche ausgewertet werden.</div><div class="toolbar"><button type="button" class="btn secondary kp-prep-template" data-template="participants">CSV-Vorlage</button>${action('participants','Teilnehmer importieren')}</div></div>
      <div class="card"><strong>7. Stundenplan</strong><div class="muted">Klasse, Datum, Beginn, Ende, Fach, Dozent, Raum, Unterrichtsart und Hinweise. CSV/XLSX direkt importierbar; PDF kann als Stundenplanquelle hinterlegt werden.</div><div class="toolbar"><button type="button" class="btn secondary kp-prep-template" data-template="timetable">CSV-Vorlage</button>${action('content','Stundenplan importieren','data-action="timetable"')}</div></div>
      <div class="card"><strong>8. Optional für erweiterte Automatisierung</strong><div class="muted">Eigene Domain, SSO/SCIM, bestehende IDs, Mail-/Eingangskanäle, Modulwünsche sowie vorhandene Exportdateien aus Altsystemen.</div></div>
    </div>
    <details style="margin-top:14px"><summary><strong>Empfohlene Reihenfolge</strong></summary><div class="muted" style="margin-top:8px">Stammdaten → Branding → Organisation → Klassen/Kurse → Personal/Zuständigkeiten → Teilnehmer → Stundenplan → Inhalte/Module → Kontrolle mit verschiedenen Rollen.</div></details>
  </section>`;
}

function findNav(view){
  if(view==='organization')return document.querySelector('#enterprise-structure-nav')||[...document.querySelectorAll('.nav')].find(x=>String(x.textContent||'').includes('Struktur'));
  if(view==='participants')return [...document.querySelectorAll('.nav')].find(x=>String(x.textContent||'').includes('Teilnehmer importieren'));
  return document.querySelector(`[data-v="${CSS.escape(view||'')}"]`);
}
function wire(root=document){
  root.querySelectorAll?.('.kp-prep-template').forEach(b=>{if(b.dataset.prepBound)return;b.dataset.prepBound='1';b.addEventListener('click',()=>downloadTemplate(b.dataset.template));});
  root.querySelectorAll?.('.kp-prep-go').forEach(b=>{if(b.dataset.prepBound)return;b.dataset.prepBound='1';b.addEventListener('click',()=>{
    const nav=findNav(b.dataset.view||'');if(!nav)return;nav.click();
    if(b.dataset.action==='timetable'){let tries=0;const timer=setInterval(()=>{const open=document.querySelector('#timetable-import-open');if(open){clearInterval(timer);open.click();}else if(++tries>30)clearInterval(timer);},50);}
  });});
}

function injectOnboarding(){
  const root=document.querySelector('#setup-app');if(!root||root.querySelector('#kp-setup-preparation'))return;
  const form=root.querySelector('#onboarding-form');if(!form)return;
  form.insertAdjacentHTML('beforebegin',checklistHtml(false));wire(root);
}

function injectCustomer(){
  const content=document.querySelector('.content');if(!content)return;
  const tenant=document.querySelector('#tenantPick')?.value||'';
  if(tenant&&document.documentElement.dataset.kpSetupFinishedTenant===tenant){content.querySelector('#kp-setup-preparation')?.remove();return;}
  const title=content.querySelector(':scope > .top h2')?.textContent?.trim();if(title!=='Kundenübersicht')return;
  if(content.querySelector('#kp-setup-preparation'))return;
  const progress=content.querySelector('#kp-setup-progress'),grid=content.querySelector(':scope > .grid');
  const anchor=progress||grid;if(!anchor)return;
  anchor.insertAdjacentHTML('afterend',checklistHtml(true));wire(content);
}

function apply(){if(ONBOARDING_PATH)injectOnboarding();if(CUSTOMER_PATH)injectCustomer();}
if(ONBOARDING_PATH||CUSTOMER_PATH){new MutationObserver(()=>queueMicrotask(apply)).observe(document.querySelector('#setup-app')||document.querySelector('#app')||document.body,{subtree:true,childList:true});apply();}
