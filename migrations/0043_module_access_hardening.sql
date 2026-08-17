-- Bereinigt versehentliche Self-Service-Freischaltungen aus der alten generischen Modulansicht
-- und schützt kostenpflichtige Erweiterungsmodule zusätzlich auf Datenbankebene.

-- Basismodule gehören zum regulären Portalumfang; ein Ein-/Ausblenden darf ihre Herkunft
-- nicht dauerhaft von 'plan' auf 'manual' umschreiben.
UPDATE feature_flags
SET source='plan', updated_at=CURRENT_TIMESTAMP
WHERE source='manual'
  AND feature_key IN (
    'schedule','homework','appointments','announcements','links','files','calendar',
    'reminders','weekly_overview','exams_progress','personal_grades','learning_materials'
  );

-- Kostenpflichtige Erweiterungen dürfen nur aktiv sein, wenn eine bestätigte Modulbuchung
-- existiert oder sie ausdrücklich als Tarif/Testumfang geführt werden.
UPDATE feature_flags
SET enabled=0, source='plan', updated_at=CURRENT_TIMESTAMP
WHERE source='manual'
  AND feature_key IN ('microsoft_365','microsoft_teams','statistics','surveys','substitution_updates')
  AND NOT EXISTS (
    SELECT 1 FROM tenant_module_entitlements e
    WHERE e.tenant_id=feature_flags.tenant_id
      AND e.feature_key=feature_flags.feature_key
      AND e.status='active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM module_subscription_changes c
    WHERE c.tenant_id=feature_flags.tenant_id
      AND c.feature_key=feature_flags.feature_key
      AND c.status='active'
  );

-- Paketgesteuerte Funktionen, die zuletzt durch einen normalen Kundenbenutzer über die
-- alte Häkchenansicht auf 'manual' gesetzt wurden, werden zurückgenommen. Eine bewusste
-- Plattform-Admin-Freigabe bleibt unangetastet.
UPDATE feature_flags
SET enabled=0, source='plan', updated_at=CURRENT_TIMESTAMP
WHERE source='manual'
  AND feature_key IN ('custom_domain','white_label')
  AND COALESCE((
    SELECT u.is_platform_admin
    FROM audit_log a
    LEFT JOIN users u ON u.id=a.actor_user_id
    WHERE a.tenant_id=feature_flags.tenant_id
      AND a.action='feature.updated'
      AND a.entity_type='feature'
      AND a.entity_id=feature_flags.feature_key
    ORDER BY a.created_at DESC
    LIMIT 1
  ),0)=0;

-- Defense in depth: Ein kostenpflichtiges Modul darf nicht durch ein beliebiges
-- feature_flags-Update auf 'manual + aktiv' gesetzt werden. Der reguläre Stripe-Flow
-- ist erlaubt, sobald der zugehörige Buchungswechsel aktiv ist bzw. das Entitlement aktiv ist.
CREATE TRIGGER IF NOT EXISTS trg_paid_module_feature_insert
BEFORE INSERT ON feature_flags
WHEN NEW.enabled=1
 AND NEW.source='manual'
 AND NEW.feature_key IN ('microsoft_365','microsoft_teams','statistics','surveys','substitution_updates')
 AND NOT EXISTS (
   SELECT 1 FROM tenant_module_entitlements e
   WHERE e.tenant_id=NEW.tenant_id AND e.feature_key=NEW.feature_key AND e.status='active'
 )
 AND NOT EXISTS (
   SELECT 1 FROM module_subscription_changes c
   WHERE c.tenant_id=NEW.tenant_id AND c.feature_key=NEW.feature_key AND c.status='active'
 )
BEGIN
  SELECT RAISE(ABORT,'MODULE_MANAGED_BY_BILLING');
END;

CREATE TRIGGER IF NOT EXISTS trg_paid_module_feature_update
BEFORE UPDATE OF enabled,source ON feature_flags
WHEN NEW.enabled=1
 AND NEW.source='manual'
 AND NEW.feature_key IN ('microsoft_365','microsoft_teams','statistics','surveys','substitution_updates')
 AND NOT EXISTS (
   SELECT 1 FROM tenant_module_entitlements e
   WHERE e.tenant_id=NEW.tenant_id AND e.feature_key=NEW.feature_key AND e.status='active'
 )
 AND NOT EXISTS (
   SELECT 1 FROM module_subscription_changes c
   WHERE c.tenant_id=NEW.tenant_id AND c.feature_key=NEW.feature_key AND c.status='active'
 )
BEGIN
  SELECT RAISE(ABORT,'MODULE_MANAGED_BY_BILLING');
END;
