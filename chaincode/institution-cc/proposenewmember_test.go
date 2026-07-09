package main

import (
	"encoding/json"
	"testing"
	"time"
)

// setupActiveFounders returns a ledger with both BLCFounderMSP and
// InstitutionAMSP already registered as active institutions — the
// precondition every ProposeNewMember/CastVote test starts from.
func setupActiveFounders(t *testing.T) *fakeLedger {
	t.Helper()
	ledger := setupFoundingLedger(t)
	contract := &SmartContract{}

	ctx1, stub1 := newTx(ledger, "reg-blcfounder", "BLCFounderMSP", time.Now())
	mustCommit(t, stub1, func() error {
		_, err := contract.RegisterInstitution(ctx1, "BLC Founder")
		return err
	}())

	ctx2, stub2 := newTx(ledger, "reg-institutiona", "InstitutionAMSP", time.Now())
	mustCommit(t, stub2, func() error {
		_, err := contract.RegisterInstitution(ctx2, "Institution A")
		return err
	}())

	return ledger
}

// injectProposal writes a MembershipProposal directly to committed
// ledger state, bypassing CastVote entirely. Used only to set up
// preconditions (an existing approved/rejected proposal) for
// ProposeNewMember tests, since CastVote's own correctness is tested
// separately and shouldn't be a dependency for these.
func injectProposal(t *testing.T, ledger *fakeLedger, p *MembershipProposal) {
	t.Helper()
	ctx, _ := newTx(ledger, "inject", "n/a", time.Now())
	key, err := proposalKey(ctx, p.ProposalID)
	if err != nil {
		t.Fatalf("failed to build proposal key: %v", err)
	}
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("failed to marshal proposal: %v", err)
	}
	ledger.committed[key] = raw
}

func TestProposeNewMember_Success(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	ctx, stub := newTx(ledger, "tx1", "InstitutionAMSP", time.Now())
	proposal, err := contract.ProposeNewMember(ctx, "InstitutionBMSP", "Institution B")
	mustCommit(t, stub, err)

	if proposal.ProposalID != "tx1" {
		t.Fatalf("expected proposalId to be the TxID (tx1), got %s", proposal.ProposalID)
	}
	if proposal.ApplicantID != "InstitutionBMSP" {
		t.Fatalf("expected applicantId InstitutionBMSP, got %s", proposal.ApplicantID)
	}
	if proposal.Status != proposalStatusOpen {
		t.Fatalf("expected status open, got %s", proposal.Status)
	}
	if proposal.TotalEligibleVoters != 2 {
		t.Fatalf("expected totalEligibleVoters 2 (BLCFounder + InstitutionA), got %d", proposal.TotalEligibleVoters)
	}
	if proposal.VotesFor != 0 || proposal.VotesAgainst != 0 {
		t.Fatalf("expected zero votes on a freshly created proposal, got for=%d against=%d", proposal.VotesFor, proposal.VotesAgainst)
	}
}

func TestProposeNewMember_InactiveCallerRejected(t *testing.T) {
	ledger := setupFoundingLedger(t) // founders registered as founding list, but NOT yet active institutions
	contract := &SmartContract{}

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	_, err := contract.ProposeNewMember(ctx, "InstitutionBMSP", "Institution B")
	mustFail(t, stub, err)
}

func TestProposeNewMember_ApplicantAlreadyMemberRejected(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	// InstitutionA is already an active institution — proposing it again
	// as if it were a new applicant must fail.
	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	_, err := contract.ProposeNewMember(ctx, "InstitutionAMSP", "Institution A")
	mustFail(t, stub, err)
}

func TestProposeNewMember_OpenProposalForApplicantBlocksNewOne(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	injectProposal(t, ledger, &MembershipProposal{
		ProposalID:          "existing-open",
		ApplicantID:         "InstitutionBMSP",
		ApplicantName:       "Institution B",
		Status:              proposalStatusOpen,
		TotalEligibleVoters: 2,
		DocType:             docTypeProposal,
	})

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	_, err := contract.ProposeNewMember(ctx, "InstitutionBMSP", "Institution B")
	mustFail(t, stub, err)
}

func TestProposeNewMember_ApprovedProposalForApplicantBlocksNewOne(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	// Approved-but-somehow-not-yet-a-member is not reachable in the real
	// system (CastVote creates the Institution atomically with approval —
	// see docs/BUILD_LOG.md), but this test checks ProposeNewMember's own
	// guard directly and independently of that invariant, per the
	// self-contained design rationale in hasLiveProposalForApplicant's
	// doc comment.
	injectProposal(t, ledger, &MembershipProposal{
		ProposalID:          "existing-approved",
		ApplicantID:         "InstitutionBMSP",
		ApplicantName:       "Institution B",
		Status:              proposalStatusApproved,
		TotalEligibleVoters: 2,
		DocType:             docTypeProposal,
	})

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	_, err := contract.ProposeNewMember(ctx, "InstitutionBMSP", "Institution B")
	mustFail(t, stub, err)
}

// TestProposeNewMember_RejectedProposalForApplicantAllowsReapplication is
// the direct test of the design decision that rejection must not be
// treated the same as approval: a rejected applicant can be re-proposed.
func TestProposeNewMember_RejectedProposalForApplicantAllowsReapplication(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	injectProposal(t, ledger, &MembershipProposal{
		ProposalID:          "existing-rejected",
		ApplicantID:         "InstitutionBMSP",
		ApplicantName:       "Institution B",
		Status:              proposalStatusRejected,
		TotalEligibleVoters: 2,
		DocType:             docTypeProposal,
	})

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	proposal, err := contract.ProposeNewMember(ctx, "InstitutionBMSP", "Institution B")
	mustCommit(t, stub, err)

	if proposal.Status != proposalStatusOpen {
		t.Fatalf("expected new proposal to be open, got %s", proposal.Status)
	}
}
