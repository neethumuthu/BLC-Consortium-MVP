package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract implements institution-cc: consortium governance
// (institution registration, membership proposals, and voting).
type SmartContract struct {
	contractapi.Contract
}

// requiredVotesToApprove is the ONE place the consortium's approval
// threshold formula lives. Default: majority. Swapping to a 66%
// supermajority later — an open product decision, not an engineering
// one, per project governance notes — is a one-line change here, never
// a change scattered across multiple functions.
func requiredVotesToApprove(totalEligibleVoters int) int {
	return totalEligibleVoters/2 + 1
}

// txTimestamp returns the transaction's client-supplied timestamp
// (fixed by the signed proposal, identical across every endorsing peer)
// formatted as RFC 3339. Chaincode must never use time.Now() — it would
// differ across peers and break endorsement-policy agreement, the same
// determinism hazard documented for ID generation in docs/BUILD_LOG.md.
func txTimestamp(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("failed to get transaction timestamp: %v", err)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339), nil
}

// InitLedger seeds the immutable founding-institution allowlist. It must
// be invoked exactly once, as this chaincode's Fabric-lifecycle Init
// transaction (--isInit) at first commit — chaincode.sh derives
// foundingMSPIDs from network.yaml's status: founding orgs.
//
// Fabric's own --isInit gate (core/chaincode/chaincode_support.go's
// CheckInvocation) only refuses re-invocation under the SAME chaincode
// version; a future upgrade that bumps the version and re-sets
// --init-required could ask for Init again (see docs/BUILD_LOG.md's
// Phase 7 entry, verified against Fabric 2.5 source). This function's own
// existence check below — not Fabric's gate — is what actually makes the
// founding list permanent.
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface, foundingMSPIDs []string) error {
	existing, err := ctx.GetStub().GetState(foundingListKey)
	if err != nil {
		return fmt.Errorf("failed to read founding institution list: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("founding institution list is already initialized and cannot be reinitialized")
	}
	if len(foundingMSPIDs) == 0 {
		return fmt.Errorf("founding institution list must not be empty")
	}

	listBytes, err := json.Marshal(foundingMSPIDs)
	if err != nil {
		return fmt.Errorf("failed to marshal founding institution list: %v", err)
	}
	if err := ctx.GetStub().PutState(foundingListKey, listBytes); err != nil {
		return fmt.Errorf("failed to write founding institution list: %v", err)
	}
	return nil
}

// isFoundingInstitution reports whether mspID is in the list InitLedger
// seeded. Returns an error (not false) if InitLedger has never run, so
// callers fail loudly instead of silently treating an uninitialized
// ledger as "nobody is a founder."
func isFoundingInstitution(ctx contractapi.TransactionContextInterface, mspID string) (bool, error) {
	listBytes, err := ctx.GetStub().GetState(foundingListKey)
	if err != nil {
		return false, fmt.Errorf("failed to read founding institution list: %v", err)
	}
	if listBytes == nil {
		return false, fmt.Errorf("founding institution list has not been initialized — InitLedger must run first")
	}

	var founders []string
	if err := json.Unmarshal(listBytes, &founders); err != nil {
		return false, fmt.Errorf("failed to unmarshal founding institution list: %v", err)
	}
	for _, id := range founders {
		if id == mspID {
			return true, nil
		}
	}
	return false, nil
}

func getInstitution(ctx contractapi.TransactionContextInterface, institutionID string) (*Institution, error) {
	key, err := institutionKey(ctx, institutionID)
	if err != nil {
		return nil, fmt.Errorf("failed to build institution key: %v", err)
	}
	bytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read institution %s: %v", institutionID, err)
	}
	if bytes == nil {
		return nil, nil
	}
	var institution Institution
	if err := json.Unmarshal(bytes, &institution); err != nil {
		return nil, fmt.Errorf("failed to unmarshal institution %s: %v", institutionID, err)
	}
	return &institution, nil
}

func putInstitution(ctx contractapi.TransactionContextInterface, institution *Institution) error {
	key, err := institutionKey(ctx, institution.InstitutionID)
	if err != nil {
		return fmt.Errorf("failed to build institution key: %v", err)
	}
	bytes, err := json.Marshal(institution)
	if err != nil {
		return fmt.Errorf("failed to marshal institution: %v", err)
	}
	if err := ctx.GetStub().PutState(key, bytes); err != nil {
		return fmt.Errorf("failed to write institution: %v", err)
	}
	return nil
}

// RegisterInstitution registers the calling organization as an active
// institution. Callable exactly once per organization, and only for
// organizations InitLedger seeded into the founding list — every
// institution admitted afterward is created automatically by CastVote
// when its membership proposal passes; it never calls this function
// itself. institutionId is always derived from the caller's own MSP ID
// (cid, via GetClientIdentity), never a client-supplied argument, so no
// org can ever register itself as another org's identity.
func (s *SmartContract) RegisterInstitution(ctx contractapi.TransactionContextInterface, name string) (*Institution, error) {
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("failed to get caller MSP ID: %v", err)
	}

	isFounder, err := isFoundingInstitution(ctx, mspID)
	if err != nil {
		return nil, err
	}
	if !isFounder {
		return nil, fmt.Errorf("%s is not a founding institution — new institutions must join via ProposeNewMember/CastVote", mspID)
	}

	existing, err := getInstitution(ctx, mspID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("institution %s is already registered", mspID)
	}

	timestamp, err := txTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	institution := &Institution{
		InstitutionID: mspID,
		Name:          name,
		Status:        institutionStatusActive,
		Type:          institutionTypeFounding,
		JoinedAt:      timestamp,
		DocType:       docTypeInstitution,
	}
	if err := putInstitution(ctx, institution); err != nil {
		return nil, err
	}
	return institution, nil
}

func getProposal(ctx contractapi.TransactionContextInterface, proposalID string) (*MembershipProposal, error) {
	key, err := proposalKey(ctx, proposalID)
	if err != nil {
		return nil, fmt.Errorf("failed to build proposal key: %v", err)
	}
	bytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read proposal %s: %v", proposalID, err)
	}
	if bytes == nil {
		return nil, nil
	}
	var proposal MembershipProposal
	if err := json.Unmarshal(bytes, &proposal); err != nil {
		return nil, fmt.Errorf("failed to unmarshal proposal %s: %v", proposalID, err)
	}
	return &proposal, nil
}

func putProposal(ctx contractapi.TransactionContextInterface, proposal *MembershipProposal) error {
	key, err := proposalKey(ctx, proposal.ProposalID)
	if err != nil {
		return fmt.Errorf("failed to build proposal key: %v", err)
	}
	bytes, err := json.Marshal(proposal)
	if err != nil {
		return fmt.Errorf("failed to marshal proposal: %v", err)
	}
	if err := ctx.GetStub().PutState(key, bytes); err != nil {
		return fmt.Errorf("failed to write proposal: %v", err)
	}
	return nil
}

// hasLiveProposalForApplicant checks for a proposal that is "open" or
// "approved" — deliberately excluding "rejected". Approval and rejection
// are not equivalent for this check: an approved applicant is already a
// member (its Institution asset exists atomically with approval, see
// CastVote) and must never be re-proposed, but a rejected applicant has
// simply not been admitted *yet* — real governance processes generally
// allow reapplying after a rejection, and treating rejection as a
// permanent block would be a significant, easy-to-miss consequence of a
// blanket "any status" check, not a neutral implementation detail.
//
// This is deliberately broader than "no open proposal" alone: relying
// only on an open-status check plus the separate already-a-member check
// in ProposeNewMember would mean duplicate prevention for the approved
// case depends on CastVote's approval and Institution-creation writes
// staying atomic (they are — Fabric transactions are all-or-nothing, so
// there is no ledger state where a proposal is "approved" without its
// Institution asset also existing). Checking "approved" here directly,
// instead of relying on that as an invariant of another function, makes
// "one live proposal per applicant" self-contained in ProposeNewMember
// itself. Uses a CouchDB rich query (this chaincode requires CouchDB as
// the state database, matching Phase 5's network configuration) since
// this is a query on docType+applicantId+status, not a lookup by a
// single deterministic key.
//
// Follow-up: CastVote has no code path that ever sets Status to
// "rejected" yet — the design doc lists it as a valid Proposal status
// and implies CastVote "resolves" the proposal, but only specifies the
// approval case. An unpopular proposal currently just stays "open"
// forever. This function is written correctly in anticipation of
// rejection existing; implementing when/how a proposal actually becomes
// rejected is still an open gap.
func hasLiveProposalForApplicant(ctx contractapi.TransactionContextInterface, applicantID string) (bool, error) {
	selector := fmt.Sprintf(`{"selector":{"docType":"%s","applicantId":"%s","status":{"$in":["%s","%s"]}}}`,
		docTypeProposal, applicantID, proposalStatusOpen, proposalStatusApproved)
	iterator, err := ctx.GetStub().GetQueryResult(selector)
	if err != nil {
		return false, fmt.Errorf("failed to query proposals for %s: %v", applicantID, err)
	}
	defer iterator.Close()
	return iterator.HasNext(), nil
}

func countActiveInstitutions(ctx contractapi.TransactionContextInterface) (int, error) {
	selector := fmt.Sprintf(`{"selector":{"docType":"%s","status":"%s"}}`, docTypeInstitution, institutionStatusActive)
	iterator, err := ctx.GetStub().GetQueryResult(selector)
	if err != nil {
		return 0, fmt.Errorf("failed to query active institutions: %v", err)
	}
	defer iterator.Close()

	count := 0
	for iterator.HasNext() {
		if _, err := iterator.Next(); err != nil {
			return 0, fmt.Errorf("failed to iterate active institutions: %v", err)
		}
		count++
	}
	return count, nil
}

// approvingVoters returns MSP IDs that have already voted "yes" on
// proposalID, as committed on the ledger BEFORE the current transaction.
// Deliberately queried before CastVote writes the current transaction's
// own vote: GetQueryResult (a CouchDB rich query) reads the committed
// state database, not this transaction's own pending write set — unlike
// GetState/PutState, it has no "read your own writes" visibility within
// a single transaction. Querying afterward would silently omit whichever
// vote just got cast in this same transaction. CastVote appends the
// current voter itself, in memory, after this call.
func approvingVoters(ctx contractapi.TransactionContextInterface, proposalID string) ([]string, error) {
	selector := fmt.Sprintf(`{"selector":{"docType":"%s","proposalId":"%s","decision":"%s"}}`,
		docTypeVote, proposalID, voteDecisionYes)
	iterator, err := ctx.GetStub().GetQueryResult(selector)
	if err != nil {
		return nil, fmt.Errorf("failed to query approving votes for proposal %s: %v", proposalID, err)
	}
	defer iterator.Close()

	var voters []string
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate approving votes: %v", err)
		}
		var vote Vote
		if err := json.Unmarshal(result.Value, &vote); err != nil {
			return nil, fmt.Errorf("failed to unmarshal vote: %v", err)
		}
		voters = append(voters, vote.VotedBy)
	}
	return voters, nil
}

// ProposeNewMember submits a proposal for a new institution to join the
// consortium. The applicant is not required to already be a Fabric
// channel member — applicantId only needs to be the MSP ID it will have;
// joining the channel itself (org-add.sh) is a separate, later step that
// only matters once the applicant needs to actually transact.
func (s *SmartContract) ProposeNewMember(ctx contractapi.TransactionContextInterface, applicantID string, applicantName string) (*MembershipProposal, error) {
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("failed to get caller MSP ID: %v", err)
	}

	callerInstitution, err := getInstitution(ctx, callerMSP)
	if err != nil {
		return nil, err
	}
	if callerInstitution == nil || callerInstitution.Status != institutionStatusActive {
		return nil, fmt.Errorf("%s is not an active institution and cannot propose new members", callerMSP)
	}

	applicantInstitution, err := getInstitution(ctx, applicantID)
	if err != nil {
		return nil, err
	}
	if applicantInstitution != nil {
		return nil, fmt.Errorf("%s is already a member institution", applicantID)
	}

	hasLive, err := hasLiveProposalForApplicant(ctx, applicantID)
	if err != nil {
		return nil, err
	}
	if hasLive {
		return nil, fmt.Errorf("an open or already-approved membership proposal exists for %s", applicantID)
	}

	totalEligibleVoters, err := countActiveInstitutions(ctx)
	if err != nil {
		return nil, err
	}

	timestamp, err := txTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	// GetTxID, not a random UUID library: deterministic by construction
	// (fixed by the signed proposal before simulation starts, identical
	// across every endorsing peer). See docs/BUILD_LOG.md's Phase 7 entry
	// for why a random UUID would break multi-peer endorsement here.
	proposal := &MembershipProposal{
		ProposalID:          ctx.GetStub().GetTxID(),
		ApplicantID:         applicantID,
		ApplicantName:       applicantName,
		ProposedBy:          callerMSP,
		Status:              proposalStatusOpen,
		VotesFor:            0,
		VotesAgainst:        0,
		TotalEligibleVoters: totalEligibleVoters,
		CreatedAt:           timestamp,
		DocType:             docTypeProposal,
	}
	if err := putProposal(ctx, proposal); err != nil {
		return nil, err
	}
	return proposal, nil
}

// CastVote casts a vote on an open membership proposal. If the yes-vote
// threshold is reached, the proposal is approved and the applicant's
// Institution asset is created automatically in this same transaction —
// the applicant never calls RegisterInstitution itself.
func (s *SmartContract) CastVote(ctx contractapi.TransactionContextInterface, proposalID string, decision string) (*MembershipProposal, error) {
	if decision != voteDecisionYes && decision != voteDecisionNo {
		return nil, fmt.Errorf("decision must be '%s' or '%s', got '%s'", voteDecisionYes, voteDecisionNo, decision)
	}

	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("failed to get caller MSP ID: %v", err)
	}

	callerInstitution, err := getInstitution(ctx, callerMSP)
	if err != nil {
		return nil, err
	}
	if callerInstitution == nil || callerInstitution.Status != institutionStatusActive {
		return nil, fmt.Errorf("%s is not an active institution and cannot vote", callerMSP)
	}

	proposal, err := getProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal == nil {
		return nil, fmt.Errorf("proposal %s does not exist", proposalID)
	}
	if proposal.Status != proposalStatusOpen {
		return nil, fmt.Errorf("proposal %s is not open (status: %s)", proposalID, proposal.Status)
	}
	if callerMSP == proposal.ApplicantID {
		return nil, fmt.Errorf("%s is the applicant and cannot vote on its own proposal", callerMSP)
	}

	vKey, err := voteKey(ctx, proposalID, callerMSP)
	if err != nil {
		return nil, fmt.Errorf("failed to build vote key: %v", err)
	}
	existingVote, err := ctx.GetStub().GetState(vKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read vote state: %v", err)
	}
	if existingVote != nil {
		return nil, fmt.Errorf("%s has already voted on proposal %s", callerMSP, proposalID)
	}

	// Read prior approving voters BEFORE writing this transaction's own
	// vote — see approvingVoters' doc comment for why the order matters.
	priorApprovers, err := approvingVoters(ctx, proposalID)
	if err != nil {
		return nil, err
	}

	timestamp, err := txTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	vote := &Vote{
		VoteID:     fmt.Sprintf("%s~%s", proposalID, callerMSP),
		ProposalID: proposalID,
		VotedBy:    callerMSP,
		Decision:   decision,
		VotedAt:    timestamp,
		DocType:    docTypeVote,
	}
	voteBytes, err := json.Marshal(vote)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal vote: %v", err)
	}
	if err := ctx.GetStub().PutState(vKey, voteBytes); err != nil {
		return nil, fmt.Errorf("failed to write vote: %v", err)
	}

	if decision == voteDecisionYes {
		proposal.VotesFor++
	} else {
		proposal.VotesAgainst++
	}

	if proposal.VotesFor >= requiredVotesToApprove(proposal.TotalEligibleVoters) {
		proposal.Status = proposalStatusApproved
		proposal.ResolvedAt = timestamp

		approvedBy := priorApprovers
		if decision == voteDecisionYes {
			approvedBy = append(approvedBy, callerMSP)
		}

		applicant := &Institution{
			InstitutionID: proposal.ApplicantID,
			Name:          proposal.ApplicantName,
			Status:        institutionStatusActive,
			Type:          institutionTypeApproved,
			JoinedAt:      timestamp,
			ApprovedBy:    approvedBy,
			DocType:       docTypeInstitution,
		}
		if err := putInstitution(ctx, applicant); err != nil {
			return nil, err
		}
	} else {
		// Option 1 (majority-unreachable): reject as soon as approval
		// becomes mathematically impossible, rather than waiting for
		// every eligible voter to vote (which may never happen — see
		// docs/BUILD_LOG.md's Phase 7 entry for why "wait for 100%
		// participation" can stall forever even at N=2, our first real
		// vote) or mirroring the approval threshold directly against
		// VotesAgainst (which has a real stuck-vote bug at even N,
		// including N=2: a 1-yes/1-no split with only 2 total voters
		// never reaches either threshold, since no third voter exists).
		remainingVoters := proposal.TotalEligibleVoters - proposal.VotesFor - proposal.VotesAgainst
		maxPossibleYes := proposal.VotesFor + remainingVoters
		if maxPossibleYes < requiredVotesToApprove(proposal.TotalEligibleVoters) {
			proposal.Status = proposalStatusRejected
			proposal.ResolvedAt = timestamp
		}
	}

	if err := putProposal(ctx, proposal); err != nil {
		return nil, err
	}
	return proposal, nil
}
