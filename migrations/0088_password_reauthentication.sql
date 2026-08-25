-- Fresh databases already use the final password-reauthentication and
-- federated-authentication column names. Existing production data was migrated
-- before the EU storage cutover; this stable step keeps new installs aligned.
DELETE FROM d1_migrations WHERE name LIKE '0088_%' AND name <> '0088_password_reauthentication.sql';
SELECT 1;
