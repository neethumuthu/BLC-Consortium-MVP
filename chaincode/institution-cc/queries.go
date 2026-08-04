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
func (s *SmartContract) GetOpenProposals(ctx contractapi.TransactionContextInterface) ([]*MembershipProposal, error) {
	selector := fmt.Sprintf(`{"selector":{"docType":"%s","status":"%s"}}`, docTypeProposal, proposalStatusOpen)
	iterator, err := ctx.GetStub().GetQueryResult(selector)
	if err != nil {
		return nil, fmt.Errorf("failed to query open proposals: %v", err)
	}
	defer iterator.Close()

	proposals := []*MembershipProposal{}
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate proposals: %v", err)
		}
		var proposal MembershipProposal
		if err := json.Unmarshal(result.Value, &proposal); err != nil {
			return nil, fmt.Errorf("failed to unmarshal proposal: %v", err)
		}
		proposals = append(proposals, &proposal)
	}
	return proposals, nil
}

// GetProposal returns the membership proposal identified by proposalID.
func (s *SmartContract) GetProposal(ctx contractapi.TransactionContextInterface, proposalID string) (*MembershipProposal, error) {
	proposal, err := getProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal == nil {
		return nil, fmt.Errorf("proposal %s does not exist", proposalID)
	}
	return proposal, nil
}
