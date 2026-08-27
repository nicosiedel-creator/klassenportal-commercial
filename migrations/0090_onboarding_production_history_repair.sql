-- Forward-only repair for production databases that applied historical onboarding migrations.
-- Do not rely on later edits to 0024/0025/0089 being replayed by D1.

CREATE TABLE IF NOT EXISTS onboarding_claims (
  invitation_id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  FOREIGN KEY(invitation_id) REFERENCES onboarding_invitations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS onboarding_claim_tombstones (
  invitation_id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY(invitation_id) REFERENCES onboarding_invitations(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_onboarding_claim_tombstone_on_delete;
CREATE TRIGGER trg_onboarding_claim_tombstone_on_delete
BEFORE DELETE ON onboarding_claims
FOR EACH ROW
WHEN EXISTS(SELECT 1 FROM onboarding_invitations WHERE id=OLD.invitation_id AND status='completed')
BEGIN
  INSERT OR IGNORE INTO onboarding_claim_tombstones(invitation_id,completed_at,recorded_at)
  SELECT id,COALESCE(completed_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP
  FROM onboarding_invitations WHERE id=OLD.invitation_id;
END;

DROP TRIGGER IF EXISTS trg_onboarding_claim_replay_guard;
CREATE TRIGGER trg_onboarding_claim_replay_guard
BEFORE INSERT ON onboarding_claims
FOR EACH ROW
WHEN EXISTS(SELECT 1 FROM onboarding_claim_tombstones WHERE invitation_id=NEW.invitation_id)
BEGIN
  SELECT RAISE(ABORT,'ONBOARDING_ALREADY_USED');
END;

DROP TRIGGER IF EXISTS trg_onboarding_revoke_active_claim_guard;
CREATE TRIGGER trg_onboarding_revoke_active_claim_guard
BEFORE UPDATE OF status ON onboarding_invitations
FOR EACH ROW
WHEN NEW.status='revoked' AND EXISTS(SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id)
BEGIN
  SELECT RAISE(ABORT,'ONBOARDING_ALREADY_IN_PROGRESS');
END;

DROP TRIGGER IF EXISTS trg_onboarding_expiry_active_claim_guard;
CREATE TRIGGER trg_onboarding_expiry_active_claim_guard
BEFORE UPDATE OF status ON onboarding_invitations
FOR EACH ROW
WHEN NEW.status='expired' AND EXISTS(SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id)
BEGIN
  SELECT RAISE(IGNORE);
END;
