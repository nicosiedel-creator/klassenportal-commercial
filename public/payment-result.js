const box=document.querySelector('#payment-result');
const success=location.pathname==='/zahlung/erfolg';
const params=new URLSearchParams(location.search);
const sessionId=params.get('session_id')||'';
const customerAdmin='/kunden-admin';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function actions(invoice){const invoiceLink=invoice?.url?`<a class="btn secondary" href="${esc(invoice.url)}" rel="noopener">Rechnung bei Stripe</a>`:'';return `<div class="payment-actions"><a class="btn" href="${customerAdmin}">Zum Kunden-Admin</a>${invoiceLink}</div>`;}
function renderPending(data){box.innerHTML=`<h1>Zahlung wird bestätigt</h1><p class="payment-status">Status: noch ausstehend</p><p>Der Zahlungsvorgang wurde an Stripe übermittelt. Die Buchung wird erst freigeschaltet, wenn die Zahlung tatsächlich bestätigt wurde.</p><p class="muted">Bei SEPA ist ein zeitversetzter Status normal. Du musst die Buchung nicht erneut auslösen.</p>${actions(data?.invoice)}`;}
function renderPaid(data){box.innerHTML=`<h1>Zahlung bestätigt</h1><p class="payment-status">Status: bezahlt und freigeschaltet</p><p>Stripe hat die Zahlung bestätigt. Paket und gebuchtes Klassen-/Kurskontingent können jetzt genutzt werden.</p>${actions(data?.invoice)}`;}
function renderFailed(data){box.innerHTML=`<h1>Zahlung nicht erfolgreich</h1><p class="payment-status">Status: nicht freigeschaltet</p><p>Die Zahlung wurde nicht bestätigt. Es wurde keine kostenpflichtige Freischaltung als bezahlt markiert.</p><p class="muted">Im Kunden-Admin kannst Du die Zahlung erneut starten.</p>${actions(data?.invoice)}`;}
async function status(){const r=await fetch(`/api/payments/checkout-status?session_id=${encodeURIComponent(sessionId)}`,{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
if(!box)throw new Error('PAYMENT_RESULT_CONTAINER_MISSING');
if(!success){box.innerHTML=`<h1>Zahlung nicht abgeschlossen</h1><p>Der Zahlungsvorgang wurde abgebrochen. Eine noch nicht bestätigte Buchung wird dadurch nicht freigeschaltet.</p><p class="muted">Du kannst im Kunden-Admin später erneut zur Zahlung wechseln.</p>${actions(null)}`;}
else if(!sessionId){box.innerHTML=`<h1>Zahlungsstatus nicht verfügbar</h1><p>Die Checkout-Sitzung fehlt. Öffne den Kunden-Admin, um den aktuellen Buchungsstatus zu prüfen.</p>${actions(null)}`;}
else{let last=null;try{for(let i=0;i<12;i++){last=await status();if(last.state==='paid'){renderPaid(last);break;}if(last.state==='failed'){renderFailed(last);break;}renderPending(last);if(i<11)await sleep(1500);}}catch(e){const login=e.message==='UNAUTHENTICATED';box.innerHTML=`<h1>Zahlungsstatus kann nicht geprüft werden</h1><p>${login?'Deine Anmeldung ist nicht mehr aktiv. Melde Dich im Kunden-Admin erneut an.':'Der Zahlungsstatus konnte gerade nicht geladen werden.'}</p><p class="muted">Die Zahlungsfreigabe selbst wird weiterhin ausschließlich über bestätigte Stripe-Ereignisse verarbeitet.</p>${actions(null)}`;}}
