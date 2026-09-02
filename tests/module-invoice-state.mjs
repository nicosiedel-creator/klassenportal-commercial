// Der Geldweg eines gebuchten Zusatzmoduls, ausgefuehrt statt gelesen.
//
// Bisher war er nur durch Mustervergleiche im Quelltext belegt (tests/billing-lifecycle.mjs).
// Die Zusage lautet: eine gescheiterte Zahlung darf niemals eine Funktion freischalten, und eine
// bezahlte Rechnung schaltet genau eine frei - auch wenn sie doppelt gemeldet wird. Wer echtes
// Geld bewegt, darf sich nicht auf ein Suchmuster verlassen.
//
// Es wird ausschliesslich gegen eine oertliche Datenbank gearbeitet. Es wird kein Zahlungsdienst
// angesprochen, nichts freigeschaltet und kein Schalter der produktiven Zahlungsabwicklung
// beruehrt - die bleibt unberuehrt deaktiviert.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { activateModuleChange, handleModuleInvoicePaid, handleModuleInvoiceFailed } from '../dist/core/module-commerce.js';
import { handleBillingLifecycleApi } from '../dist/core/billing-lifecycle-router.js';
import { hashPassword, login } from '../dist/core/auth.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_geld',TS='2026-01-01T00:00:00.000Z',KEY='statistics';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Träger','tg','active','${TS}','${TS}');
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('ten_andere','Andere','ta','active','${TS}','${TS}');
`);
const env={DB:d1(db),APP_ORIGIN:'https://portal.example'};
// Ein echter Kundenadmin mit gültiger Sitzung - damit belegt ist, dass die Sperre nicht bloß
// die fehlende Anmeldung ist, sondern die abgeschaltete Zahlungsabwicklung.
const PW='Sehr-Langes-Kennwort-2026!',hash=await hashPassword(PW);
db.exec(`
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_geld','geld@example.invalid','Kundenadmin','${hash}',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_g','${T}',NULL,'usr_geld','tenant_admin','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','usr_geld','active','manual','${TS}','${TS}');
`);
const anmeldung=await login(env,new Request('https://portal.example/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'geld@example.invalid',password:PW})}));
assert.equal(anmeldung.status,200,'die Anmeldung des Kundenadmins muss gelingen');
const KEKS=/kp_session=([^;]+)/.exec(anmeldung.headers.get('set-cookie')||'')?.[1]||'';
assert.ok(KEKS,'es muss eine Sitzung ausgestellt werden');
const zahl=(sql,...a)=>Number(Object.values(db.prepare(sql).get(...a)??{0:0})[0]||0);
const eins=(sql,...a)=>db.prepare(sql).get(...a);

function offeneBuchung(id,tenant=T,rechnung='in_test_1'){
  db.exec(`
  DELETE FROM module_subscription_changes WHERE id='${id}';
  INSERT INTO module_subscription_changes(id,tenant_id,feature_key,status,monthly_price_cents,immediate_charge_cents,currency,billing_cycle,external_invoice_id,external_subscription_item_id,requested_by,requested_at,snapshot_json)
    VALUES('${id}','${tenant}','${KEY}','pending_payment',3900,3900,'EUR','monthly','${rechnung}','si_test','usr_test','${TS}','{}');
  INSERT OR REPLACE INTO tenant_module_entitlements(tenant_id,feature_key,status,monthly_price_cents,currency,billing_cycle,updated_at)
    VALUES('${tenant}','${KEY}','pending_payment',3900,'EUR','monthly','${TS}');
  DELETE FROM feature_flags WHERE tenant_id='${tenant}' AND feature_key='${KEY}';
  `);
}

// ---------------------------------------------------------------------------
// 1. Gescheiterte Zahlung: nichts wird freigeschaltet, der Anspruch bleibt nicht offen stehen.
// ---------------------------------------------------------------------------
offeneBuchung('mch_fehl');
assert.equal(await handleModuleInvoiceFailed(env,T,'mch_fehl','in_test_1'),true);
assert.equal(eins(`SELECT status FROM module_subscription_changes WHERE id='mch_fehl'`).status,'failed');
assert.equal(eins(`SELECT status FROM tenant_module_entitlements WHERE tenant_id='${T}' AND feature_key='${KEY}'`).status,'failed',
  'ein offener Anspruch darf nach gescheiterter Zahlung nicht offen stehen bleiben');
assert.equal(zahl(`SELECT COUNT(*) FROM feature_flags WHERE tenant_id='${T}' AND feature_key='${KEY}' AND enabled=1`),0,
  'eine gescheiterte Zahlung darf die Funktion niemals freischalten');

// Eine später doch bezahlte Rechnung schaltet den bereits gescheiterten Vorgang nicht nachträglich frei.
assert.equal(await handleModuleInvoicePaid(env,T,'mch_fehl','in_test_1'),false,
  'ein bereits gescheiterter Vorgang darf nicht nachträglich aktiviert werden');
assert.equal(zahl(`SELECT COUNT(*) FROM feature_flags WHERE tenant_id='${T}' AND feature_key='${KEY}' AND enabled=1`),0);

// Auch die Freischaltung selbst weigert sich - sie verlaesst sich nicht darauf, dass der
// Aufrufer schon geprueft hat, ob der Vorgang noch offen ist.
assert.equal(await activateModuleChange(env,T,'mch_fehl','in_test_1'),false,
  'die Freischaltung selbst muss einen nicht mehr offenen Vorgang abweisen');
assert.equal(zahl(`SELECT COUNT(*) FROM feature_flags WHERE tenant_id='${T}' AND feature_key='${KEY}' AND enabled=1`),0);
assert.equal(eins(`SELECT status FROM module_subscription_changes WHERE id='mch_fehl'`).status,'failed',
  'und den gescheiterten Vorgang nicht umschreiben');

// ---------------------------------------------------------------------------
// 2. Bezahlte Rechnung: genau eine Freischaltung, auch bei doppelter Meldung.
// ---------------------------------------------------------------------------
offeneBuchung('mch_ok','ten_andere','in_test_2');
assert.equal(await handleModuleInvoicePaid(env,'ten_andere',null,'in_test_2'),true,
  'die Rechnungsnummer allein muss den Vorgang finden - der Zahlungsdienst kennt unsere Kennung nicht immer');
assert.equal(eins(`SELECT status,activated_at FROM module_subscription_changes WHERE id='mch_ok'`).status,'active');
assert.equal(eins(`SELECT status FROM tenant_module_entitlements WHERE tenant_id='ten_andere' AND feature_key='${KEY}'`).status,'active');
assert.equal(zahl(`SELECT COUNT(*) FROM feature_flags WHERE tenant_id='ten_andere' AND feature_key='${KEY}' AND enabled=1`),1);
const ersteFreischaltung=eins(`SELECT activated_at FROM module_subscription_changes WHERE id='mch_ok'`).activated_at;

assert.equal(await handleModuleInvoicePaid(env,'ten_andere',null,'in_test_2'),false,
  'dieselbe Rechnung zweimal gemeldet darf nicht zweimal wirken');
assert.equal(eins(`SELECT activated_at FROM module_subscription_changes WHERE id='mch_ok'`).activated_at,ersteFreischaltung,
  'und den Zeitpunkt der Freischaltung nicht verschieben');
assert.equal(zahl(`SELECT COUNT(*) FROM feature_flags WHERE tenant_id='ten_andere' AND feature_key='${KEY}' AND enabled=1`),1);

// ---------------------------------------------------------------------------
// 3. Die Rechnung eines Mandanten wirkt nicht im Nachbarmandanten.
// ---------------------------------------------------------------------------
offeneBuchung('mch_grenze',T,'in_test_3');
assert.equal(await handleModuleInvoicePaid(env,'ten_andere',null,'in_test_3'),false,
  'eine Rechnungsnummer aus einem fremden Mandanten darf hier nichts freischalten');
assert.equal(eins(`SELECT status FROM module_subscription_changes WHERE id='mch_grenze'`).status,'pending_payment',
  'der Vorgang des richtigen Mandanten bleibt unberührt offen');
assert.equal(await handleModuleInvoiceFailed(env,'ten_andere','mch_grenze','in_test_3'),false,
  'auch ein Fehlschlag darf die Mandantengrenze nicht überschreiten');
assert.equal(eins(`SELECT status FROM module_subscription_changes WHERE id='mch_grenze'`).status,'pending_payment');
// Und die Freischaltung selbst hält die Grenze ebenfalls - sie ist die zweite, unabhängige Sperre.
assert.equal(await activateModuleChange(env,'ten_andere','mch_grenze','in_test_3'),false,
  'die Freischaltung darf keinen Vorgang eines fremden Mandanten anfassen');
assert.equal(eins(`SELECT status FROM module_subscription_changes WHERE id='mch_grenze'`).status,'pending_payment');
assert.equal(zahl(`SELECT COUNT(*) FROM feature_flags WHERE tenant_id='ten_andere' AND feature_key='${KEY}' AND enabled=1`),1,
  'der fremde Mandant behält genau seine eigene, bezahlte Freischaltung');

// ---------------------------------------------------------------------------
// 4. Solange die Zahlungsabwicklung ausgeschaltet ist, geht über die Schnittstelle nichts.
// ---------------------------------------------------------------------------
const kopf={origin:'https://portal.example','content-type':'application/json',cookie:`kp_session=${KEKS}`};
const gesperrt=await handleBillingLifecycleApi(
  new Request('https://portal.example/api/billing/modules/cancellations?tenant_id='+T,{method:'POST',headers:kopf,body:'{}'}),env);
assert.ok(gesperrt,'die Schnittstelle muss zuständig sein');
const text=await gesperrt.clone().text();
assert.match(text,/PAYMENT_DISABLED/,
  `schreibende Zugriffe müssen ausdrücklich wegen der abgeschalteten Zahlungsabwicklung scheitern, war ${gesperrt.status}: ${text}`);
assert.ok(gesperrt.status>=400,'und mit einem Fehler antworten');

// Lesend bleibt dieselbe Schnittstelle bedienbar - die Sperre trifft nur schreibende Zugriffe.
const lesend=await handleBillingLifecycleApi(
  new Request('https://portal.example/api/billing/modules/cancellations?tenant_id='+T,{headers:kopf}),env);
assert.equal(lesend.status,200,'lesen muss weiterhin möglich sein');
const gelesen=await lesend.json();
assert.equal(gelesen.paymentProcessing,'disabled','und dabei sagen, dass die Zahlungsabwicklung aus ist');

console.log('module-invoice-state: ok');
