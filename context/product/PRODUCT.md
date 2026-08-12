---
last_verified: 2026-08-12
source: code-derived + existing docs (ARCHITECTURE.md, archived V1_PHASE_OVERVIEW.md), no workshop yet
confidence: low
owner: unassigned — needs a PM/PO pass; this is a placeholder, not their sign-off
---

# Product

**This file is a stand-in, not the real thing.** The template this follows
calls for `source: workshop` and `owner: PM/PO` — this project has neither
yet (no `context/product/` existed before today, and the tutorial's Stage E
team workshops that would normally produce this haven't happened). Everything
below is inferred from `ARCHITECTURE.md`, the archived `V1_PHASE_OVERVIEW.md`,
and the actual chaincode/backend/frontend behavior — treat it as a draft to
correct in Stage E, not a settled product definition.

## What it is

BLC-31 is a Hyperledger Fabric consortium blockchain application for a group
of institutions to jointly govern membership and issue verifiable
certificates. Two capabilities, built on the same permissioned ledger:
institution governance (propose/vote a new institution into the consortium)
and certificate lifecycle (issue, verify, revoke). No end-consumer-facing
surface exists — every user is an institution's own admin, operating that
institution's dashboard/API instance.

## Who uses it

One user type today: an institution's own operator, through that
institution's dedicated frontend/backend instance (one `.env.<org>` per org,
one cosmetic login account per org — see `frontend/src/lib/institutions.ts`).
There is no cross-institution user, no end-customer login, and no
per-human-user accounts within an institution (`ARCHITECTURE.md` Key
Decision #11 — one fixed account per institution, not per person). Whether a
broader user type (e.g. a certificate holder verifying their own certificate
externally) is intended is **unverified** — `VerifyCertificate`/`GetCertificate`
are read-only with no caller restriction, which is consistent with that idea
but not confirmed as an actual product intent anywhere read so far.

## What matters most

Inferred from what the code actually enforces, not asserted from a workshop:

- **No institution can unilaterally add or remove a member.** Membership
  changes require a majority vote among active institutions
  (`requiredVotesToApprove`, `chaincode/institution-cc/governance.go`) — this
  is enforced at the chaincode layer, not just a UI convention.
- **A certificate's issuer is permanently fixed and exclusive.** Only the
  original issuing institution can ever revoke a certificate it issued — not
  a vote, not any other institution, not even the platform itself
  (`RevokeCertificate`'s exact-issuer-match check).
- **Certificate integrity is independently checkable, not just trusted.**
  `VerifyCertificate` recomputes a content hash rather than trusting a stored
  "valid" flag — tampering is detected even if the stored status claims
  otherwise.
- **Deterministic, auditable writes over convenience.** IDs are transaction
  IDs, not UUIDs, specifically so every endorsing peer computes the identical
  value (`context/codebase/CONVENTIONS.md`'s doc-derived entry) — a real
  engineering constraint that traces back to a product-level need for
  multi-party agreement on every write.

**Unverified — flag for Stage E:** whether these are actually the 3-5
qualities that "win or lose this product" from a PM/PO's perspective, or
just the ones most visible from reading code, is exactly the kind of
judgment this file's real owner should make, not something derivable from
source alone.

## What we are NOT building

From the archived `V1_PHASE_OVERVIEW.md`'s "Explicitly out of scope for v1.0"
list, corrected against what has since shipped (see `context/CONFLICTS.md`
for the two items that list already got wrong by the time of writing):

- **Licensing** (planned as v1.01) — an institution licensing its
  certificate brand to partner institutions. Still genuinely unbuilt, unlike
  the other two items originally on this list.
- ~~Governance/voting via the API~~ — **shipped**, not a non-goal anymore
  (`governance-vote-status`, GitHub issue #8, archived 2026-08-11).
- ~~HTTP authentication~~ — **shipped**, not a non-goal anymore (`ApiKeyGuard`,
  2026-07-28).
- **Per-human-user accounts, token expiry/revocation, rate-limiting** — still
  explicitly not built (`ARCHITECTURE.md` Key Decision #10's "what this does
  not add").
- **A public, non-institution certificate-verification surface** — no such
  surface exists today; whether one is actually wanted is unverified (see
  "Who uses it" above).

## Current focus

**Real roadmap direction, from informal planning/scoping notes shared
2026-08-12 — not a formal Stage E workshop, but the first actual roadmap
input this file has had.** Confidence on this section specifically is
higher than the rest of this file, though still not a PM/PO sign-off.

- **v1.0 (current):** consortium creation via institution onboarding and
  approval, staged rather than all at once — the first institution
  establishes the consortium, then a second and third institution join
  afterward. Matches what's already built (`institution-governance-ui`,
  `institution-directory`).
- **v1.01 (next): certificate licensing/partnership.** An institution
  licenses its certificate brand to partner institutions, who can then
  issue certificates under their own name with an "official partner of
  \<institution\>" designation. This is the one item this file's own "What
  we are NOT building" section above already flagged as still genuinely
  unbuilt — now confirmed as the actual next-quarter target, not just a
  distant non-goal. Being scoped as a real capability at
  `openspec/changes/certificate-licensing/`.

**Two real open questions in the notes, genuinely unresolved — not
guessed here, carried forward as actual Open Questions in the
`certificate-licensing` change instead:**
1. Does a partnering institution need vetting before it can license a
   certificate brand, or only once the network scales past the first few
   institutions?
2. Should the 66%-of-institutions-agree governance threshold be decided
   now, or is it safe to defer until the network has more than two or
   three institutions — and if deferred, what does adding it later
   actually cost?

Do not treat either question as answered anywhere else in this file or in
`DOMAIN.md` until they're resolved.
