-- Fresh databases already use the final password-reauthentication and
-- federated-authentication column names. Existing production data was migrated
-- before the EU storage cutover; this stable step keeps new installs aligned.
SELECT 1;
