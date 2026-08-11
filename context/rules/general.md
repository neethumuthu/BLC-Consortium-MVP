---
last_verified: 2026-08-11
source: retroactive
confidence: medium
owner: tech lead
---

# General rules

<!-- Hard rules only — things that are ALWAYS true, loaded into every agent session.
     Preferences and idioms belong in CONVENTIONS.md. Keep under 40 rules; if a rule
     never gets violated, consider whether it still earns its context budget. -->

## Safety

1. Never commit secrets, keys, or `.env*` files; never weaken `ApiKeyGuard` or any
   auth check "temporarily".
2. Never `rm -rf` or otherwise delete inside `crypto/ca-servers/<org>/` once that
   org's MSP is channel-committed. `fabric-ca-server` generates its own root
   keypair on first startup; once that root cert is in a channel's committed
   config, deleting the CA's home directory destroys the only identity that
   could ever sign a corrective update, including the org's own admin. There is
   no safe partial/per-org fix past that point — the only safe recovery is
   `network/scripts/network.sh down --wipe` (a full network wipe-and-redo).
   (Real incident, BLC-31 Phase 9: a targeted cleanup meant to fix an unrelated,
   non-idempotent `fabric-ca-client register` step took the CA's whole home
   directory with it instead of just its identity database, and required a full
   wipe-and-redo to recover — see `docs/ERROR_LOG.md`, 2026-07-13.)
3. `Institution.Status == "active"` (institution-cc) is the single point of
   authorization gating `ProposeNewMember`/`CastVote`/`IssueCertificate` across both
   chaincodes, and it requires no real Fabric identity to flip — only enough real,
   already-active callers casting votes. Never give an automated agent write-capable
   (non-read-only) credentials on a shared environment unless completing a real
   vote/proposal/certificate action is explicitly the task. (Real incident: an
   autonomous QA agent, logged in as BLCFounder, completed real proposals and
   reached real vote quorum on the staging ledger, twice, as an unintended side
   effect of exploring the UI.)
4. Destructive migrations, and any change to what a credential is authorized to do,
   require an explicit human sign-off recorded in the PR.

## Process

5. No code without a change-id (except `skip-spec`-labelled trivia).
6. One atomic commit per task.
7. Context and spec updates go through PRs (`context-gardener`) — never edit
   `context/` or `openspec/specs/` as a side effect of a feature commit.
8. Verify Azure/infra `create` commands with a follow-up `show`/`list` call —
   ambiguous or truncated CLI output is never treated as success or failure on
   its own.
9. Anything meant to run unattended on a staging/production host runs as a
   `systemd` service, not a bare/background process.

## Code

10. Chaincode must never call `time.Now()` — use the transaction's own timestamp
    (`ctx.GetStub().GetTxTimestamp()`), since every endorsing peer must agree
    deterministically.
11. Both chaincodes deploy as chaincode-as-a-service (ccaas), not classic
    packaging.
