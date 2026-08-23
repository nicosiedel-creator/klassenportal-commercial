# Final pre-test scope — 2026-08-21

This is the development/pre-test gate only. It does not authorize production go-live.

## Required before final human acceptance test

- Customer admin: completed onboarding/setup cards collapse/disappear once baseline setup is complete and are replaced by a useful operational area (planning/imports/syncs).
- Rename the floating "Vorsprung" entry to a clearer assistant label and make its tenant-admin context explicit; no raw internal errors such as `TENANT_ADMIN_REQUIRED` may reach users.
- Multi-role routing: platform administrators who also hold tenant roles (including department lead/Fachbereichsleitung) must be able to enter the intended tenant workspace; platform-admin status must not swallow tenant role portals. Provide an explicit workspace/role switch when multiple valid workspaces exist.
- Performance: reduce serial module bootstrapping, duplicate session/tenant/feature requests and avoid full reloads on module switches. Prefer parallel fetches, cached stable context, prefetch of likely next modules and immediate shell rendering.
- Internationalization: introduce a centralized UI locale layer with German as default and robust fallback. Initial target locales: de, en, fr, es, pl, tr, uk, ar. User-selected locale must persist. Locale support must never affect authorization, tenant isolation, audit semantics or stored domain data.
- Student portal review findings from the final manual pass are blockers if they affect correctness, privacy, navigation or basic usability.

## Acceptance rule

Only after the exact branch head passes all mandatory CI/security/privacy/circuit-breaker gates may it merge to main. "Fertig" means ready for the final human acceptance test, not live/production release.
