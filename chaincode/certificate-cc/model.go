package main

import "github.com/hyperledger/fabric-contract-api-go/contractapi"

// docTypeCertificate drives the CouchDB rich queries used by
// GetCertificatesByInstitution — same convention as institution-cc's
// docType constants.
const docTypeCertificate = "certificate"

const (
	certificateStatusActive = "active"
	// certificateStatusRevoked is declared per the design doc's
	// Certificate.status field ("active | revoked"), but — same shape of
	// gap as institution-cc's proposalStatusRejected — no function in
	// this phase ever sets it. RevokeCertificate is not yet scoped by
	// the team (see docs/BUILD_LOG.md's Phase 8 entry); every Certificate
	// this chaincode creates has status "active".
	certificateStatusRevoked = "revoked"
)

const (
	verificationStatusValid    = "VALID"
	verificationStatusTampered = "TAMPERED"
)

// certCounterKey holds the consortium-wide, cross-institution sequential
// counter (design doc: "Sequential number across all institutions —
// auto-incremented"). A plain state key, not a composite key — one
// global singleton value, same pattern as institution-cc's
// foundingListKey, not a per-asset key.
const certCounterKey = "CERT_COUNTER"

// docTypeIssuerCounter namespaces the per-issuer sequence counters
// (issuerCounterKey below) — a distinct composite-key space from
// docTypeCertificate, since these are singleton per-issuer values, not
// Certificate assets.
const docTypeIssuerCounter = "issuerCounter"

// Certificate represents a credential issued by a consortium
// institution, per BLC_Technical_Design_Document_v3.docx section 1.2,
// plus IssuerSequenceNumber (added 2026-07-09 per product decision —
// see docs/BUILD_LOG.md's Phase 8 addendum — not in the original design
// doc).
type Certificate struct {
	CertificateID    string `json:"certificateId"`
	ConsortiumNumber int    `json:"consortiumNumber"`
	// IssuerSequenceNumber is this certificate's position among only
	// this issuer's own certificates (BLCFounderMSP's 1st, 2nd, ... —
	// independent of any other institution's count), stored permanently
	// at issuance rather than computed on demand from
	// GetCertificatesByInstitution's result — a certificate number is an
	// identity, not a derived display value, and must not be able to
	// shift if the underlying query's result set ever changes (e.g. once
	// RevokeCertificate exists).
	IssuerSequenceNumber int    `json:"issuerSequenceNumber"`
	HolderName           string `json:"holderName"`
	HolderDetails        string `json:"holderDetails"`
	// Metadata is genuinely optional (design doc: "Required: No") and
	// absent (empty map, not just nil) on the common case of a
	// certificate issued with no client-specific fields. Confirmed
	// upfront, not found the hard way like institution-cc's ApprovedBy/
	// ResolvedAt: metadata's own required-ness in contractapi's response
	// schema comes from this metadata STRUCT TAG, a separate mechanism
	// from json's omitempty — see docs/ERROR_LOG.md's 2026-07-09 entry.
	Metadata        map[string]interface{} `json:"metadata,omitempty" metadata:"metadata,optional"`
	CertificateHash string                 `json:"certificateHash"`
	IssuerID        string                 `json:"issuerId"`
	IssuedAt        string                 `json:"issuedAt"`
	Status          string                 `json:"status"` // active | revoked
	DocType         string                 `json:"docType"`
}

// VerificationResult is VerifyCertificate's return type per the design
// doc: "{ status: VALID | TAMPERED, certificate: Certificate }". Both
// fields are always populated on a successful call (a nonexistent
// certificateId returns a Go error instead, never a partial struct), so
// neither needs omitempty/metadata-optional treatment.
type VerificationResult struct {
	VerificationStatus string       `json:"status"`
	Certificate        *Certificate `json:"certificate"`
}

// certificateKey uses Fabric's composite-key encoding, matching
// institution-cc's institutionKey/proposalKey/voteKey convention — not
// a literal "~"-joined string.
func certificateKey(ctx contractapi.TransactionContextInterface, certificateID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(docTypeCertificate, []string{certificateID})
}

// issuerCounterKey is one singleton value per issuer — lower contention
// than certCounterKey by construction, since two institutions issuing
// concurrently never touch the same issuerCounterKey, only the shared
// certCounterKey.
func issuerCounterKey(ctx contractapi.TransactionContextInterface, issuerID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(docTypeIssuerCounter, []string{issuerID})
}
