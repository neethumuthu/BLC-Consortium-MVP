## Why

Institutions can already be proposed and voted on at the chaincode level (`ProposeNewMember`, `CastVote` in `institution-cc/governance.go`, both tested), but there is no way to do either through the product today — no backend endpoint, no frontend UI. This closes that gap using existing, proven chaincode logic rather than introducing new governance rules.

## What Changes

- New backend endpoints wrapping `ProposeNewMember`, `CastVote`, and proposal lookup (`GetProposal`).
- New frontend UI: a form to propose a new member institution, and a view to see and vote on pending proposals.
- Purely additive — no existing endpoint or UI behavior changes.

## Capabilities

### New Capabilities
- `institution-governance-ui`: propose new member institutions and cast votes on pending proposals, backed entirely by existing, tested chaincode functions.

### Modified Capabilities
(none — `institutions.controller.ts` gains new endpoints; existing institution/certificate query behavior is unchanged)

## Impact

- **Backend**: `institutions.controller.ts`/`institutions.service.ts` need new endpoints for propose, vote, and proposal lookup. The chaincode side is already done and tested — this is new wiring, not new business logic.
- **Real gap found while researching this proposal** (not a product ambiguity — an implementation-design matter for `design.md`, not an Open Question): the chaincode has `GetProposal(proposalID)` — a single lookup by ID — but no bulk "list all/pending proposals" query. A voting UI showing "here's what needs your vote" needs some way to discover which proposal IDs exist. Two paths: add a new chaincode query function (e.g. `GetAllProposals`/`GetPendingProposals`), or maintain an off-chain index in the backend. `design.md` needs to pick one before `tasks.md` can be written meaningfully.
- **Frontend**: confirmed no existing voting/governance route at all — this is genuinely new UI, not an extension of an existing page.
