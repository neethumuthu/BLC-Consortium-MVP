---
status: proposed
date: 2026-07-30
source: retroactive (reconstructed 2026-07-30 from docs/ERROR_LOG.md's 2026-07-13 entry, "my own 'targeted cleanup' recovery step destroyed InstitutionB's CA root identity, permanently orphaning its already-committed MSP definition")
deciders: Neethu Muthu
---

# ADR-0001: Never delete inside `crypto/ca-servers/<org>/` once that org's MSP is channel-committed

## Context

`org-add.sh`'s stage-2 CA identity registration is not idempotent — `fabric-ca-client register` rejects re-registering an identity that already exists, which creates real pressure to "clean up" registered identities before retrying a failed run. During a live `InstitutionB` onboarding retry, a targeted cleanup step deleted `crypto/ca-servers/InstitutionB` specifically to clear that registration conflict, believed to be a scoped, surgical fix. `fabric-ca-server` generates its own root CA keypair on first startup and persists it inside that same directory — and the moment an org's MSP is injected into the channel (`org-add.sh` stage 3), that specific root cert is permanently embedded in the channel's trust config. Deleting the directory afterward destroys the root keypair itself, not just the registered-identity database the cleanup was meant to target, and there is no way to make the channel trust a replacement. `org-add.sh` has no code-level guard against this today — the mistake was in a manually-run recovery command, not in the script.

## Decision

Never delete, or instruct deletion of, any files inside `crypto/ca-servers/<org>/` (or any CA's own home directory) for an organization whose MSP has already been injected into the channel — that is, any `founding`/`member` org, or any `pending` org for which `org-add.sh` stage 3 has already run. If a stage-2 identity-registration conflict needs clearing for such an org, the only safe recovery is a full `network.sh down --wipe` and complete redo (redeploy chaincode, re-register founders, re-propose/re-vote any onboarded org) — never a partial or "just this one org" crypto deletion, regardless of how scoped or surgical it appears.

## Consequences

Easier: any future agent or human has one unambiguous check to run before touching `crypto/ca-servers/<org>/` — has this org's MSP already been committed to the channel? If yes, the directory is off-limits, full stop. Harder: recovering from a stage-2 registration conflict for an already-committed org now always costs a full network wipe and redo rather than a fast targeted fix — meaningfully more expensive, but the alternative is unrecoverable, silent trust breakage. Watch for: `org-add.sh` still has no code-level guard preventing this deletion from being run again by hand; adding one (a wrapper check, or refusing the delete for any org already listed as `member`/`pending`-past-stage-3 in `network.yaml`) would close the gap this ADR currently only documents.

## Alternatives considered

Not recorded — the source incident describes a mistake and the resulting rule directly, not a set of weighed alternatives at decision time.
