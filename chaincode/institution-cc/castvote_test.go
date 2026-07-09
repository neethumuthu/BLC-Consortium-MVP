package main

import (
	"encoding/json"
	"testing"
	"time"
)

// injectActiveInstitution writes an active Institution asset directly to
// committed ledger state, bypassing RegisterInstitution/CastVote. Used to
// set up N-institution voting scenarios without needing a full founding+
// voting history for every voter — CastVote's own behavior is what's
// under test here, not how each voter became active.
func injectActiveInstitution(t *testing.T, ledger *fakeLedger, mspID string) {
	t.Helper()
	ctx, _ := newTx(ledger, "inject", "n/a", time.Now())
	key, err := institutionKey(ctx, mspID)
	if err != nil {
		t.Fatalf("failed to build institution key: %v", err)
	}
	institution := &Institution{
		InstitutionID: mspID,
		Name:          mspID,
		Status:        institutionStatusActive,
		Type:          institutionTypeApproved,
		DocType:       docTypeInstitution,
	}
	raw, err := json.Marshal(institution)
	if err != nil {
		t.Fatalf("failed to marshal institution: %v", err)
	}
	ledger.committed[key] = raw
}

// TestCastVote_N2_SingleNoVoteRejectsImmediately is the exact N=2 trace
// recorded in docs/BUILD_LOG.md's Phase 7 entry: BLCFounder and
// InstitutionA are the only active institutions, InstitutionB applies,
// BLCFounder votes "no", and the proposal must resolve to rejected
// immediately — without InstitutionA ever voting — because with only
// 2 total voters, one "no" already makes the majority-of-2 threshold
// mathematically unreachable.
func TestCastVote_N2_SingleNoVoteRejectsImmediately(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "InstitutionAMSP", time.Now())
	proposal, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)
	if proposal.TotalEligibleVoters != 2 {
		t.Fatalf("expected totalEligibleVoters 2, got %d", proposal.TotalEligibleVoters)
	}

	voteCtx, voteStub := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	resolved, err := contract.CastVote(voteCtx, proposal.ProposalID, voteDecisionNo)
	mustCommit(t, voteStub, err)

	if resolved.Status != proposalStatusRejected {
		t.Fatalf("expected proposal rejected after a single 'no' vote at N=2, got status %s (votesFor=%d votesAgainst=%d)",
			resolved.Status, resolved.VotesFor, resolved.VotesAgainst)
	}
	if resolved.VotesFor != 0 || resolved.VotesAgainst != 1 {
		t.Fatalf("expected votesFor=0 votesAgainst=1, got votesFor=%d votesAgainst=%d", resolved.VotesFor, resolved.VotesAgainst)
	}

	// InstitutionA, unaware the vote is already resolved, tries to vote.
	lateCtx, lateStub := newTx(ledger, "tx3", "InstitutionAMSP", time.Now())
	_, err = contract.CastVote(lateCtx, proposal.ProposalID, voteDecisionYes)
	mustFail(t, lateStub, err)

	// The applicant must NOT have been registered as an institution.
	if _, ok := ledger.committed[mustInstitutionKey(t, ledger, "InstitutionBMSP")]; ok {
		t.Fatal("expected InstitutionB to NOT be registered after rejection")
	}
}

func TestCastVote_N2_BothYesApproves(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "InstitutionAMSP", time.Now())
	proposal, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)

	ctx1, stub1 := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	resolved, err := contract.CastVote(ctx1, proposal.ProposalID, voteDecisionYes)
	mustCommit(t, stub1, err)
	if resolved.Status != proposalStatusOpen {
		t.Fatalf("expected proposal still open after 1 of 2 yes votes, got %s", resolved.Status)
	}

	ctx2, stub2 := newTx(ledger, "tx3", "InstitutionAMSP", time.Now())
	resolved, err = contract.CastVote(ctx2, proposal.ProposalID, voteDecisionYes)
	mustCommit(t, stub2, err)
	if resolved.Status != proposalStatusApproved {
		t.Fatalf("expected proposal approved after 2 of 2 yes votes, got %s", resolved.Status)
	}

	institution, err := getInstitution(ctx2, "InstitutionBMSP")
	if err != nil {
		t.Fatalf("failed to read InstitutionB: %v", err)
	}
	if institution == nil {
		t.Fatal("expected InstitutionB to be registered as an institution after approval")
	}
	if institution.Status != institutionStatusActive || institution.Type != institutionTypeApproved {
		t.Fatalf("unexpected InstitutionB fields: status=%s type=%s", institution.Status, institution.Type)
	}
	if len(institution.ApprovedBy) != 2 {
		t.Fatalf("expected approvedBy to list both voters, got %v", institution.ApprovedBy)
	}
}

// TestCastVote_N6_CloseRace_FinalYesApproves and
// TestCastVote_N6_CloseRace_FinalNoRejects together are the N=6 trace
// from docs/BUILD_LOG.md's Phase 7 entry: a maximally tense alternating
// vote (yes, no, yes, no, yes, then a deciding final vote) at
// requiredVotesToApprove(6)=4. Both must stay open through votes 1-5,
// including two votes (4 and 5) landing exactly on the threshold rather
// than above it, and only resolve on the final vote.
func TestCastVote_N6_CloseRace_FinalYesApproves(t *testing.T) {
	ledger := setupActiveFounders(t) // contributes BLCFounder/InstitutionA as 2 of the 6
	for _, org := range []string{"Org3MSP", "Org4MSP", "Org5MSP", "Org6MSP"} {
		injectActiveInstitution(t, ledger, org)
	}
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "propose", "BLCFounderMSP", time.Now())
	proposal, err := contract.ProposeNewMember(proposeCtx, "Org7MSP", "Org 7")
	mustCommit(t, proposeStub, err)
	if proposal.TotalEligibleVoters != 6 {
		t.Fatalf("expected totalEligibleVoters 6, got %d", proposal.TotalEligibleVoters)
	}

	votes := []struct {
		caller   string
		decision string
	}{
		{"BLCFounderMSP", voteDecisionYes},  // 1: for=1 against=0, max=6
		{"InstitutionAMSP", voteDecisionNo}, // 2: for=1 against=1, max=5
		{"Org3MSP", voteDecisionYes},        // 3: for=2 against=1, max=5
		{"Org4MSP", voteDecisionNo},         // 4: for=2 against=2, max=4 (exactly threshold)
		{"Org5MSP", voteDecisionYes},        // 5: for=3 against=2, max=4 (exactly threshold)
	}
	for i, v := range votes {
		ctx, stub := newTx(ledger, "vote", v.caller, time.Now())
		resolved, err := contract.CastVote(ctx, proposal.ProposalID, v.decision)
		mustCommit(t, stub, err)
		if resolved.Status != proposalStatusOpen {
			t.Fatalf("vote %d: expected proposal still open, got %s (votesFor=%d votesAgainst=%d)",
				i+1, resolved.Status, resolved.VotesFor, resolved.VotesAgainst)
		}
	}

	// Final, deciding vote: yes -> 4 for, 2 against -> approved.
	finalCtx, finalStub := newTx(ledger, "final-vote", "Org6MSP", time.Now())
	resolved, err := contract.CastVote(finalCtx, proposal.ProposalID, voteDecisionYes)
	mustCommit(t, finalStub, err)
	if resolved.Status != proposalStatusApproved {
		t.Fatalf("expected approved after final yes vote (4 for, 2 against), got %s", resolved.Status)
	}
	if resolved.VotesFor != 4 || resolved.VotesAgainst != 2 {
		t.Fatalf("expected votesFor=4 votesAgainst=2, got votesFor=%d votesAgainst=%d", resolved.VotesFor, resolved.VotesAgainst)
	}
}

func TestCastVote_N6_CloseRace_FinalNoRejects(t *testing.T) {
	ledger := setupActiveFounders(t)
	for _, org := range []string{"Org3MSP", "Org4MSP", "Org5MSP", "Org6MSP"} {
		injectActiveInstitution(t, ledger, org)
	}
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "propose", "BLCFounderMSP", time.Now())
	proposal, err := contract.ProposeNewMember(proposeCtx, "Org7MSP", "Org 7")
	mustCommit(t, proposeStub, err)

	votes := []struct {
		caller   string
		decision string
	}{
		{"BLCFounderMSP", voteDecisionYes},
		{"InstitutionAMSP", voteDecisionNo},
		{"Org3MSP", voteDecisionYes},
		{"Org4MSP", voteDecisionNo},
		{"Org5MSP", voteDecisionYes},
	}
	for i, v := range votes {
		ctx, stub := newTx(ledger, "vote", v.caller, time.Now())
		resolved, err := contract.CastVote(ctx, proposal.ProposalID, v.decision)
		mustCommit(t, stub, err)
		if resolved.Status != proposalStatusOpen {
			t.Fatalf("vote %d: expected proposal still open, got %s", i+1, resolved.Status)
		}
	}

	// Final, deciding vote: no -> 3 for, 3 against -> mathematically
	// unreachable (remaining=0, maxPossibleYes=3 < 4) -> rejected.
	finalCtx, finalStub := newTx(ledger, "final-vote", "Org6MSP", time.Now())
	resolved, err := contract.CastVote(finalCtx, proposal.ProposalID, voteDecisionNo)
	mustCommit(t, finalStub, err)
	if resolved.Status != proposalStatusRejected {
		t.Fatalf("expected rejected after final no vote (3 for, 3 against), got %s", resolved.Status)
	}
}

// TestCastVote_ApplicantCannotVoteOnOwnProposal isolates CastVote's
// applicant-cannot-vote-on-itself guard directly via ledger injection,
// rather than the normal ProposeNewMember/CastVote flow. This exact
// scenario — an applicant simultaneously active AND the subject of a
// still-open proposal — is actually unreachable through the real flow:
// ProposeNewMember itself refuses to propose an applicant that's already
// an active institution, and the only way a non-founding org becomes
// active is a proposal approving itself, which closes that same
// proposal in the same transaction. This test still isolates the guard
// as defense-in-depth, independent of whether the surrounding
// invariants that currently make it unreachable ever change.
func TestCastVote_ApplicantCannotVoteOnOwnProposal(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	injectActiveInstitution(t, ledger, "InstitutionBMSP")
	injectProposal(t, ledger, &MembershipProposal{
		ProposalID:          "self-vote-attempt",
		ApplicantID:         "InstitutionBMSP",
		ApplicantName:       "Institution B",
		Status:              proposalStatusOpen,
		TotalEligibleVoters: 3,
		DocType:             docTypeProposal,
	})

	ctx, stub := newTx(ledger, "tx1", "InstitutionBMSP", time.Now())
	_, err := contract.CastVote(ctx, "self-vote-attempt", voteDecisionYes)
	mustFail(t, stub, err)
}

func TestCastVote_DoubleVoteBySameInstitutionRejected(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "InstitutionAMSP", time.Now())
	proposal, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)

	ctx1, stub1 := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	_, err = contract.CastVote(ctx1, proposal.ProposalID, voteDecisionNo)
	mustCommit(t, stub1, err) // this already rejects the proposal at N=2

	// Even ignoring resolution, the SAME institution voting twice must be
	// rejected — test this independently at larger N so resolution
	// doesn't mask it: use the N=6 setup and only cast one round.
	ledger6 := setupActiveFounders(t)
	for _, org := range []string{"Org3MSP", "Org4MSP", "Org5MSP", "Org6MSP"} {
		injectActiveInstitution(t, ledger6, org)
	}
	proposeCtx6, proposeStub6 := newTx(ledger6, "tx1", "BLCFounderMSP", time.Now())
	proposal6, err := contract.ProposeNewMember(proposeCtx6, "Org7MSP", "Org 7")
	mustCommit(t, proposeStub6, err)

	firstVoteCtx, firstVoteStub := newTx(ledger6, "tx2", "Org3MSP", time.Now())
	_, err = contract.CastVote(firstVoteCtx, proposal6.ProposalID, voteDecisionYes)
	mustCommit(t, firstVoteStub, err)

	secondVoteCtx, secondVoteStub := newTx(ledger6, "tx3", "Org3MSP", time.Now())
	_, err = contract.CastVote(secondVoteCtx, proposal6.ProposalID, voteDecisionNo)
	mustFail(t, secondVoteStub, err)
}
