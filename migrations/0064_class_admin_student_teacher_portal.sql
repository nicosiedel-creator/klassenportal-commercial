PRAGMA foreign_keys = ON;

-- A Klassenadmin is a student with additional class-management rights.
-- Keep a real participant membership alongside the class_admin capability so
-- participant-only rosters, submissions and self-service continue to treat the
-- user exactly like every other student.
INSERT OR IGNORE INTO memberships(id,tenant_id,course_id,user_id,role,created_at)
SELECT 'mem_student_' || lower(hex(randomblob(16))),tenant_id,course_id,user_id,'participant',created_at
FROM memberships
WHERE role='class_admin' AND course_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_class_admin_student_membership_insert
AFTER INSERT ON memberships
WHEN NEW.role='class_admin' AND NEW.course_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO memberships(id,tenant_id,course_id,user_id,role,created_at)
  VALUES('mem_student_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,NEW.user_id,'participant',NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_class_admin_student_membership_update
AFTER UPDATE OF role,course_id ON memberships
WHEN NEW.role='class_admin' AND NEW.course_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO memberships(id,tenant_id,course_id,user_id,role,created_at)
  VALUES('mem_student_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,NEW.user_id,'participant',COALESCE(NEW.created_at,datetime('now')));
END;

-- The teacher portal is deliberately independent from class_admin. A teacher
-- account is linked to an existing teacher master-data record and explicitly to
-- the courses whose attendance/classbook data it may manage. auth_membership_id
-- records only a guest membership created by this assignment so revocation can
-- remove that technical access without touching an independently granted role.
-- One portal user has exactly one teacher identity per course.
CREATE TABLE IF NOT EXISTS teacher_portal_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  auth_membership_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  granted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(auth_membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
  FOREIGN KEY(granted_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,user_id,course_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_portal_user ON teacher_portal_assignments(tenant_id,user_id,status,course_id);
CREATE INDEX IF NOT EXISTS idx_teacher_portal_course ON teacher_portal_assignments(tenant_id,course_id,status,teacher_id);
