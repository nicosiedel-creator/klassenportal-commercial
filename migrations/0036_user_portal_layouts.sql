-- Individuelle Kachelanordnung pro Benutzer, Mandant und Klasse/Kurs.
CREATE TABLE IF NOT EXISTS user_portal_layouts (
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, tenant_id, course_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_portal_layouts_course
ON user_portal_layouts(tenant_id, course_id, updated_at DESC);
