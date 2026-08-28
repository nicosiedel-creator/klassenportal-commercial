-- Forward-only repair for production databases that applied historical onboarding migrations.
-- Do not rely on later edits to 0024/0025/0089 being replayed by D1.
--
-- Schema contract: `CREATE TABLE IF NOT EXISTS` can never widen a table that already exists.
-- Both tables below therefore repeat the exact shape 0025/0089 already established, so a
-- historical, a partially migrated and a fresh database all converge on one identical schema.
-- A column declared here that 0025/0089 did not create would exist only on databases that
-- never ran them, and every trigger referencing it would fail on all other databases.

CREATE TABLE IF NOT EXISTS onboarding_claims (
  invitation_id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_claim_tombstones (
  invitation_id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL,
  FOREIGN KEY(invitation_id) REFERENCES onboarding_invitations(id) ON DELETE CASCADE
);

-- 0089 installed the same guarantees under different trigger names. Drop those so a repaired
-- database runs exactly one canonical trigger program per event instead of two overlapping ones.
DROP TRIGGER IF EXISTS trg_onboarding_claim_completed_tombstone;
DROP TRIGGER IF EXISTS trg_onboarding_claim_block_replay;
DROP TRIGGER IF EXISTS trg_onboarding_claim_block_revoke;
DROP TRIGGER IF EXISTS trg_onboarding_claim_skip_expire;

-- Releasing the claim of a completed activation records a durable tombstone. Timestamps stay in
-- the ISO-8601 format the application parses; SQLite's default timestamp format is not ISO-8601.
DROP TRIGGER IF EXISTS trg_onboarding_claim_tombstone_on_delete;
CREATE TRIGGER trg_onboarding_claim_tombstone_on_delete
BEFORE DELETE ON onboarding_claims
FOR EACH ROW
WHEN EXISTS(SELECT 1 FROM onboarding_invitations WHERE id=OLD.invitation_id AND status='completed')
BEGIN
  INSERT OR IGNORE INTO onboarding_claim_tombstones(invitation_id,completed_at)
  SELECT id,COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
