PRAGMA foreign_keys = ON;

-- Participant absences may be reported as sickness or another absence category.
-- Store only the operational category and period; never diagnoses or free-text health details.
ALTER TABLE absence_notices ADD COLUMN category TEXT NOT NULL DEFAULT 'unspecified'
  CHECK(category IN ('sickness','medical_appointment','approved_absence','other','unspecified'));
ALTER TABLE absence_notices ADD COLUMN source TEXT NOT NULL DEFAULT 'portal'
  CHECK(source IN ('portal','email','admin','api'));
ALTER TABLE absence_notices ADD COLUMN source_ref_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_absence_notice_source_ref
  ON absence_notices(tenant_id,source_ref_hash)
  WHERE source_ref_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_absence_notice_course_period
  ON absence_notices(tenant_id,course_id,starts_on,ends_on,status);

-- One dedicated inbound mailbox per tenant. It reuses the hardened intake-channel
-- address model, but absence messages are parsed in memory and the raw body/attachments
-- are deliberately not written to intake_documents or R2.
CREATE TABLE IF NOT EXISTS absence_intake_channels (
  tenant_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(channel_id) REFERENCES intake_channels(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Dedupe/audit envelope only. No raw subject, body, attachment or diagnosis is stored.
CREATE TABLE IF NOT EXISTS absence_inbound_messages (
  message_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  notice_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('submitted','review','ignored','duplicate','failed')),
  error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(channel_id) REFERENCES intake_channels(id) ON DELETE CASCADE,
  FOREIGN KEY(notice_id) REFERENCES absence_notices(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_absence_inbound_tenant_time
  ON absence_inbound_messages(tenant_id,received_at DESC);
