package main

import "github.com/hyperledger/fabric-contract-api-go/contractapi"

// docType values distinguish asset kinds in CouchDB and drive the rich
// queries used elsewhere in this chaincode (see governance.go).
const (
	docTypeInstitution = "institution"
	docTypeProposal    = "proposal"
	docTypeVote        = "vote"
)

const (
	institutionStatusActive   = "active"
	institutionStatusRejected = "rejected"

	institutionTypeFounding = "founding"
	institutionTypeApproved = "approved"

	proposalStatusOpen     = "open"
	proposalStatusApproved = "approved"
	// proposalStatusRejected is declared but not yet used by any CastVote
	// code path — see hasLiveProposalForApplicant's doc comment in
	// governance.go for the open gap this reflects.
	proposalStatusRejected = "rejected"

	voteDecisionYes = "yes"
	voteDecisionNo  = "no"
)

// foundingListKey holds the immutable, InitLedger-seeded list of founding
// MSP IDs. See governance.go's InitLedger/isFoundingInstitution for why
// this is a plain state key rather than a composite key — it is a single
// global record, not one asset per entity.
const foundingListKey = "GOVERNANCE_FOUNDING_INSTITUTIONS"

// Institution represents a consortium member — founding or approved
// through the voting process. institutionId is always the org's MSP ID,
// derived server-side from the caller's identity, never a client-supplied
// value (see RegisterInstitution).
type Institution struct {
	InstitutionID string `json:"institutionId"`
	Name          string `json:"name"`
	Status        string `json:"status"` // active | pending | rejected
	Type          string `json:"type"`   // founding | approved | partner
	JoinedAt      string `json:"joinedAt"`
	// metadata:"...,optional" is a SEPARATE mechanism from json's
	// omitempty — contractapi generates its own response schema from
	// struct fields and treats every field as required unless the
	// metadata tag says otherwise; omitempty alone only controls
	// marshaling. Without this, a founding org's own RegisterInstitution
	// response (which never sets ApprovedBy) fails contractapi's own
	// post-execution schema validation with "approvedBy is required" —
	// found the hard way deploying institution-cc, see
	// docs/BUILD_LOG.md's Phase 7 ccaas entry.
	ApprovedBy []string `json:"approvedBy,omitempty" metadata:"approvedBy,optional"`
	DocType    string   `json:"docType"`
}

// MembershipProposal represents a request by a new institution to join
// the consortium, sponsored by an existing active institution.
type MembershipProposal struct {
	ProposalID          string `json:"proposalId"`
	ApplicantID         string `json:"applicantId"`
	ApplicantName       string `json:"applicantName"`
	ProposedBy          string `json:"proposedBy"`
	Status              string `json:"status"` // open | approved | rejected
	VotesFor            int    `json:"votesFor"`
	VotesAgainst        int    `json:"votesAgainst"`
	TotalEligibleVoters int    `json:"totalEligibleVoters"`
	CreatedAt           string `json:"createdAt"`
	// See Institution.ApprovedBy's comment — same contractapi schema
	// mechanism. An open proposal never sets ResolvedAt.
	ResolvedAt string `json:"resolvedAt,omitempty" metadata:"resolvedAt,optional"`
	DocType    string `json:"docType"`
}

// Vote represents a single vote cast by an institution on a membership
// proposal. Its key is a composite of (proposalId, votedBy), so a second
// vote from the same institution on the same proposal collides with the
// first at the ledger level — see CastVote's existence check.
type Vote struct {
	VoteID     string `json:"voteId"`
	ProposalID string `json:"proposalId"`
	VotedBy    string `json:"votedBy"`
	Decision   string `json:"decision"` // yes | no
	VotedAt    string `json:"votedAt"`
	DocType    string `json:"docType"`
}

// institutionKey/proposalKey/voteKey use Fabric's composite-key encoding
// (CreateCompositeKey), not literal "~"-joined strings — the design doc's
// "institution~{id}" notation is the human-readable convention for
// describing a composite key, matching how fabric-samples' own tutorials
// document the same mechanism.
func institutionKey(ctx contractapi.TransactionContextInterface, institutionID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(docTypeInstitution, []string{institutionID})
}

func proposalKey(ctx contractapi.TransactionContextInterface, proposalID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(docTypeProposal, []string{proposalID})
}

func voteKey(ctx contractapi.TransactionContextInterface, proposalID string, votedBy string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(docTypeVote, []string{proposalID, votedBy})
}
