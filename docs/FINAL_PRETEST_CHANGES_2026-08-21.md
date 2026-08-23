# Final pre-test polish changes

- Stable app asset key instead of timestamp cache busting on every load.
- Concurrent identical customer-admin GET requests are deduplicated while in flight.
- Completed customer setup is removed from the operational dashboard and replaced by Planning & Data shortcuts.
- Floating “Vorsprung” UI is renamed to “Arbeitsassistent”; raw tenant-admin context errors are translated to an actionable message.
- Fachbereichsleitung portal links now point to the actual `/department-lead.html` entry instead of the stale fallback path.
- Central locale layer expanded to German, English, French, Spanish, Italian, Dutch, Polish, Turkish, Ukrainian, Romanian, Czech, Portuguese and Arabic, with persisted choice and RTL support for Arabic.
- Locale layer loaded by customer-admin, student, teacher, department-lead and platform-admin workspaces.
- Dedicated regression checks added to the mandatory test chain.

This branch remains a pre-test branch. No production go-live is authorized by these changes.
