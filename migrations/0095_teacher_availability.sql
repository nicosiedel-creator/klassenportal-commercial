-- Wann eine Dozentin oder ein Dozent arbeiten MOECHTE.
--
-- Bisher kannte das Portal nur die Abwesenheit - also wann jemand nicht kann. Fuer
-- Honorarkraefte ist das Gegenteil noetig: sie geben selbst an, wann sie zur Verfuegung stehen.
--
-- Bewusst opt-in: wer keine Zeile fuehrt, wird geplant wie bisher. Erst wer mindestens ein
-- Fenster angibt, wird ausschliesslich innerhalb seiner Fenster vorgeschlagen. Sonst wuerde die
-- Einfuehrung dieser Tabelle alle bestehenden Mandanten ueber Nacht planungsunfaehig machen.
CREATE TABLE IF NOT EXISTS teacher_availability (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  -- 1 = Montag ... 7 = Sonntag, nach ISO.
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
  starts_time TEXT NOT NULL,
  ends_time TEXT NOT NULL,
  -- Optional befristet: eine Zusage kann nur fuer ein Semester gelten.
  valid_from TEXT,
  valid_until TEXT,
  -- 'available' = moechte arbeiten, 'preferred' = arbeitet hier besonders gern.
  preference TEXT NOT NULL DEFAULT 'available' CHECK(preference IN ('available','preferred')),
  note TEXT,
  -- Wer die Zeile gesetzt hat: die Person selbst oder die Verwaltung.
  source TEXT NOT NULL DEFAULT 'teacher' CHECK(source IN ('teacher','admin','import')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(starts_time < ends_time),
  CHECK(valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_lookup ON teacher_availability(tenant_id,teacher_id,weekday);
