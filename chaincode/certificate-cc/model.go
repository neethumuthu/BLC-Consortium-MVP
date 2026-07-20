package main

import "github.com/hyperledger/fabric-contract-api-go/contractapi"

// docTypeCertificate drives the CouchDB rich queries used by
// GetCertificatesByInstitution — same convention as institution-cc's
// docType constants.
const docTypeCertificate = "certificate"

const (
	certificateStatusActive = "active"
	// certificateStatusRevoked is set by RevokeCertificate on an
	// issuer-initiated revocation (see revokecertificate.go). Every
	// Certificate this chaincode creates starts at
	// certificateStatusActive; only RevokeCertificate ever transitions
	// one to certificateStatusRevoked, and never back.
	certificateStatusRevoked = "revoked"
)

const (
	verificationStatusValid    = "VALID"
	verificationStatusTampered = "TAMPERED"
	// verificationStatusRevoked is returned by VerifyCertificate when
	// the stored hash matches (not tampered) but the certificate has
	// since been revoked by its issuer. Hash-tampering is checked FIRST
	// and always wins over revocation — see VerifyCertificate's own
	// comment in queries.go for why.
	verificationStatusRevoked = "REVOKED"
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
	// RevokedAt/RevokedReason are set together, exactly once, by
	// RevokeCertificate — never independently, and never overwritten
	// once set (RevokeCertificate errors on an already-revoked
	// certificate rather than silently updating them). Same
	// metadata-tag requirement as Metadata above: contractapi treats
	// every struct field as required in its response schema unless this
	// tag says otherwise, and IssueCertificate's own response never sets
	// these two fields.
	RevokedAt     string `json:"revokedAt,omitempty" metadata:"revokedAt,optional"`
	RevokedReason string `json:"revokedReason,omitempty" metadata:"revokedReason,optional"`
	DocType       string `json:"docType"`
}

// VerificationResult is VerifyCertificate's return type. Both fields are
// always populated on a successful call (a nonexistent certificateId
// returns a Go error instead, never a partial struct), so neither needs
// omitempty/metadata-optional treatment. VerificationStatus is one of
// VALID, TAMPERED, or REVOKED — see VerifyCertificate's own doc comment
// for the priority order between the latter two.
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
