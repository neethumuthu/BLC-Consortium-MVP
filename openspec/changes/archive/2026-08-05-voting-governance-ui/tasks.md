## 1. Chaincode

- [x] 1.1 Add `GetOpenProposals` query function to `institution-cc` using a CouchDB rich-query selector (`docType: "proposal", status: "Open"`), per design.md's Decisions
- [x] 1.2 Add a chaincode test for `GetOpenProposals` (empty result, single open proposal, mix of open/approved/rejected proposals)
- [x] 1.3 Bump chaincode version and redeploy across all institution peers before any backend/frontend work depends on it — do this first and verify independently, per design.md's Risks

## 2. Backend

- [x] 2.1 Add `POST /institutions/proposals` endpoint wrapping `ProposeNewMember`
- [x] 2.2 Add `POST /institutions/proposals/:proposalId/vote` endpoint wrapping `CastVote`
- [x] 2.3 Add `GET /institutions/proposals` endpoint wrapping the new `GetOpenProposals` chaincode query
- [x] 2.4 Add `GET /institutions/proposals/:proposalId` endpoint wrapping the existing `GetProposal` chaincode query
- [x] 2.5 Map chaincode error strings from all four endpoints through the existing Fabric-error-to-HTTP-status filter (`fabric-exception.filter.ts`), consistent with how `certificates.controller.ts` already does this — do not invent a separate error-handling path

## 3. Frontend

- [x] 3.1 Add a "Propose new member" form (institution ID + name), calling 2.1
- [x] 3.2 Add a pending-proposals view listing every open proposal (applicant name, current vote tally, whether this institution already voted), calling 2.3
- [x] 3.3 Add a vote action (yes/no) on each pending proposal row, calling 2.2
- [x] 3.4 Surface backend error responses in the UI per spec's scenarios (already-member, duplicate proposal, applicant-can't-vote, already-voted, proposal-not-open) rather than a generic failure message

## 4. Verification

- [x] 4.1 Verify each spec scenario end-to-end against the real network (not just unit tests) — same standard as the certificate-cc governance work already proven live
  - Verified live: successful proposal creation (via UI and API), listing open proposals, get-by-ID, successful vote (count increments, stays open), double-vote rejection (409), duplicate-open-proposal rejection (409, `"an open or already-approved membership proposal exists for..."`), already-a-member rejection (409, `"...is already a member institution"`), voting-on-a-closed-proposal rejection (409, `"...is not open (status: approved)"`, exercised against Institution D's already-resolved proposal).
  - Still not verified live: applicant-voting-on-own-proposal rejection. Not a gap in effort — it's structurally untestable through the real network right now, because the only identities that can submit any transaction are the three institutions that already have real MSPs/backends (BLCFounder, InstitutionA, InstitutionB), and all three are already active members, so proposing any of them as an applicant hits the already-a-member check first, before the proposal (and thus the self-vote path) is ever created. Exercising this specific path live would need a fourth real network identity that isn't a member yet. Remains chaincode-unit-tested only (`castvote_test.go`).
- [x] 4.2 Confirm an institution's own backend instance cannot vote on behalf of another institution — verified by running all three backend instances simultaneously (BLCFounder :3001, InstitutionA :3002, InstitutionB :3003) and casting one vote from each. Confirmed directly against CouchDB world state, not just the HTTP response: the two vote documents are correctly keyed and attributed (`votedBy: "InstitutionAMSP", decision: "yes"` and `votedBy: "InstitutionBMSP", decision: "no"`) — each backend can only ever sign as its own MSP identity (`CastVote` takes no institution-ID parameter from the caller), so cross-institution voting isn't just unobserved, it's structurally impossible via this API.
