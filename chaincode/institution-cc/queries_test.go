package main

import (
	"encoding/json"
	"testing"
	"time"
)

// injectVote writes a Vote directly to committed ledger state, bypassing
// CastVote — used to set up a caller-vote-status precondition on a
// proposal that was itself injected (rather than created through
// ProposeNewMember/CastVote), same rationale as injectProposal/
// injectActiveInstitution.
func injectVote(t *testing.T, ledger *fakeLedger, proposalID string, votedBy string, decision string) {
	t.Helper()
	ctx, _ := newTx(ledger, "inject", "n/a", time.Now())
	key, err := voteKey(ctx, proposalID, votedBy)
	if err != nil {
		t.Fatalf("failed to build vote key: %v", err)
	}
	vote := &Vote{
		VoteID:     proposalID + "~" + votedBy,
		ProposalID: proposalID,
		VotedBy:    votedBy,
		Decision:   decision,
		DocType:    docTypeVote,
	}
	raw, err := json.Marshal(vote)
	if err != nil {
		t.Fatalf("failed to marshal vote: %v", err)
	}
	ledger.committed[key] = raw
}

func TestGetInstitution_ReturnsExisting(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	institution, err := contract.GetInstitution(ctx, "BLCFounderMSP")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if institution.InstitutionID != "BLCFounderMSP" {
		t.Fatalf("expected BLCFounderMSP, got %s", institution.InstitutionID)
	}
}

func TestGetInstitution_ErrorsOnMissing(t *testing.T) {
	ledger := newFakeLedger()
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	_, err := contract.GetInstitution(ctx, "NoSuchMSP")
	if err == nil {
		t.Fatal("expected an error for a nonexistent institution, got nil")
	}
}

func TestGetInstitution_CallableByAnyIdentity(t *testing.T) {
	// Per the design doc, query functions have no caller restriction at
	// the chaincode level (the real gate is Fabric channel membership
	// itself, enforced before the proposal ever reaches this code — see
	// the access-control discussion this test intentionally does NOT
	// re-implement). Confirms the chaincode adds no additional check by
	// calling as a caller identity that is not itself an institution.
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "SomeRandomBackendServiceMSP", time.Now())
	institution, err := contract.GetInstitution(ctx, "BLCFounderMSP")
	if err != nil {
		t.Fatalf("expected query to succeed regardless of caller identity, got error: %v", err)
	}
	if institution.InstitutionID != "BLCFounderMSP" {
		t.Fatalf("expected BLCFounderMSP, got %s", institution.InstitutionID)
	}
}

func TestGetAllInstitutions_ReturnsAllRegardlessOfStatus(t *testing.T) {
	ledger := setupActiveFounders(t)
	injectActiveInstitution(t, ledger, "Org3MSP")

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}
	institutions, err := contract.GetAllInstitutions(ctx)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(institutions) != 3 {
		t.Fatalf("expected 3 institutions (BLCFounder, InstitutionA, Org3), got %d", len(institutions))
	}
}

func TestGetAllInstitutions_EmptyLedgerReturnsEmptyNotError(t *testing.T) {
	ledger := newFakeLedger()
	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}

	institutions, err := contract.GetAllInstitutions(ctx)
	if err != nil {
		t.Fatalf("expected success on an empty ledger, got error: %v", err)
	}
	if len(institutions) != 0 {
		t.Fatalf("expected 0 institutions, got %d", len(institutions))
	}
}

func TestGetProposal_ReturnsExisting(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	created, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)

	getCtx, _ := newTx(ledger, "tx2", "n/a", time.Now())
	fetched, err := contract.GetProposal(getCtx, created.ProposalID)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if fetched.ApplicantID != "InstitutionBMSP" {
		t.Fatalf("expected applicantId InstitutionBMSP, got %s", fetched.ApplicantID)
	}
}

func TestGetOpenProposals_ReturnsOnlyOpenOnes(t *testing.T) {
	ledger := setupActiveFounders(t)

	injectProposal(t, ledger, &MembershipProposal{
		ProposalID: "p-open", ApplicantID: "InstitutionBMSP", ApplicantName: "Institution B",
		ProposedBy: "BLCFounderMSP", Status: proposalStatusOpen, DocType: docTypeProposal,
	})
	injectProposal(t, ledger, &MembershipProposal{
		ProposalID: "p-approved", ApplicantID: "InstitutionCMSP", ApplicantName: "Institution C",
		ProposedBy: "BLCFounderMSP", Status: proposalStatusApproved, DocType: docTypeProposal,
	})
	injectProposal(t, ledger, &MembershipProposal{
		ProposalID: "p-rejected", ApplicantID: "InstitutionDMSP", ApplicantName: "Institution D",
		ProposedBy: "BLCFounderMSP", Status: proposalStatusRejected, DocType: docTypeProposal,
	})

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}
	proposals, err := contract.GetOpenProposals(ctx)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(proposals) != 1 {
		t.Fatalf("expected 1 open proposal (approved/rejected excluded), got %d", len(proposals))
	}
	if proposals[0].ProposalID != "p-open" {
		t.Fatalf("expected p-open, got %s", proposals[0].ProposalID)
	}
}

func TestGetOpenProposals_EmptyLedgerReturnsEmptyNotError(t *testing.T) {
	ledger := newFakeLedger()
	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}

	proposals, err := contract.GetOpenProposals(ctx)
	if err != nil {
		t.Fatalf("expected success on an empty ledger, got error: %v", err)
	}
	if len(proposals) != 0 {
		t.Fatalf("expected 0 proposals, got %d", len(proposals))
	}
}

func TestGetProposal_ErrorsOnMissing(t *testing.T) {
	ledger := newFakeLedger()
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	_, err := contract.GetProposal(ctx, "no-such-proposal")
	if err == nil {
		t.Fatal("expected an error for a nonexistent proposal, got nil")
	}
}

func TestGetOpenProposals_CallerVoteDecisionReflectsOnlyCallersOwnVote(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	created, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)

	// N=2 (BLCFounder, InstitutionA): a single "yes" is not enough to
	// approve (needs 2) and not enough to make rejection mathematically
	// certain either, so this stays open - exactly the state under test.
	voteCtx, voteStub := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	_, err = contract.CastVote(voteCtx, created.ProposalID, voteDecisionYes)
	mustCommit(t, voteStub, err)

	asVoter, _ := newTx(ledger, "tx3", "BLCFounderMSP", time.Now())
	votersView, err := contract.GetOpenProposals(asVoter)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(votersView) != 1 || votersView[0].CallerVoteDecision != voteDecisionYes {
		t.Fatalf("expected BLCFounder's own view to show callerVoteDecision=%q, got %+v", voteDecisionYes, votersView)
	}

	asNonVoter, _ := newTx(ledger, "tx4", "InstitutionAMSP", time.Now())
	nonVoterView, err := contract.GetOpenProposals(asNonVoter)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(nonVoterView) != 1 || nonVoterView[0].CallerVoteDecision != "" {
		t.Fatalf("expected InstitutionA's own view to show no callerVoteDecision (hasn't voted), got %+v", nonVoterView)
	}
}

func TestGetProposal_CallerVoteDecisionAbsentWhenCallerHasNotVoted(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	created, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)

	getCtx, _ := newTx(ledger, "tx2", "InstitutionAMSP", time.Now())
	fetched, err := contract.GetProposal(getCtx, created.ProposalID)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if fetched.CallerVoteDecision != "" {
		t.Fatalf("expected no callerVoteDecision for a caller that hasn't voted, got %q", fetched.CallerVoteDecision)
	}
}

func TestGetProposal_CallerVoteDecisionPresentWhenCallerHasVoted(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	created, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)

	voteCtx, voteStub := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	_, err = contract.CastVote(voteCtx, created.ProposalID, voteDecisionYes)
	mustCommit(t, voteStub, err)

	getCtx, _ := newTx(ledger, "tx3", "BLCFounderMSP", time.Now())
	fetched, err := contract.GetProposal(getCtx, created.ProposalID)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if fetched.CallerVoteDecision != voteDecisionYes {
		t.Fatalf("expected callerVoteDecision=%q for the voting caller, got %q", voteDecisionYes, fetched.CallerVoteDecision)
	}
}

func TestGetResolvedProposals_ReturnsApprovedAndRejectedNotOpen(t *testing.T) {
	ledger := setupActiveFounders(t)

	injectProposal(t, ledger, &MembershipProposal{
		ProposalID: "p-open", ApplicantID: "InstitutionBMSP", ApplicantName: "Institution B",
		ProposedBy: "BLCFounderMSP", Status: proposalStatusOpen, DocType: docTypeProposal,
	})
	injectProposal(t, ledger, &MembershipProposal{
		ProposalID: "p-approved", ApplicantID: "InstitutionCMSP", ApplicantName: "Institution C",
		ProposedBy: "BLCFounderMSP", Status: proposalStatusApproved, DocType: docTypeProposal,
	})
	injectProposal(t, ledger, &MembershipProposal{
		ProposalID: "p-rejected", ApplicantID: "InstitutionDMSP", ApplicantName: "Institution D",
		ProposedBy: "BLCFounderMSP", Status: proposalStatusRejected, DocType: docTypeProposal,
	})

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}
	proposals, err := contract.GetResolvedProposals(ctx)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(proposals) != 2 {
		t.Fatalf("expected 2 resolved proposals (open excluded), got %d", len(proposals))
	}
	seen := map[string]bool{}
	for _, p := range proposals {
		seen[p.ProposalID] = true
	}
	if !seen["p-approved"] || !seen["p-rejected"] {
		t.Fatalf("expected p-approved and p-rejected, got %+v", proposals)
	}
}

func TestGetResolvedProposals_EmptyLedgerReturnsEmptyNotError(t *testing.T) {
	ledger := newFakeLedger()
	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}

	proposals, err := contract.GetResolvedProposals(ctx)
	if err != nil {
		t.Fatalf("expected success on an empty ledger, got error: %v", err)
	}
	if len(proposals) != 0 {
		t.Fatalf("expected 0 proposals, got %d", len(proposals))
	}
}

func TestGetResolvedProposals_CallerVoteDecisionReflectsOwnVote(t *testing.T) {
	ledger := setupActiveFounders(t)

	injectProposal(t, ledger, &MembershipProposal{
		ProposalID: "p-approved", ApplicantID: "InstitutionCMSP", ApplicantName: "Institution C",
		ProposedBy: "BLCFounderMSP", Status: proposalStatusApproved, VotesFor: 2, TotalEligibleVoters: 2, DocType: docTypeProposal,
	})
	injectVote(t, ledger, "p-approved", "BLCFounderMSP", voteDecisionYes)

	asVoter, _ := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	contract := &SmartContract{}
	votersView, err := contract.GetResolvedProposals(asVoter)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(votersView) != 1 || votersView[0].CallerVoteDecision != voteDecisionYes {
		t.Fatalf("expected callerVoteDecision=%q, got %+v", voteDecisionYes, votersView)
	}

	asNonVoter, _ := newTx(ledger, "tx2", "InstitutionAMSP", time.Now())
	nonVoterView, err := contract.GetResolvedProposals(asNonVoter)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(nonVoterView) != 1 || nonVoterView[0].CallerVoteDecision != "" {
		t.Fatalf("expected no callerVoteDecision for InstitutionA (never voted), got %+v", nonVoterView)
	}
}
