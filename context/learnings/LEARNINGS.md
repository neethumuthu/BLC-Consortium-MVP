---
last_verified: 2026-08-12
source: compound loop
confidence: high
owner: context steward (rotating)
---

# Learnings (compound log)

<!-- Newest first. Entry format below. When a learning hardens into a permanent rule,
     move it to rules/ or CONVENTIONS.md and replace the body with a link.
     Prune quarterly: anything not referenced in 6 months gets archived. -->

## 2026-08-11 — Single-org-endorsed `peer chaincode invoke` reports success but never commits `[graduated → rules/general.md#process, rule 9]`

- **Symptom:** During the staging wipe/redeploy, `RegisterInstitution` invokes
  reported `Chaincode invoke successful` with a real, correctly-shaped payload.
  A follow-up `GetAllInstitutions` read immediately after showed the ledger
  empty — the write had never actually happened.
- **Root cause:** The channel's `Application` group endorsement policy is
  `MAJORITY Endorsement` (a majority of orgs, each `OR('OrgMSP.peer')`,
  from `generated/configtx.yaml`). The invoke had only one org's
  `--peerAddresses`/`--tlsRootCertFiles` pair. A single-org-endorsed
  transaction passes *simulation* cleanly (real payload, real "successful"
  message) but fails *validation* at commit, silently — the peer CLI has no
  way to report this back to the caller, since from its point of view the
  simulation genuinely succeeded.
- **Rule adopted:** Every mutating `peer chaincode invoke` against this
  channel must include enough orgs' `--peerAddresses`/`--tlsRootCertFiles`
  pairs to satisfy majority endorsement, and every mutating invoke must be
  followed by an independent read-back (e.g. `GetAllInstitutions`) before
  being trusted — never the CLI's own success message alone.
- **Origin:** `docs/BUILD_LOG.md` Phase 16 / `docs/ERROR_LOG.md`, 2026-08-11
  (staging wipe and fresh redeploy).
