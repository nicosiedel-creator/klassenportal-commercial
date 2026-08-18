# EU-first production and security release

This file is an operational release runbook. It intentionally contains no production secrets and does not certify facts that must be verified in the Cloudflare/Brevo accounts.

## Required production posture

The commercial production environment uses `DATA_RESIDENCY_MODE=eu_strict`. In this mode the application fails closed unless the following are explicitly attested after infrastructure verification:

- `EU_D1_JURISDICTION_ATTESTED=true`
- `EU_R2_JURISDICTION_ATTESTED=true`
- `EU_BACKUP_STORAGE_ATTESTED=true`
- `MAIL_PROVIDER=brevo`
- `BREVO_API_KEY` configured as a secret
- `MAIL_FROM` uses a verified sender/domain
- for inbound contract/roster mail: `INBOUND_MAIL_DOMAIN` and a random 32+ character `BREVO_INBOUND_WEBHOOK_TOKEN`

`EU_WORKER_PROCESSING_ATTESTED=true` is set only after Cloudflare Regional Services (or an equivalent verified EU processing control) is actually active. Until then the owner cockpit shows a warning and the legal disclosure does not claim EU-only Worker execution.

## Cloudflare D1

Do not relabel the existing database as EU-resident. D1 jurisdiction is a resource-creation property. Create a new production D1 resource using Cloudflare's EU jurisdiction option, for example:

```bash
npx wrangler@latest d1 create klassenportal-commercial-eu --jurisdiction=eu
```

Then:

1. export the existing source database using the supported Wrangler D1 export path;
2. apply all repository migrations to the new EU database;
3. import/migrate the source data;
4. run integrity/count checks for every tenant and critical table;
5. run the full application E2E acceptance against the EU database;
6. update the production `DB` binding to the verified EU database ID;
7. only then set `EU_D1_JURISDICTION_ATTESTED=true`.

Do not delete the old resource until backup verification and a production acceptance window have completed.

## Cloudflare R2

Do not relabel the existing bucket. Create a new EU-jurisdictional bucket, for example:

```bash
npx wrangler@latest r2 bucket create klassenportal-commercial-files-eu --jurisdiction=eu
```

Copy objects with a checksum-verifying R2/S3-compatible migration. Verify object counts, total bytes and sampled/full hashes before switching the `FILES` binding. Only after verification set `EU_R2_JURISDICTION_ATTESTED=true`.

Backups must target verified EU-jurisdictional object storage. Set `EU_BACKUP_STORAGE_ATTESTED=true` only after a fresh backup has been created, restored in an isolated verification run and its storage location has been checked.

## Worker/edge processing

EU D1/R2 jurisdiction is not used as proof that every HTTP/Worker processing step is EU-only. If Cloudflare Regional Services / a corresponding Data Localization control is purchased and configured for the production hostname, verify it separately and then set `EU_WORKER_PROCESSING_ATTESTED=true`.

## Brevo transactional and inbound mail

Use a dedicated sender domain/subdomain and a separate inbound subdomain. The inbound webhook endpoint is:

```text
POST https://<production-host>/api/inbound/brevo
Authorization: Bearer <BREVO_INBOUND_WEBHOOK_TOKEN>
```

The token must be generated randomly, stored as a Cloudflare secret and entered as Brevo webhook bearer authentication. Never commit it.

The intake path additionally requires an allowed sender and email-authentication evidence (DMARC pass or DKIM+SPF pass) before zero-touch auto-apply. Otherwise the batch is quarantined/reviewed.

The old Resend inbound route is retained solely for controlled non-EU-standard compatibility and returns `410 RESEND_DISABLED_IN_EU_STRICT` in EU-strict mode.

## Stripe boundary

Stripe is restricted to seller/customer B2B billing and payment data. Do not send participant attendance, grades, educational content, uploaded contracts or participant documents to Stripe. Payment identifiers/statuses may be stored in the portal as required for billing and reconciliation.

## Upload security

Automatic intake accepts the minimum useful document set. HTML/HTM and RTF are rejected. PDF signatures are checked. DOCX/ODT archives enforce entry-count and decompression-expansion limits. Unsupported files remain outside automatic processing. Uploaded material is served as attachment with `nosniff`; intake originals are purged after successful automatic application and otherwise expire under the intake retention policy.

A dedicated EU malware-scanning service may be added only if its hosting/subprocessor model is verified. Until then the system must not claim antivirus certification. The current controls are type minimisation, signature/structure checks, archive bomb limits, no active-document execution and quarantine/review.

## Browser/application security

Production CSP does not allow inline JavaScript (`script-src 'self'`). Sessions use Secure/HttpOnly/SameSite=Strict cookies, mutations use same-origin/CSRF checks, passwords use scrypt, owner access uses MFA, public intake is rate limited and anonymous submit-only uploads explicitly omit portal credentials.

## Live release order

1. Create and verify EU D1/R2 resources.
2. Migrate and verify data/files/backups.
3. Configure production domain and HTTPS.
4. Configure Brevo sender + inbound subdomain/webhook.
5. Configure Stripe live + webhook without educational-data sharing.
6. Configure MFA/secrets, SSO secrets and optional Cloudflare for SaaS.
7. Publish the true provider/legal identity and re-check the integrated AGB/Datenschutz/AVV/subprocessor pages.
8. Run the full CI suite and E2E customer flow against the exact production candidate.
9. Review the owner Live-Freigabe cockpit; it must be green.
10. Explicitly approve exactly that Worker version. Every later Worker version is locked again by design.

## External assurance before broad rollout

Before broad paid deployment to schools/publicly funded education providers, obtain an independent penetration test and an external German IT/privacy-law review of the final production configuration and legal texts. Code controls reduce risk but are not a substitute for independent assurance of the deployed environment.
