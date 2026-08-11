## Context

See proposal.md for motivation. Relevant existing state: `institution-cc`'s `Vote` record (`chaincode/institution-cc/model.go`) is already keyed by a composite of `(proposalId, votedBy)` — a direct `GetState` lookup, not a rich query, can already answer "did MSP X vote on proposal Y, and how" cheaply. `GetOpenProposals` (added by the archived `voting-governance-ui` change) only ever queries `status: "open"`; there is no equivalent for resolved proposals. The original change's own design.md chose a chaincode query over an off-chain index specifically to keep the ledger the sole source of truth (no second system to drift) — that reasoning applies unchanged here.

## Goals / Non-Goals

**Goals:**
- Surface, per open or resolved proposal, whether the *calling* institution has voted and its decision — without exposing other institutions' votes (not required by the spec, and a more conservative default).
- Make resolved proposals discoverable from the same governance list an institution already checks, without requiring it to already know a proposal ID.

**Non-Goals:**
- Showing every institution's individual vote (only the caller's own) — no spec scenario asks for this, and it's easy to add later without a breaking change if ever needed.
- A `/governance/:id` detail page. The spec requires *discoverability*, which a "recently closed" list section satisfies on its own; a detail page would be a nice-to-have, not required, and is left out to keep this change tightly scoped.
- Any bound/pagination on resolved proposals — same reasoning the original change already applied to `GetOpenProposals`: this consortium's real scale (a handful of institutions/proposals) doesn't need it, and adding it now would be solving for a scale this project doesn't have.
- Changing anything about approval/rejection logic itself. `CastVote` already implements and tests a real "majority-unreachable" rejection path (`castvote_test.go`) — this change only surfaces proposals that already resolved one way or the other; it doesn't touch how or when that resolution happens. (Correction: an earlier draft of this document claimed rejection was unimplemented, based on a stale comment in `queries.go` that was never updated after the rejection logic landed in `governance.go` — that comment is wrong and worth fixing separately, but is not part of this change.)

## Decisions

**Compute per-caller vote status in the chaincode via a direct `GetState` lookup on the existing `Vote` composite key, not a new stored field on `MembershipProposal`.**

`MembershipProposal` is a persisted ledger asset — its stored shape must not vary by which caller reads it. Instead, `GetOpenProposals`/the new `GetResolvedProposals` return a separate, caller-relative wrapper (e.g. `ProposalWithVoteStatus`: the existing `MembershipProposal` fields plus a `callerVoteDecision` field, `"yes"`/`"no"`/absent) computed fresh per call by looking up `voteKey(proposalID, callerMSP)` — an O(1) key read, not a rich query, since the composite key already exists for exactly this lookup. `GetProposal` (single-proposal-by-ID lookup) gets the same treatment for consistency.

Alternatives considered:
- *Add a `Votes []Vote` field directly to the stored `MembershipProposal` asset*: rejected — conflates "what's on the ledger" with "what's relevant to one caller," and would require a chaincode data migration for every existing proposal (including today's real ones, e.g. issue #8's own repro proposals).
- *Have the backend query votes separately and merge*: rejected for the same reason the original change rejected an off-chain index — the backend isn't the source of truth for chaincode state, and a second round-trip per proposal doesn't need to exist when a single-key lookup is already cheap inside the chaincode call.

**Add a new `GetResolvedProposals` chaincode function, purely additive, rather than changing `GetOpenProposals`'s signature.**

Symmetric to how `GetOpenProposals` itself already queries by `status`, this adds one new CouchDB rich-query function (`status: {"$in": ["approved", "rejected"]}`) rather than turning `GetOpenProposals` into a parameterized `GetProposals(status)` that would change an already-deployed, already-called function's contract. Purely additive, matching this project's stated preference (the archived change's own "no existing endpoint or UI behavior changes" framing).

**Frontend: a "Recently closed" section on the existing governance page, populated from the new query — no new route.**

Satisfies the spec's discoverability requirement directly from the page an institution already checks for governance activity, without adding a second page/route for what is, at this project's scale, a short list.

## Risks / Trade-offs

- [Risk] `GetOpenProposals`/`GetProposal`/the new `GetResolvedProposals` all change their return shape (new wrapper type, not the raw `MembershipProposal`) → [Mitigation] this is additive from the backend's perspective (`callerVoteDecision` is a new optional field on the DTO, existing fields unchanged) — no existing backend or frontend code that reads `votesFor`/`votesAgainst`/`status` needs to change.
- [Risk] Same chaincode-redeploy cost the original change already flagged for `GetOpenProposals` — a new function means a version bump across every institution's peer, not just an app-layer deploy → [Mitigation] scope the chaincode change as its own early task, verified with unit tests before any backend/frontend work depends on it (same mitigation the original change used).
- [Risk] The two fake institutions currently on staging (`InstitutionQAMSP`, "QA Ring3 Candidate Institution" — see `docs/ERROR_LOG.md`, 2026-08-11) will show up in "Recently closed" once this ships, since their proposals really did resolve → [Mitigation] none needed — this is accurate, not a bug; they're a known, deliberately-kept fixture of staging's current state.

## Migration Plan

No data migration needed — `MembershipProposal`'s stored shape is unchanged; only query-time response wrapping is new. Deploy order matches the archived change's own precedent: chaincode (new query, version bump, redeploy across peers) before backend (new DTO field) before frontend (render the new field, add the "Recently closed" section) — each step independently verifiable, so a problem in one doesn't block rolling back just that layer.
