---
last_verified: 2026-08-13
source: compound loop
confidence: high
owner: context steward (rotating)
---

# Learnings (compound log)

<!-- Newest first. Entry format below. When a learning hardens into a permanent rule,
     move it to rules/ or CONVENTIONS.md and replace the body with a link.
     Prune quarterly: anything not referenced in 6 months gets archived. -->

## 2026-08-13 — Fixing one stale context claim leaves its siblings stale unless the fix greps for the claim, not just the file that prompted it

Graduated to a permanent rule after a third confirmed recurrence (PR #15 →
swept in PR #16 → recurred again in PR #17). See `context/rules/general.md`,
rule 11.

## 2026-08-12 — Correcting an already-archived change's docs needs a visible strikethrough + dated note, never a silent rewrite

- **Symptom:** `openspec/changes/archive/2026-08-12-test-api-key-guard-read-only/tasks.md` claimed PR #15 had corrected `TESTING.md`'s inaccurate ESLint claim. PR #16's Ring 2 review found that claim itself wasn't true when the change was archived — the edit had actually been reverted from PR #15 (per rule 7) and only landed later, in PR #16. The archived record needed fixing, but it also documents what actually happened at merge time.
- **Root cause:** An archived change's `proposal.md`/`tasks.md` is a historical record, not a living doc — quietly editing it to match current reality erases the fact that the original claim was wrong when merged, which is exactly the kind of drift a future reader relies on this record to catch.
- **Rule adopted:** When an archived change's proposal/tasks doc turns out to contain an inaccurate claim, correct it with a visible strikethrough plus a dated correction note explaining what was actually true and when the fix landed — never a silent rewrite of the archived text.
- **Origin:** PR #16 (`cd6500c`), validated by that PR's own Ring 2 review as matching established practice in this repo's review history.

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
