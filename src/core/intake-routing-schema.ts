import type { Env } from './types.js';

// Migrationen laufen in dieser Anwendung nicht automatisch in die Produktionsdatenbank: jedes
// "wrangler d1 migrations apply" in der CI benutzt --local. Eine neue Migration ist damit erst
// dann in Produktion, wenn sie jemand von Hand anwendet - und bis dahin trifft der neue Code auf
// ein altes Schema.
//
// Genau daran waere der autonome Ordner-Eingang gescheitert: ohne die Spalte
// organization_import_batch_id bricht das Uebernehmen mit einem SQL-Fehler ab, und ohne die
// Dienstkennung weist der Fremdschluessel des Organisationsimports jeden automatischen Entwurf
// zurueck. Ein eingeworfener Ordner waere liegengeblieben, obwohl nichts an ihm unklar ist.
//
// Deshalb dasselbe Vorgehen wie bei offer-schema, legal-schema und branding-schema: der Code
// stellt her, was er braucht, bevor er es benutzt. Alles hier ist idempotent und additiv - keine
// bestehende Zeile wird veraendert, keine bestehende Regel ersetzt.
let ensured=false;

async function columns(env:Env,table:string):Promise<Set<string>>{
  const r=await env.DB.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();
  return new Set((r.results??[]).map(x=>String(x.name)));
}

export async function ensureIntakeRoutingSchema(env:Env):Promise<void>{
  if(ensured)return;
  const intake=await columns(env,'intake_batches');
  // Eine leere Menge bedeutet: die Tabelle gibt es nicht. Dann ist hier nichts herzustellen -
  // der Eingang ist in dieser Datenbank ueberhaupt nicht eingerichtet.
  if(!intake.size)return;
  if(!intake.has('organization_import_batch_id'))
    await env.DB.prepare('ALTER TABLE intake_batches ADD COLUMN organization_import_batch_id TEXT').run().catch(()=>undefined);

  // Die Dienstkennung des automatischen Organisationsimports. Eigenes Praefix, damit die
  // Aufraeumregel des Teilnehmerimports aus 0052 sie nicht mitloescht.
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_organization_import_intake_actor
    BEFORE INSERT ON organization_import_batches
    WHEN NEW.created_by LIKE 'system:intake:%'
    BEGIN
      INSERT OR IGNORE INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at)
      VALUES(
        NEW.created_by,
        replace(NEW.created_by,':','-') || '@localhost.invalid',
        'Automatischer Eingang',
        '!disabled-system-account!',
        0,0,'disabled',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      );
    END`).run().catch(()=>undefined);
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_organization_import_intake_actor_cleanup
    AFTER DELETE ON organization_import_batches
    WHEN OLD.created_by LIKE 'system:intake:%'
    BEGIN
      DELETE FROM users
      WHERE id=OLD.created_by
        AND status='disabled'
        AND email LIKE 'system-intake-org-%@localhost.invalid';
    END`).run().catch(()=>undefined);
  ensured=true;
}

// Ob die Rueckverfolgungsspalte wirklich da ist. Fehlt sie, darf keine Abfrage sie benennen -
// sonst bricht der ganze Vorgang an einer Spalte, die nur der Nachvollziehbarkeit dient.
export async function intakeTracksOrganizationImport(env:Env):Promise<boolean>{
  return (await columns(env,'intake_batches')).has('organization_import_batch_id');
}
