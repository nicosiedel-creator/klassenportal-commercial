# EU security release runbook

## Mandatory production configuration

- `APP_ORIGIN=https://klassenportal.app`
- `PAYMENTS_ENABLED=false`
- Cloudflare Email Service binding `EMAIL`
- `MAIL_FROM=Klassenportal <noreply@klassenportal.app>`
- `INBOUND_MAIL_DOMAIN=klassenportal.app`
- D1, R2 and Worker EU placement attestations required by the readiness gate
- tenant-secret encryption key for optional Microsoft connections

## Authentication and privileged actions

All roles use password or configured OIDC authentication. Password login is protected by hardened scrypt hashing, rate limits, secure cookies, idle limits and tenant/role isolation. Critical platform actions require the current password again and an action-specific confirmation phrase.

## Mail

Outbound transactional mail uses only the native Cloudflare email binding. Inbound messages use the Worker's native email handler, bounded parsing, sender authorization and tenant-safe intake processing. No HTTP mail-provider webhook is part of the production contract.

## Payment freeze

Payment processing is intentionally disabled and is not a release blocker. Checkout and payment-status mutations fail with `PAYMENT_DISABLED`; the frozen webhook acknowledgement performs no provider call or side effect.

## Release evidence

The exact candidate commit must pass all six mandatory GitHub gates, all local D1 migrations, the browser syntax pass and the release check. After merge, verify the deployed commit and complete the live acceptance chain on `https://klassenportal.app`.
