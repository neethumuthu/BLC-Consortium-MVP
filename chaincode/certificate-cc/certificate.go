package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract implements certificate-cc: certificate issuance,
// verification, and consortium-wide sequential numbering.
type SmartContract struct {
	contractapi.Contract
}

// certificateHashInput is the canonical subset of Certificate fields the
// design doc's hash spec covers — holderName, holderDetails, and
// metadata only, never certificateId/issuerId/issuedAt/consortiumNumber
// (those are provenance about the certificate, not its content).
// Marshaling a map value via encoding/json sorts its keys before
// encoding — this is documented Go stdlib behavior (`go doc
// encoding/json Marshal`: "The map keys are sorted and used as JSON
// object keys"), not an assumption — which satisfies the design doc's
// "metadata keys sorted alphabetically" requirement with no custom
// canonicalization code needed.
type certificateHashInput struct {
	HolderName    string                 `json:"holderName"`
	HolderDetails string                 `json:"holderDetails"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// computeCertificateHash is shared by IssueCertificate (computes the
// hash to store) and VerifyCertificate (recomputes it to compare against
// the stored value) — one implementation, so the two can never drift
// apart from each other by accident.
func computeCertificateHash(holderName string, holderDetails string, metadata map[string]interface{}) (string, error) {
	input := certificateHashInput{
		HolderName:    holderName,
		HolderDetails: holderDetails,
		Metadata:      metadata,
	}
	bytes, err := json.Marshal(input)
	if err != nil {
		return "", fmt.Errorf("failed to marshal certificate hash input: %v", err)
	}
	sum := sha256.Sum256(bytes)
	return hex.EncodeToString(sum[:]), nil
}

func getCertificate(ctx contractapi.TransactionContextInterface, certificateID string) (*Certificate, error) {
	key, err := certificateKey(ctx, certificateID)
	if err != nil {
		return nil, fmt.Errorf("failed to build certificate key: %v", err)
	}
	bytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read certificate %s: %v", certificateID, err)
	}
	if bytes == nil {
		return nil, nil
	}
	var certificate Certificate
	if err := json.Unmarshal(bytes, &certificate); err != nil {
		return nil, fmt.Errorf("failed to unmarshal certificate %s: %v", certificateID, err)
	}
	return &certificate, nil
}

func putCertificate(ctx contractapi.TransactionContextInterface, certificate *Certificate) error {
	key, err := certificateKey(ctx, certificate.CertificateID)
	if err != nil {
		return fmt.Errorf("failed to build certificate key: %v", err)
	}
	bytes, err := json.Marshal(certificate)
	if err != nil {
		return fmt.Errorf("failed to marshal certificate: %v", err)
	}
	if err := ctx.GetStub().PutState(key, bytes); err != nil {
		return fmt.Errorf("failed to write certificate: %v", err)
	}
	return nil
}
