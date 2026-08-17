## MODIFIED Requirements

### Requirement: Look up a single proposal by ID
Any authenticated caller SHALL be able to fetch a single membership proposal directly by its ID, via `GET /institutions/proposals/:proposalId` or the corresponding `/governance/:id` UI page, without needing to already know it from the pending or resolved lists.

#### Scenario: Proposal exists
- **WHEN** a caller requests an existing proposal's ID, via the API or by visiting its `/governance/:id` page
- **THEN** the full proposal record is returned/shown, including the caller's own recorded vote decision on it ("voted yes" / "voted no") if the caller has already voted, matching the same `callerVoteDecision` behavior already present when listing pending or resolved proposals

#### Scenario: Proposal does not exist
- **WHEN** a caller requests a proposal ID with no matching record
- **THEN** the API request is rejected rather than returning an empty or null result, and the UI page shows a clear, readable message rather than a raw backend error

#### Scenario: The detail page is read-only
- **WHEN** an active institution views an open proposal it hasn't voted on yet, from that proposal's own `/governance/:id` URL
- **THEN** the page shows the proposal's current state and vote tally but does not offer a voting control there — voting remains available only from the `/governance` list, so there is exactly one place a vote can be cast
