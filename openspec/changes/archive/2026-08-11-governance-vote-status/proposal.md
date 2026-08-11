## Why

The Ring 3 QA agent (`agentic-qa`) found, live on staging, that the governance UI never shows per-institution vote status anywhere — not on the open-proposals list, not after a rejected double-vote attempt, and not once a proposal resolves (GitHub issue #8). Two of these three gaps are actually failures to meet requirements `institution-governance-ui/spec.md` already states ("Pending proposals are listed" already requires showing "whether this institution has already voted"; "Double-voting is rejected" already requires showing "the institution's existing vote"). The third — a resolved proposal becoming completely undiscoverable to an institution that never got to vote on it — isn't covered by any existing scenario at all. The root cause is a scope gap in the original voting-governance-ui change (`openspec/changes/archive/2026-08-05-voting-governance-ui/`): its design.md worked out how to discover *open* proposals (`GetOpenProposals`) but never worked out how per-institution vote status would be surfaced, or what happens to a proposal once it's no longer open.

## What Changes

- `MembershipProposalDto` (and whatever chaincode query backs it) gains per-institution vote status — whether the *calling* institution has voted on a given proposal, and its decision if so. The chaincode's `Vote` record (`chaincode/institution-cc/model.go`) already stores this (keyed by `proposalId`+`votedBy`); no new data needs to be captured, only surfaced.
- The governance page replaces an open proposal's Yes/No voting control with the institution's own recorded decision once it has voted, instead of leaving both buttons enabled after voting (and after a rejected double-vote attempt).
- Resolved proposals (approved **or rejected** — `CastVote` already has a real, tested "majority-unreachable" path that resolves a proposal to `rejected` once approval becomes mathematically impossible, see `castvote_test.go`) remain discoverable after they close, with their final status and tally visible — not just to institutions that already knew the proposal ID, but from the same place an institution would look for anything governance-related. Exact mechanism (a "recently closed" section on the existing list vs. a `/governance/:id` detail page against the existing `GetProposal` endpoint) is a design decision, not fixed here.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `institution-governance-ui`: sharpens two existing scenarios and adds one new one —
  - "Pending proposals are listed" needs a concrete, testable definition of what "whether this institution has already voted" means in the response shape (not just prose).
  - "Double-voting is rejected" needs the rejection to make the institution's existing decision available to the UI, not just a generic error — the current implementation shows a generic message and leaves the voting control enabled.
  - New scenario needed for: an institution that never voted on a proposal before it resolved must still be able to discover that it existed and how it was decided. No current scenario covers discovery of a proposal *after* it leaves the open list.

## Impact

- **Chaincode** (`institution-cc`): likely needs `GetOpenProposals` (or a new query) to accept/use the caller's own MSP ID to report per-proposal vote status, and a new or extended query to return resolved proposals (currently only `GetProposal` by exact ID can see a closed proposal at all — there is no bulk "list resolved" equivalent). A chaincode change here means a version bump and redeploy, per this project's existing ccaas deployment pattern — same cost class the original voting-governance-ui change already flagged for `GetOpenProposals` itself.
- **Backend**: `MembershipProposalDto` (`backend/src/institutions/dto/membership-proposal.dto.ts`) currently mirrors the chaincode struct exactly (`votesFor`/`votesAgainst`/`status` only) — needs a new field for the calling institution's own vote status.
- **Frontend**: the governance page (`frontend/src/app/(dashboard)/governance/`) needs to render voted-state instead of always showing Yes/No controls, and needs *some* surface for resolved proposals — there is currently no `/governance/:id` route at all, even though the backend already exposes `GET /institutions/proposals/:proposalId`.
- Reproduced live on staging (`blc31-staging.westeurope.cloudapp.azure.com`, 2026-08-10) — full repro steps for all three scenarios are in issue #8.
