-- Remove the retired second-factor schema and rename the two historical audit
-- fields that now describe password/OIDC reauthentication semantics.
DROP TABLE IF EXISTS platform_mfa_recovery_codes;
DROP TABLE IF EXISTS platform_mfa_challenges;
DROP TABLE IF EXISTS platform_mfa;

ALTER TABLE education_autopilot_policies RENAME COLUMN require_mfa TO require_reauthentication;
ALTER TABLE digital_signatures RENAME COLUMN mfa_verified TO federated_auth;
