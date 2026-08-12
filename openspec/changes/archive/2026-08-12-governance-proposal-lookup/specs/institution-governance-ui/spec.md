## ADDED Requirements

### Requirement: Look up a single proposal by ID
Any authenticated caller SHALL be able to fetch a single membership proposal directly by its ID, via `GET /institutions/proposals/:proposalId`, without needing to already know it from the pending or resolved lists.

#### Scenario: Proposal exists
- **WHEN** a caller requests an existing proposal's ID
- **THEN** the full proposal record is returned, including the caller's own recorded vote decision on it ("voted yes" / "voted no") if the caller has already voted, matching the same `callerVoteDecision` behavior already present when listing pending or resolved proposals

#### Scenario: Proposal does not exist
- **WHEN** a caller requests a proposal ID with no matching record
- **THEN** the request is rejected rather than returning an empty or null result
