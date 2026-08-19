PRAGMA foreign_keys = ON;

-- Rich, lesson-specific information shown from the weekly timetable.
CREATE TABLE IF NOT EXISTS lesson_hub_details (
  lesson_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  planned_topic TEXT,
  info_text TEXT,
  delivery_mode TEXT CHECK(delivery_mode IN ('onsite','remote','hybrid')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_hub_details_course ON lesson_hub_details(tenant_id,course_id,lesson_id);

CREATE TABLE IF NOT EXISTS lesson_hub_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_hub_links_lesson ON lesson_hub_links(tenant_id,course_id,lesson_id,sort_order,title);

-- Materials remain normal learning materials in R2 and can be reused by several lessons.
CREATE TABLE IF NOT EXISTS lesson_hub_materials (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  attached_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(lesson_id,material_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY(material_id) REFERENCES portability_files(id) ON DELETE CASCADE,
  FOREIGN KEY(attached_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_hub_materials_lesson ON lesson_hub_materials(tenant_id,course_id,lesson_id,sort_order);

-- Personal lesson notes are private to the participant. Neither teachers nor admins need a read path.
CREATE TABLE IF NOT EXISTS lesson_private_notes (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,lesson_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lesson_private_notes_user ON lesson_private_notes(tenant_id,course_id,user_id,updated_at DESC);
