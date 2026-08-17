const grid=document.querySelector('#price-grid'),contact=document.querySelector('#pilot-contact'),provider=document.querySelector('#footer-provider');
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(c,cur='EUR')=>new Intl.NumberFormat('de-DE',{style:'currency',currency:cur,maximumFractionDigits:2}).format(Number(c||0)/100);
async function load(){
  try{
    const r=await fetch('/api/public/product',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);const p=d.product||{},plans=p.plans||[];
    if(plans.length)grid.innerHTML=plans.map(x=>`<article class="card price"><h3>${E(x.name)}</h3><div class="amount">${money(x.monthlyPriceCents,x.currency)}</div><div class="muted">pro Monat · B2B netto</div><ul class="feature-list"><li>${x.includedCourses===null?'Klassenumfang nach Angebot':`${E(x.includedCourses)} Klassen/Kurse enthalten`}</li>${x.extraCourseMonthlyCents!==null?`<li>Weitere Klasse/Kurs: ${money(x.extraCourseMonthlyCents,x.currency)}/Monat</li>`:''}<li>Individuelle Sonderpreise und Rabatte per Angebot möglich</li></ul><a class="btn secondary" href="#pilot">Angebot anfragen</a></article>`).join('');
    else grid.innerHTML='<article class="card"><h3>Individuelles Angebot</h3><p>Öffentliche Listenpreise sind derzeit nicht freigegeben. Für Pilot und produktive Nutzung wird ein individuelles Angebot erstellt.</p></article>';
    if(p.supportEmail){contact.href=`mailto:${encodeURIComponent(p.supportEmail)}?subject=${encodeURIComponent('Klassenportal – Pilot / Angebot')}`;provider.textContent=`Klassenportal · Kontakt: ${p.supportEmail}`;}else{contact.removeAttribute('href');contact.onclick=e=>{e.preventDefault();alert('Der Kontakt wird veröffentlicht, sobald die Anbieter-/Supportdaten freigegeben sind.');};}
  }catch{grid.innerHTML='<article class="card"><h3>Individuelles Angebot</h3><p>Preisinformationen sind vorübergehend nicht verfügbar. Bitte nutze den Kontakt für ein individuelles Angebot.</p></article>';}
}
load();
