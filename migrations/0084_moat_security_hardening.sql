-- Security hardening for training moat.
-- Evidence rows/packages are append-only. Compliance automation is cursor-bounded.
CREATE TABLE IF NOT EXISTS compliance_automation_state(
  id TEXT PRIMARY KEY CHECK(id='singleton'),
  last_tenant_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_compliance_evidence_immutable_update
BEFORE UPDATE ON compliance_evidence BEGIN SELECT RAISE(ABORT,'COMPLIANCE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_compliance_evidence_immutable_delete
BEFORE DELETE ON compliance_evidence BEGIN SELECT RAISE(ABORT,'COMPLIANCE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_compliance_package_immutable_update
BEFORE UPDATE ON compliance_evidence_packages BEGIN SELECT RAISE(ABORT,'COMPLIANCE_PACKAGE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_compliance_package_immutable_delete
BEFORE DELETE ON compliance_evidence_packages BEGIN SELECT RAISE(ABORT,'COMPLIANCE_PACKAGE_IMMUTABLE'); END;
