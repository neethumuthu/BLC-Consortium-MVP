# Institution Governance UI Specification

## Purpose

Lets an active member institution propose a new member institution and vote on open membership proposals through the product UI, using the existing on-chain governance rules rather than introducing new ones.

## Requirements

### Requirement: Propose a new member institution
An active institution SHALL be able to submit a proposal for a candidate institution to join, through the UI, which is submitted on-chain via the existing `ProposeNewMember` chaincode function.

#### Scenario: Successful proposal
- **WHEN** an active institution submits a proposal naming a candidate that is not already a member and has no existing open or approved proposal
- **THEN** the proposal is created on-chain with status Open and zero votes, and the UI shows it as pending

#### Scenario: Proposing an already-member institution is rejected
- **WHEN** the candidate institution is already an active member
- **THEN** the proposal is rejected and the UI surfaces the on-chain error rather than a generic failure

#### Scenario: Duplicate proposal for the same candidate is rejected
- **WHEN** an open or already-approved proposal already exists for the candidate
- **THEN** the new proposal attempt is rejected and the UI explains an existing proposal is already in progress

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
- **THEN** the second vote is rejected and the UI shows the institution's existing vote rather than allowing a change

#### Scenario: Voting on a closed proposal is rejected
- **WHEN** a vote is attempted on a proposal that is no longer Open (already Approved or Rejected)
- **THEN** the vote is rejected and the UI shows the proposal's final status instead of a voting control

### Requirement: View pending proposals needing a vote
An active institution SHALL be able to see which membership proposals are currently open, so it knows what needs its vote without already knowing a specific proposal ID.

#### Scenario: Pending proposals are listed
- **WHEN** an active institution views the governance section of the UI
- **THEN** every currently-Open proposal is listed with applicant name, current vote tally, and whether this institution has already voted

<!-- How this requirement is actually satisfied (a new chaincode query vs. an off-chain index) is a design decision, not a spec-level behavior -- see design.md and the gap noted in proposal.md's Impact section. -->
