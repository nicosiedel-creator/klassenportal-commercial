-- Block 7: In-App-Benachrichtigungen für neue freigegebene Portal-Inhalte.
-- Pro Nutzer wird ein eigener Datensatz erzeugt, damit read_at wirklich persönlich ist.

CREATE INDEX IF NOT EXISTS idx_notifications_user_time
ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, read_at, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_notify_announcement_after_insert
AFTER INSERT ON announcements
WHEN NEW.visible=1
BEGIN
  INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at)
  SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,
         'announcement','Neue Meldung: ' || NEW.title,NEW.body,CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT user_id FROM memberships
    WHERE tenant_id=NEW.tenant_id
      AND role IN ('participant','guest')
      AND (NEW.course_id IS NULL OR course_id=NEW.course_id)
  ) x;
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_announcement_after_publish
AFTER UPDATE OF visible ON announcements
WHEN OLD.visible=0 AND NEW.visible=1
BEGIN
  INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at)
  SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,
         'announcement','Neue Meldung: ' || NEW.title,NEW.body,CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT user_id FROM memberships
    WHERE tenant_id=NEW.tenant_id
      AND role IN ('participant','guest')
      AND (NEW.course_id IS NULL OR course_id=NEW.course_id)
  ) x;
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_homework_after_insert
AFTER INSERT ON homework
BEGIN
  INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at)
  SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,
         'homework','Neue Aufgabe: ' || NEW.title,
         CASE WHEN NEW.due_at IS NULL THEN NEW.description ELSE 'Fällig: ' || NEW.due_at || CASE WHEN NEW.description IS NULL OR NEW.description='' THEN '' ELSE char(10) || NEW.description END END,
         CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT user_id FROM memberships
    WHERE tenant_id=NEW.tenant_id AND course_id=NEW.course_id AND role IN ('participant','guest')
  ) x;
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_appointment_after_insert
AFTER INSERT ON appointments
BEGIN
  INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at)
  SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,
         'appointment','Neuer Termin: ' || NEW.title,
         'Beginn: ' || NEW.starts_at || CASE WHEN NEW.location IS NULL OR NEW.location='' THEN '' ELSE char(10) || 'Ort: ' || NEW.location END,
         CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT user_id FROM memberships
    WHERE tenant_id=NEW.tenant_id
      AND role IN ('participant','guest')
      AND (NEW.course_id IS NULL OR course_id=NEW.course_id)
  ) x;
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_exam_after_insert
AFTER INSERT ON exams
WHEN NEW.visible_to_students=1
BEGIN
  INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at)
  SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,
         'exam','Neue Prüfung: ' || NEW.title,
         'Termin: ' || NEW.starts_at || CASE WHEN NEW.room IS NULL OR NEW.room='' THEN '' ELSE char(10) || 'Raum: ' || NEW.room END,
         CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT user_id FROM memberships
    WHERE tenant_id=NEW.tenant_id AND course_id=NEW.course_id AND role IN ('participant','guest')
  ) x;
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_exam_after_publish
AFTER UPDATE OF visible_to_students ON exams
WHEN OLD.visible_to_students=0 AND NEW.visible_to_students=1
BEGIN
  INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at)
  SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,
         'exam','Neue Prüfung: ' || NEW.title,
         'Termin: ' || NEW.starts_at || CASE WHEN NEW.room IS NULL OR NEW.room='' THEN '' ELSE char(10) || 'Raum: ' || NEW.room END,
         CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT user_id FROM memberships
    WHERE tenant_id=NEW.tenant_id AND course_id=NEW.course_id AND role IN ('participant','guest')
  ) x;
END;
