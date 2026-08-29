-- Ein Eingang kann jetzt beides enthalten: Vertraege und Teilnehmerlisten (Teilnehmerimport)
-- sowie Struktur- und Rollenunterlagen wie Kurs-, Fach- und Dozentenlisten
-- (Organisationsimport). Bisher wurde jeder Eingang ausschliesslich als Teilnehmerimport
-- gelesen; eine Kursliste im hochgeladenen Ordner wurde dadurch zu unbrauchbaren
-- Teilnehmerzeilen. Der Eingang merkt sich deshalb zusaetzlich seinen Organisationsimport.
--
-- Bewusst nur eine zusaetzliche Spalte: keine bestehende Zeile wird veraendert, keine
-- bestehende Abfrage bricht, und ein Eingang ohne Strukturunterlagen bleibt exakt wie bisher.
ALTER TABLE intake_batches ADD COLUMN organization_import_batch_id TEXT;

-- Der automatische Eingang hat keinen angemeldeten Menschen hinter sich. Er benutzt dafuer eine
-- kurzlebige, dauerhaft deaktivierte Dienstkennung - genau wie der Teilnehmerimport seit 0052.
-- Ohne sie scheitert der Organisationsimport an seinem Fremdschluessel auf users(id), und ein
-- eingeworfener Ordner bleibt liegen, obwohl nichts an ihm unklar ist.
--
-- Die Kennung ist nie anmeldefaehig: status='disabled' und ein Passwort-Hash, der kein Hash ist.
--
-- Sie traegt bewusst ein eigenes Praefix (system:intake:org:) und damit eine eigene users-Zeile.
-- Teilte sie sich die Zeile mit dem Teilnehmerimport, wuerde dessen Aufraeumregel aus 0052 sie
-- loeschen, sobald ein Teilnehmerstapel verschwindet - und der Fremdschluessel
-- organization_import_batches.created_by raeumt per ON DELETE CASCADE den Organisationsimport
-- gleich mit weg. Getrennte Kennungen schliessen das aus, ohne die laengst angewandte Regel aus
-- 0052 anfassen zu muessen.
CREATE TRIGGER IF NOT EXISTS trg_organization_import_intake_actor
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
END;

CREATE TRIGGER IF NOT EXISTS trg_organization_import_intake_actor_cleanup
AFTER DELETE ON organization_import_batches
WHEN OLD.created_by LIKE 'system:intake:%'
BEGIN
  DELETE FROM users
  WHERE id=OLD.created_by
    AND status='disabled'
    AND email LIKE 'system-intake-org-%@localhost.invalid';
END;
