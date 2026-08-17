-- Automatic intake batches use short-lived disabled service identities solely as FK-valid audit actors.
CREATE TRIGGER IF NOT EXISTS trg_participant_import_intake_actor
BEFORE INSERT ON participant_import_batches
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

CREATE TRIGGER IF NOT EXISTS trg_participant_import_intake_actor_cleanup
AFTER DELETE ON participant_import_batches
WHEN OLD.created_by LIKE 'system:intake:%'
BEGIN
  DELETE FROM users
  WHERE id=OLD.created_by
    AND status='disabled'
    AND email LIKE 'system-intake-%@localhost.invalid';
END;
