## Why

`GET /institutions/proposals/:proposalId` is real, shipped, and API-reachable (`backend/src/institutions/institutions.controller.ts`, calling `GetProposal` in `chaincode/institution-cc/queries.go`) — but `institution-governance-ui`'s spec has never covered it. That spec's requirements only describe proposing, voting, listing open proposals, and listing resolved proposals; fetching one specific proposal directly by ID has no requirement of its own. Found this gap while systematically scanning every HTTP-reachable backend route against `openspec/specs/` for coverage (part of building a substitute for OpenSpec's missing `/opsx:onboard`, which would normally have caught this automatically).

## What Changes

- Add a requirement to `institution-governance-ui` covering direct single-proposal lookup by ID: any authenticated caller can fetch a proposal by its ID and see its own recorded vote decision on it (if any), matching `GetOpenProposals`/`GetResolvedProposals`'s existing `callerVoteDecision` behavior; a request for a nonexistent proposal ID is rejected rather than returning an empty/null result.
- No code changes — the route, service method, and chaincode function all already exist and already behave this way. This is a documentation-only change closing a real spec-coverage gap on already-shipped behavior.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `institution-governance-ui`: adds a "Look up a single proposal by ID" requirement, covering `GET /institutions/proposals/:proposalId`.

## Impact

- `openspec/specs/institution-governance-ui/spec.md` — one new requirement added.
- No code, API, or dependency changes. `backend/src/institutions/institutions.controller.ts`'s `getProposal` route, `institutions.service.ts`'s `getProposal`, and `chaincode/institution-cc/queries.go`'s `GetProposal` are unchanged — this proposal documents existing, already-verified behavior (confirmed directly against the current source before writing this).
