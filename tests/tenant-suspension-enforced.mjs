// "Gesperrt" in der Plattformverwaltung sperrte gar nichts.
//
// Die Plattformverwaltung kann einen Mandanten auf gesperrt, beendet oder in Loeschung setzen.
// Geschrieben wurde dabei ausschliesslich die Zeile in der Mandantentabelle - kein einziger
// Weg im Portal hat sie je gelesen. Der Kundenadmin eines gesperrten Mandanten arbeitete
// unveraendert weiter. Dieser Test fuehrt beides aus: das Sperren und die Wirkung.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { updatePlatformTenant } from '../dist/core/platform-owner.js';
import { assertTenantWriteAllowed } from '../dist/core/commerce-offers.js';
import { hashPassword, login, resolveCoreAuth } from '../dist/core/auth.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const ORIGIN='https://portal.example',T='ten_sperr',TS='2026-01-01T00:00:00.000Z';
const PW='Sehr-Langes-Kennwort-2026!',hash=await hashPassword(PW);
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk','bw','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_kunde','kunde@example.invalid','Kundenadmin','${hash}',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_platt','platt@example.invalid','Plattform','${hash}',0,1,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_k','${T}',NULL,'usr_kunde','tenant_admin','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','usr_kunde','active','manual','${TS}','${TS}');
`);
const env={DB:d1(db),APP_ORIGIN:ORIGIN};
const platt={userId:'usr_platt',role:'platform_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:true};
const anmeldung=await login(env,new Request(`${ORIGIN}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'kunde@example.invalid',password:PW})}));
assert.equal(anmeldung.status,200);
const KEKS=/kp_session=([^;]+)/.exec(anmeldung.headers.get('set-cookie')||'')?.[1]||'';
const anfrage=()=>new Request(`${ORIGIN}/api/courses?tenant_id=${T}`,{headers:{cookie:`kp_session=${KEKS}`}});
const status=()=>db.prepare(`SELECT status FROM tenants WHERE id='${T}'`).get().status;

// ---------------------------------------------------------------------------
// 1. Solange der Mandant aktiv ist, geht alles.
// ---------------------------------------------------------------------------
const auth=await resolveCoreAuth(env,anfrage(),T);
assert.equal(auth.role,'tenant_admin');
await assertTenantWriteAllowed(env,T);

// ---------------------------------------------------------------------------
// 2. Die Plattform sperrt - und das wirkt.
// ---------------------------------------------------------------------------
await updatePlatformTenant(env,platt,T,{status:'suspended'});
assert.equal(status(),'suspended','die Sperre muss gespeichert sein');
await assert.rejects(()=>assertTenantWriteAllowed(env,T),/TENANT_SUSPENDED/,
  'ein gesperrter Mandant darf nichts mehr schreiben');
// Lesen bleibt möglich, damit der Kunde seine Daten noch sieht.
const nochLesbar=await resolveCoreAuth(env,anfrage(),T);
assert.equal(nochLesbar.role,'tenant_admin','ein gesperrter Mandant darf seine Daten noch sehen');

// Auch ein bezahltes, aktives Abonnement hebt die Sperre nicht auf.
db.exec(`INSERT OR IGNORE INTO plans(id,name,monthly_price_cents,is_active) VALUES('plan_x','Test',0,1);
INSERT INTO subscriptions(tenant_id,plan_id,status,starts_at) VALUES('${T}','plan_x','active','${TS}') ON CONFLICT(tenant_id) DO UPDATE SET status='active';`);
await assert.rejects(()=>assertTenantWriteAllowed(env,T),/TENANT_SUSPENDED/,
  'ein aktives Abonnement darf eine Sperre der Plattform nicht aushebeln');

// ---------------------------------------------------------------------------
// 3. Beendet und in Löschung: auch lesend ist Schluss.
// ---------------------------------------------------------------------------
for(const zustand of ['ended','deleting']){
  await updatePlatformTenant(env,platt,T,{status:zustand});
  assert.equal(status(),zustand);
  await assert.rejects(()=>resolveCoreAuth(env,anfrage(),T),/TENANT_INACTIVE/,
    `ein Mandant im Zustand ${zustand} darf auch nicht mehr gelesen werden`);
  await assert.rejects(()=>assertTenantWriteAllowed(env,T),/TENANT_INACTIVE/);
}

// ---------------------------------------------------------------------------
// 4. Die Plattform kann wieder aufmachen.
// ---------------------------------------------------------------------------
await updatePlatformTenant(env,platt,T,{status:'active'});
const wieder=await resolveCoreAuth(env,anfrage(),T);
assert.equal(wieder.role,'tenant_admin','nach dem Entsperren muss alles wieder gehen');
await assertTenantWriteAllowed(env,T);

// ---------------------------------------------------------------------------
// 5. Sperren darf nur die Plattform.
// ---------------------------------------------------------------------------
const kunde={userId:'usr_kunde',role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
await assert.rejects(()=>updatePlatformTenant(env,kunde,T,{status:'active',name:'Umbenannt'}),/PLATFORM_ADMIN_REQUIRED|FORBIDDEN/,
  'ein Kundenadmin darf den eigenen Mandanten nicht in der Plattformverwaltung ändern');
assert.equal(db.prepare(`SELECT name FROM tenants WHERE id='${T}'`).get().name,'Bildungswerk',
  'und dabei darf nichts verändert worden sein');

// ---------------------------------------------------------------------------
// 6. Die Sperre wird dem Kunden im Klartext erklärt, nicht als Fehlercode.
// ---------------------------------------------------------------------------
const texte=await readFile('public/kp-error-text.js','utf8');
for(const code of ['TENANT_SUSPENDED','TENANT_INACTIVE'])
  assert.match(texte,new RegExp(`${code}:'[^']{20,}'`),`${code} braucht einen verständlichen deutschen Text`);
assert.ok(!/TENANT_SUSPENDED:'[^']*(SQL|D1|tenant_id|status=)/.test(texte),'ohne technische Innereien');

console.log('tenant-suspension-enforced: ok');
