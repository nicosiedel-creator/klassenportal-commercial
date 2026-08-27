-- Keep onboarding activation compatible with databases that applied the original 0024 CHECK
-- constraint (open/completed/revoked/expired only), while closing the stale concurrent-request race.
-- 0025_onboarding_claims is the atomic in-flight claim. Successful claim deletion records a
-- durable tombstone so a request that read the invitation as open before completion can never
-- acquire a fresh claim afterwards.
CREATE TABLE IF NOT EXISTS onboarding_claim_tombstones (
  invitation_id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL,
  FOREIGN KEY(invitation_id) REFERENCES onboarding_invitations(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_onboarding_claim_completed_tombstone
BEFORE DELETE ON onboarding_claims
WHEN EXISTS (
  SELECT 1 FROM onboarding_invitations
  WHERE id=OLD.invitation_id AND status='completed'
)
BEGIN
  INSERT OR IGNORE INTO onboarding_claim_tombstones(invitation_id,completed_at)
  VALUES(OLD.invitation_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_onboarding_claim_block_replay
BEFORE INSERT ON onboarding_claims
WHEN EXISTS (
  SELECT 1 FROM onboarding_claim_tombstones
  WHERE invitation_id=NEW.invitation_id
)
BEGIN
  SELECT RAISE(ABORT,'ONBOARDING_ALREADY_USED');
END;

-- A revoke must not overtake an activation after its atomic claim has been acquired.
CREATE TRIGGER IF NOT EXISTS trg_onboarding_claim_block_revoke
BEFORE UPDATE OF status ON onboarding_invitations
WHEN OLD.status='open' AND NEW.status='revoked' AND EXISTS (
  SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'ONBOARDING_ALREADY_IN_PROGRESS');
END;

-- Expiry housekeeping may race with an already claimed request. Skip only that row; the
-- activation itself re-checks expires_at before provisioning and releases an invalid claim.
CREATE TRIGGER IF NOT EXISTS trg_onboarding_claim_skip_expire
BEFORE UPDATE OF status ON onboarding_invitations
WHEN OLD.status='open' AND NEW.status='expired' AND EXISTS (
  SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id
)
BEGIN
  SELECT RAISE(IGNORE);
END;
