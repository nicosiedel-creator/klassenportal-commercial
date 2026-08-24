# Commercial release candidate

This candidate is valid only when all mandatory checks pass on the same commit.

- Production origin: `https://klassenportal.app`
- `PAYMENTS_ENABLED=false`; provider calls and checkout remain fail-closed
- Password-only authentication; critical platform actions require password reauthentication and an action-specific confirmation phrase
- Transactional and inbound email use only Cloudflare Email Service / Email Workers
- Class administrators remain students with limited management rights and no access to private student data
- Teacher operations require explicit teacher-to-course assignment in the separate teacher portal

Merge and production deployment are permitted only after the six mandatory PR gates are green on this exact commit.