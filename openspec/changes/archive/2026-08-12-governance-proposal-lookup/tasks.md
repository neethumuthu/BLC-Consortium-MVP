## 1. Verify existing behavior matches the new requirement

- [x] 1.1 Confirm `GET /institutions/proposals/:proposalId` has no caller restriction beyond the global `ApiKeyGuard` (checked directly in `institutions.controller.ts` during proposal drafting — re-confirm here)
- [x] 1.2 Confirm `GetProposal` (`chaincode/institution-cc/queries.go`) wraps its result via `withCallerVoteStatus`, matching `GetOpenProposals`/`GetResolvedProposals`'s existing `callerVoteDecision` behavior
- [x] 1.3 Confirm the not-found case returns a rejection (`"proposal %s does not exist"`), not an empty/null result
- [x] 1.4 Live-verify both scenarios against a real running network: fetch an existing proposal by ID (as a caller who has and hasn't voted on it) and fetch a nonexistent proposal ID — done against staging (SSH, direct backend curl): existing proposal `41a48f9b...` returned full record with `callerVoteDecision: "yes"`; `does-not-exist-xyz` rejected with 404 (`"proposal does-not-exist-xyz does not exist"`), not an empty/null result

## 2. Archive

- [ ] 2.1 Sync the delta spec into `openspec/specs/institution-governance-ui/spec.md`
- [ ] 2.2 Archive this change
