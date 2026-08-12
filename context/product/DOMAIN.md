---
last_verified: 2026-08-12
source: code-derived, no workshop yet
confidence: low
owner: unassigned — needs a PM/PO + tech lead pass; this is a placeholder
---

# Domain

**Same caveat as `PRODUCT.md`:** no `context/product/` existed before today,
and this hasn't been through the real Stage E workshop. Every term and
invariant below was extracted directly from chaincode/backend source, not
agreed by the team — treat `confidence: low` literally.

## Glossary

| Term | Means | Never confuse with |
|---|---|---|
| Institution (ledger record) | An `institution-cc` on-chain record (`Institution` struct) — created only once, either by `InitLedger` for a founding org, or by `CastVote` reaching approval threshold for a proposed org. In practice, always has `Status: "active"` — no code path in the current chaincode ever assigns `"pending"` or `"rejected"` to this field, even though the struct's own comment lists both as possible values. | The organization's entry in `network/config/network.yaml`, which is a *different* status track entirely (see next row). |
| Organization status (`network.yaml`) | The infra-layer field `founding \| pending \| member` on an org entry in `network/config/network.yaml`, flipped `pending → member` by `org-add.sh` after a channel config-update succeeds. | An Institution ledger record's existence or `Status` field. `ARCHITECTURE.md` Key Decision #12: after a full network wipe, an org can be `status: member` here while having **no** `Institution` ledger record at all, until its governance ceremony (`ProposeNewMember` + enough `CastVote`s) is manually redone. These two "membership" concepts are independently tracked and can genuinely diverge. |
| Proposal | A `MembershipProposal` record (`institution-cc`), one per candidate institution, `Status: open \| approved \| rejected`. Created by `ProposeNewMember`, resolved by `CastVote`. | A vote (below) — a proposal is the thing being decided; a vote is one institution's decision on it. |
| Vote | A `Vote` record, one per (proposal, voting institution) pair, `Decision: yes \| no`. Immutable once cast — `CastVote` rejects a second vote from the same institution on the same proposal rather than overwriting it. | Approval/rejection of the proposal itself — a single vote never resolves a proposal on its own except at the threshold-crossing moment. |
| Active institution | Shorthand used throughout the codebase and specs for "an `Institution` record exists with `Status: "active"`" — the single authorization gate for `ProposeNewMember`/`CastVote`/`IssueCertificate` across both chaincodes (`context/rules/general.md` rule 3). | "A member of the consortium" in a colloquial sense — an org can be `network.yaml: member` and not be an active institution at all (see Organization status, above). |
| Certificate issuer | The institution whose MSP ID is recorded as `IssuerID` at issuance time — permanently fixed, checked by exact match for revocation, regardless of whether that institution is still active later. | "Whichever institution currently administers this certificate" — there is no transfer-of-issuer mechanism; the issuer identity never changes after creation. |

## Business invariants

Each one below maps directly to a specific code check, not an assumption:

1. **A resolved membership proposal never re-opens.** `CastVote` only ever
   operates on proposals with `Status: "open"`; nothing in either chaincode
   re-opens an `approved`/`rejected` proposal. (`governance.go`'s `CastVote`
   status checks.)
2. **An institution cannot vote twice on the same proposal, and cannot
   change a cast vote.** Enforced by an existence check on the
   `(proposalID, callerMSP)` vote key before allowing a new vote.
   (`governance.go`, `queries.go`'s `voteKey`/`withCallerVoteStatus`.)
3. **An institution cannot vote on its own proposal.** `CastVote` rejects
   the applicant voting on the proposal it submitted.
4. **A revoked certificate can never be un-revoked.** `RevokeCertificate`
   rejects a certificate already at `Status: "REVOKED"` with a 409; no
   function in `certificate-cc` sets a certificate's status back to
   `"VALID"`.
5. **Only the exact original issuer can revoke a certificate — permanently,
   regardless of that institution's later active/inactive status.**
   `RevokeCertificate`'s authorization check is an exact `IssuerID ==
   callerMSP` match, deliberately not gated by `requireActiveInstitution`
   (see the function's own comment).
6. **A certificate's recorded hash is checked before its revocation
   status, every time.** `VerifyCertificate` reports `TAMPERED` even for a
   certificate that has also been revoked — integrity is checked first, in
   that priority order, not the other way around.

**Unverified — flag for Stage E:** whether these six are the actual
business-critical invariants a PM/PO would name, or simply the ones visible
from reading the two chaincodes, is a real question this file's eventual
owner should answer, not one code alone can settle.

## Key entity lifecycle

**Institution (ledger record):**
```
(does not exist)
  --InitLedger (founding org)-------------------> active
  --ProposeNewMember + enough CastVote "yes"----> active
```
No other transition exists in the current chaincode — no suspend, no
deactivate, no reject-after-creation path. (Confirmed directly: no such
function exists in `institution-cc` — checked specifically, not assumed,
during the earlier agentic-qa cleanup-options review this same week.)

**Membership proposal:**
```
open --CastVote reaches majority-yes-------> approved
open --CastVote makes majority-yes mathematically impossible--> rejected
open --(otherwise)--------------------------> open (unchanged)
```

**Certificate:**
```
(does not exist) --IssueCertificate--> VALID
VALID --RevokeCertificate (issuer only)--> REVOKED
REVOKED --(no transition out)-->  REVOKED (terminal)
```
`VerifyCertificate` is a read-only check layered on top of this, not a
state transition — `TAMPERED` is a verification-time judgment (hash
mismatch), not a stored status value.
