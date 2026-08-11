## MODIFIED Requirements

### Requirement: View pending proposals needing a vote
An active institution SHALL be able to see which membership proposals are currently open, so it knows what needs its vote without already knowing a specific proposal ID.

#### Scenario: Pending proposals are listed
- **WHEN** an active institution views the governance section of the UI
- **THEN** every currently-Open proposal is listed with applicant name, current vote tally, and, for each proposal, one of: "not yet voted", or the institution's own recorded decision ("voted yes" / "voted no") if it has already voted on that proposal

### Requirement: Cast a vote on an open proposal
An active institution SHALL be able to cast a yes/no vote on an open membership proposal it did not itself submit as applicant, via the existing `CastVote` chaincode function.

#### Scenario: Vote is accepted and counted
- **WHEN** an active institution that has not yet voted on an open proposal, and is not the proposal's applicant, casts a yes or no vote
- **THEN** the vote is recorded on-chain and the UI reflects the updated vote count

#### Scenario: Applicant cannot vote on its own proposal
- **WHEN** the institution attempting to vote is the proposal's applicant
- **THEN** the vote is rejected and the UI explains an institution cannot vote on its own membership proposal

#### Scenario: Double-voting is rejected
- **WHEN** an institution that has already voted on a proposal attempts to vote on it again
- **THEN** the second vote is rejected, the UI shows the institution's existing recorded decision ("voted yes" / "voted no") rather than a generic error, and the voting control is replaced by that decision rather than remaining enabled

#### Scenario: Voting on a closed proposal is rejected
- **WHEN** a vote is attempted on a proposal that is no longer Open (already Approved or Rejected)
- **THEN** the vote is rejected and the UI shows the proposal's final status instead of a voting control

## ADDED Requirements

### Requirement: View resolved proposals
An institution SHALL be able to discover a membership proposal's existence and final outcome after it resolves (Approved or Rejected), even if that institution never voted on it before it closed — not only institutions that already know its proposal ID.

#### Scenario: A resolved proposal remains discoverable
- **WHEN** a membership proposal resolves (reaches Approved or Rejected status) before an active institution has voted on it
- **THEN** that institution can still find the proposal from the same place it would look for governance activity, and see its applicant name, final status, and final vote tally

#### Scenario: A resolved proposal shows its outcome, not a voting control
- **WHEN** an active institution views a resolved proposal it did not get to vote on
- **THEN** the UI shows the proposal's final status and tally, and does not offer a voting control for it
