PRAGMA foreign_keys = ON;

-- Data-minimisation rule: operational scheduling only needs to know that a
-- teacher is unavailable, not a medical diagnosis or symptom. Any sickness
-- record is reduced to a neutral operational reason at the database boundary.
CREATE TRIGGER IF NOT EXISTS trg_teacher_sickness_reason_minimize_insert
AFTER INSERT ON teacher_unavailability
WHEN NEW.source='sickness' AND COALESCE(NEW.reason,'')<>'Krankheitsbedingte Abwesenheit'
BEGIN
  UPDATE teacher_unavailability
     SET reason='Krankheitsbedingte Abwesenheit'
   WHERE id=NEW.id AND tenant_id=NEW.tenant_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_teacher_sickness_reason_minimize_update
AFTER UPDATE OF source,reason ON teacher_unavailability
WHEN NEW.source='sickness' AND COALESCE(NEW.reason,'')<>'Krankheitsbedingte Abwesenheit'
BEGIN
  UPDATE teacher_unavailability
     SET reason='Krankheitsbedingte Abwesenheit'
   WHERE id=NEW.id AND tenant_id=NEW.tenant_id;
END;
