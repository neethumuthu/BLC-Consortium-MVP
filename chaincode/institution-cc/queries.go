package main

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// GetInstitution returns the institution registered under institutionID.
// Read-only, no caller restriction — per the design doc, anyone can call
// the query functions.
func (s *SmartContract) GetInstitution(ctx contractapi.TransactionContextInterface, institutionID string) (*Institution, error) {
	institution, err := getInstitution(ctx, institutionID)
	if err != nil {
		return nil, err
	}
	if institution == nil {
		return nil, fmt.Errorf("institution %s does not exist", institutionID)
	}
	return institution, nil
}

// GetAllInstitutions returns every Institution asset on the ledger,
// regardless of status, via a CouchDB rich query on docType.
func (s *SmartContract) GetAllInstitutions(ctx contractapi.TransactionContextInterface) ([]*Institution, error) {
	selector := fmt.Sprintf(`{"selector":{"docType":"%s"}}`, docTypeInstitution)
	iterator, err := ctx.GetStub().GetQueryResult(selector)
	if err != nil {
		return nil, fmt.Errorf("failed to query institutions: %v", err)
	}
	defer iterator.Close()

	institutions := []*Institution{}
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate institutions: %v", err)
		}
		var institution Institution
		if err := json.Unmarshal(result.Value, &institution); err != nil {
			return nil, fmt.Errorf("failed to unmarshal institution: %v", err)
		}
		institutions = append(institutions, &institution)
	}
	return institutions, nil
}

// GetOpenProposals returns every membership proposal currently Open, via
// a CouchDB rich query on docType and status — same pattern as
// GetAllInstitutions. Lets a caller discover which proposals need a vote
// without already knowing a proposal ID.
func (s *SmartContract) GetOpenProposals(ctx contractapi.TransactionContextInterface) ([]*ProposalWithVoteStatus, error) {
	return queryProposalsWithVoteStatus(ctx, fmt.Sprintf(`{"selector":{"docType":"%s","status":"%s"}}`, docTypeProposal, proposalStatusOpen))
}

// GetResolvedProposals returns every membership proposal that has
// reached a final status (Approved or Rejected) — the counterpart to
// GetOpenProposals for proposals that already closed. Lets an
// institution discover a proposal's existence and outcome even if it
// never voted on it before it resolved, per
// institution-governance-ui's "View resolved proposals" requirement.
func (s *SmartContract) GetResolvedProposals(ctx contractapi.TransactionContextInterface) ([]*ProposalWithVoteStatus, error) {
	selector := fmt.Sprintf(`{"selector":{"docType":"%s","status":{"$in":["%s","%s"]}}}`,
		docTypeProposal, proposalStatusApproved, proposalStatusRejected)
	return queryProposalsWithVoteStatus(ctx, selector)
}

// queryProposalsWithVoteStatus runs a CouchDB rich query for proposals
// and wraps each result with the calling institution's own vote status
// — shared by GetOpenProposals and GetResolvedProposals so the two
// differ only in their selector.
func queryProposalsWithVoteStatus(ctx contractapi.TransactionContextInterface, selector string) ([]*ProposalWithVoteStatus, error) {
	iterator, err := ctx.GetStub().GetQueryResult(selector)
	if err != nil {
		return nil, fmt.Errorf("failed to query proposals: %v", err)
	}
	defer iterator.Close()

	proposals := []*ProposalWithVoteStatus{}
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate proposals: %v", err)
		}
		var proposal MembershipProposal
		if err := json.Unmarshal(result.Value, &proposal); err != nil {
			return nil, fmt.Errorf("failed to unmarshal proposal: %v", err)
		}
		wrapped, err := withCallerVoteStatus(ctx, &proposal)
		if err != nil {
			return nil, err
		}
		proposals = append(proposals, wrapped)
	}
	return proposals, nil
}

// GetProposal returns the membership proposal identified by proposalID.
func (s *SmartContract) GetProposal(ctx contractapi.TransactionContextInterface, proposalID string) (*ProposalWithVoteStatus, error) {
	proposal, err := getProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal == nil {
		return nil, fmt.Errorf("proposal %s does not exist", proposalID)
	}
	return withCallerVoteStatus(ctx, proposal)
}

// withCallerVoteStatus wraps proposal with the calling institution's own
// vote on it, read via a direct GetState lookup on the existing
// (proposalId, votedBy) composite key — an O(1) key read, not a rich
// query, since that key already exists for exactly this lookup (see
// CastVote). Deliberately does not surface any other institution's
// vote — no spec scenario requires it, and it's a more conservative
// default.
func withCallerVoteStatus(ctx contractapi.TransactionContextInterface, proposal *MembershipProposal) (*ProposalWithVoteStatus, error) {
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("failed to get caller MSP ID: %v", err)
	}

	vKey, err := voteKey(ctx, proposal.ProposalID, callerMSP)
	if err != nil {
		return nil, fmt.Errorf("failed to build vote key: %v", err)
	}
	voteBytes, err := ctx.GetStub().GetState(vKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read caller's vote state: %v", err)
	}

	wrapped := &ProposalWithVoteStatus{
		ProposalID:          proposal.ProposalID,
		ApplicantID:         proposal.ApplicantID,
		ApplicantName:       proposal.ApplicantName,
		ProposedBy:          proposal.ProposedBy,
		Status:              proposal.Status,
		VotesFor:            proposal.VotesFor,
		VotesAgainst:        proposal.VotesAgainst,
		TotalEligibleVoters: proposal.TotalEligibleVoters,
		CreatedAt:           proposal.CreatedAt,
		ResolvedAt:          proposal.ResolvedAt,
		DocType:             proposal.DocType,
	}

	if voteBytes != nil {
		var vote Vote
		if err := json.Unmarshal(voteBytes, &vote); err != nil {
			return nil, fmt.Errorf("failed to unmarshal caller's vote: %v", err)
		}
		wrapped.CallerVoteDecision = vote.Decision
	}

	return wrapped, nil
}
