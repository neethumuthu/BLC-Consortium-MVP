## Context

See proposal.md for motivation. The one thing worth restating here: every governance rule this change touches (majority threshold, one-vote-per-institution, applicant-can't-vote-on-own-proposal, double-vote rejection) already exists and is tested in `institution-cc/governance.go`/`castvote_test.go`. This design is entirely about exposing that existing logic through the product, not designing new governance rules.

State is backed by CouchDB (confirmed elsewhere in this project's context), which Fabric chaincode can query with rich CouchDB selectors, not just key lookups — relevant to the Decisions below.

## Goals / Non-Goals

**Goals:**
- Expose `ProposeNewMember` and `CastVote` through new backend endpoints and a new frontend UI.
- Let an institution discover which proposals are open without already knowing a proposal ID.

**Non-Goals:**
- Changing the majority-vote threshold, or any other governance rule (per `governance.go`'s own comment, that's a swappable-function design decision tracked separately, not part of this change).
- Notifications/alerts when a new proposal opens (out of scope; institutions check the UI).

## Decisions

**Add a new chaincode query function (`GetOpenProposals`) rather than maintaining an off-chain index in the backend.**

Alternatives considered:
- *Off-chain index in the backend* (e.g. a table the backend updates whenever it submits a propose/vote transaction): rejected. It would need to stay in sync with on-chain state independent of the backend that wrote it (another institution's own backend instance can also submit these transactions directly), creating a second source of truth that can drift — exactly the kind of split this project already avoids elsewhere (single source of truth via chaincode).
- *New chaincode query function using a CouchDB rich-query selector* (`docType: "proposal", status: "Open"`): chosen. CouchDB is already the state database; this keeps the ledger as the sole source of truth, requires no new backend-side storage, and is consistent with how `GetAllInstitutions`/`GetProposal` already work.

Cost of this decision: a new chaincode function means a chaincode version bump and redeploy (per this project's existing chaincode-as-a-service deployment pattern), not just an application-layer change. Reflected in tasks.md.

## Risks / Trade-offs

- [Risk] A new chaincode function requires redeploying chaincode across every institution's peer, not just a backend/frontend deploy → [Mitigation] scope this as its own early task in tasks.md, done and verified before any UI work depends on it, so UI work isn't blocked mid-stream by a chaincode deployment issue.
- [Risk] `GetOpenProposals` returning every open proposal in one call could grow unbounded as more institutions/proposals accumulate → [Mitigation] acceptable for this project's actual scale (a consortium of a handful of institutions); not solving for a scale this project doesn't have.
