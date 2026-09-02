// Die Zugangsgrenzen des Portals, ausgefuehrt statt gelesen.
//
// Bisher war all das nur durch Mustervergleiche im Quelltext belegt (tests/owner-security.mjs).
// Ein Mustervergleich sagt, wie der Code aussieht - nicht, was er tut. Hier wird angemeldet,
// eine echte Sitzung ausgestellt und der Zugriff aufgeloest.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { hashPassword, login, getSession, issueSession, resolveCoreAuth } from '../dist/core/auth.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const ORIGIN='https://klassenportal.example',T='ten_zug',TS='2026-01-01T00:00:00.000Z';
const env={DB:d1(db),APP_ORIGIN:ORIGIN};
const PW='Sehr-Langes-Kennwort-2026!';
const hash=await hashPassword(PW);
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Träger','tz','active','${TS}','${TS}');
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('ten_fremd','Fremd','tf','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_kunde','kunde@example.invalid','Kundenadmin','${hash}',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_fremd','fremd@example.invalid','Fremde','${hash}',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_platt','platt@example.invalid','Plattform','${hash}',0,1,'active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_1','${T}','Klasse 1','K1',1,'${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_1','${T}',NULL,'usr_kunde','tenant_admin','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_2','ten_fremd',NULL,'usr_fremd','tenant_admin','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','usr_kunde','active','manual','${TS}','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('ten_fremd','usr_fremd','active','manual','${TS}','${TS}');
`);

const anfrage=(origin,email,pw=PW)=>new Request(`${origin}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pw})});
async function anmelden(origin,email){
  const r=await login(env,anfrage(origin,email));
  const keks=r.headers.get('set-cookie')||'';
  return{status:r.status,body:await r.json(),cookie:/kp_session=([^;]+)/.exec(keks)?.[1]||''};
}
const mitKeks=(cookie,pfad='/api/education/planning/resources')=>new Request(`${ORIGIN}${pfad}`,{headers:{cookie:`kp_session=${cookie}`}});

// ---------------------------------------------------------------------------
// 1. Der normale Weg: anmelden, Sitzung erhalten, Mandant auflösen.
// ---------------------------------------------------------------------------
const kunde=await anmelden(ORIGIN,'kunde@example.invalid');
assert.equal(kunde.status,200,`die Anmeldung muss gelingen: ${JSON.stringify(kunde.body)}`);
assert.ok(kunde.cookie,'es muss eine Sitzung ausgestellt werden');
const auth=await resolveCoreAuth(env,mitKeks(kunde.cookie),T);
assert.equal(auth.role,'tenant_admin');
assert.deepEqual(auth.tenantIds,[T]);

// ---------------------------------------------------------------------------
// 2. Wird der Mandantenzugang stillgelegt, ist Schluss - die Mitgliedschaft allein genügt nicht.
// ---------------------------------------------------------------------------
db.exec(`UPDATE tenant_users SET status='suspended' WHERE tenant_id='${T}' AND user_id='usr_kunde';`);
await assert.rejects(()=>resolveCoreAuth(env,mitKeks(kunde.cookie),T),/TENANT_ACCESS_SUSPENDED/,
  'ein stillgelegter Mandantenzugang muss sperren, obwohl die Mitgliedschaft weiter besteht');

// Auch ohne jede Zeile in tenant_users bleibt es gesperrt - kein stiller Rückfall auf Mitgliedschaften.
db.exec(`DELETE FROM tenant_users WHERE tenant_id='${T}' AND user_id='usr_kunde';`);
await assert.rejects(()=>resolveCoreAuth(env,mitKeks(kunde.cookie),T),/TENANT_ACCESS_SUSPENDED/,
  'fehlt die Mandantenverknüpfung ganz, darf die Mitgliedschaft den Zugang nicht ersetzen');
db.exec(`INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','usr_kunde','active','manual','${TS}','${TS}');`);

// Auch eine Verantwortlichkeit hebt die Stilllegung nicht auf. Das ist der Fall, der nur an
// dieser Stelle haengt: Verantwortlichkeiten werden ohne Blick auf den Mandantenstatus geladen,
// die Sitzung fuehrt den Mandanten also wieder - gesperrt wird erst hier.
db.exec(`
INSERT INTO org_unit_types(tenant_id,type_key,label,created_at,updated_at) VALUES('${T}','school','Schule','${TS}','${TS}');
INSERT INTO org_units(id,tenant_id,parent_id,type_key,name,code,status,created_at,updated_at) VALUES('org_z','${T}',NULL,'school','Standort','ST','active','${TS}','${TS}');
INSERT INTO responsibility_assignments(id,tenant_id,user_id,org_unit_id,course_id,responsibility_kind,inherit_descendants,status,source,created_at,updated_at) VALUES('rsp_1','${T}','usr_kunde','org_z',NULL,'primary',1,'active','manual','${TS}','${TS}');
UPDATE tenant_users SET status='suspended' WHERE tenant_id='${T}' AND user_id='usr_kunde';
`);
await assert.rejects(()=>resolveCoreAuth(env,mitKeks(kunde.cookie),T),/TENANT_ACCESS_SUSPENDED/,
  'eine Verantwortlichkeit darf einen stillgelegten Mandantenzugang nicht aushebeln');
db.exec(`DELETE FROM responsibility_assignments WHERE id='rsp_1';UPDATE tenant_users SET status='active' WHERE tenant_id='${T}' AND user_id='usr_kunde';`);

// Und die Sitzung selbst führt einen stillgelegten Mandanten gar nicht erst auf - so steht er
// auch in der Mandantenauswahl des Portals nicht.
db.exec(`UPDATE tenant_users SET status='suspended' WHERE tenant_id='${T}' AND user_id='usr_kunde';`);
const sitzung=await getSession(env,mitKeks(kunde.cookie));
assert.ok(sitzung,'die Sitzung selbst bleibt gültig');
assert.deepEqual(sitzung.tenantRoles,[],
  `ein stillgelegter Mandant darf in der Sitzung nicht auftauchen: ${JSON.stringify(sitzung.tenantRoles)}`);
db.exec(`UPDATE tenant_users SET status='active' WHERE tenant_id='${T}' AND user_id='usr_kunde';`);

// ---------------------------------------------------------------------------
// 3. Ein fremder Mandant ist nicht "gesperrt", sondern schlicht keiner - und bleibt verwehrt.
// ---------------------------------------------------------------------------
const fremd=await anmelden(ORIGIN,'fremd@example.invalid');
await assert.rejects(()=>resolveCoreAuth(env,mitKeks(fremd.cookie),T),/FORBIDDEN/,
  'wer mit dem Mandanten nichts zu tun hat, kommt nicht hinein');
const fehler=await resolveCoreAuth(env,mitKeks(fremd.cookie),T).catch(e=>e.message);
assert.notEqual(fehler,'TENANT_ACCESS_SUSPENDED',
  'und erfährt dabei nicht, ob es dort ein stillgelegtes Konto gäbe');

// ---------------------------------------------------------------------------
// 4. Die Plattformanmeldung ist an die konfigurierte Produktionsadresse gebunden.
// ---------------------------------------------------------------------------
const falsch=await anmelden('https://irgendwo.example','platt@example.invalid');
assert.equal(falsch.status,403,'ein Plattformkonto darf sich nicht über eine fremde Adresse anmelden');
assert.equal(falsch.body.error,'PLATFORM_ORIGIN_MISMATCH');
assert.ok(!falsch.cookie,'und dabei darf keine Sitzung entstehen');
const richtig=await anmelden(ORIGIN,'platt@example.invalid');
assert.equal(richtig.status,200,'über die konfigurierte Adresse muss es gehen');
assert.ok(richtig.cookie);

// ---------------------------------------------------------------------------
// 5. Ein stillgelegtes Konto trägt keine Sitzung mehr - auch eine bereits ausgestellte nicht.
// ---------------------------------------------------------------------------
db.exec(`UPDATE users SET status='disabled' WHERE id='usr_kunde';`);
assert.equal(await getSession(env,mitKeks(kunde.cookie)),null,
  'ein deaktiviertes Konto darf mit einer alten Sitzung nicht weiterarbeiten');
await assert.rejects(()=>resolveCoreAuth(env,mitKeks(kunde.cookie),T),/UNAUTHENTICATED|FORBIDDEN/);
// Und es entsteht auch keine neue: die Anmeldung über eine Unternehmensanmeldung führt für ein
// bereits verknüpftes Konto keine erneute Statusprüfung durch - sie hängt genau an dieser Stelle.
await assert.rejects(()=>issueSession(env,'usr_kunde',false,'oidc',T),/USER_NOT_FOUND/,
  'für ein deaktiviertes Konto darf auch über die Unternehmensanmeldung keine Sitzung entstehen');
db.exec(`UPDATE users SET status='active' WHERE id='usr_kunde';`);

// ---------------------------------------------------------------------------
// 6. Das falsche Kennwort nennt keinen Grund und stellt nichts aus.
// ---------------------------------------------------------------------------
const daneben=await login(env,anfrage(ORIGIN,'kunde@example.invalid','falsch-aber-lang-genug-1!'));
assert.equal(daneben.status,401);
const dbody=await daneben.json();
assert.equal(dbody.error,'LOGIN_FAILED','die Fehlermeldung darf nicht verraten, ob es das Konto gibt');
assert.ok(!(daneben.headers.get('set-cookie')||'').includes('kp_session='),'keine Sitzung bei falschem Kennwort');
const unbekannt=await login(env,anfrage(ORIGIN,'gibtsnicht@example.invalid'));
assert.equal((await unbekannt.json()).error,'LOGIN_FAILED','unbekanntes Konto und falsches Kennwort müssen gleich klingen');

console.log('tenant-access-integrity: ok');
