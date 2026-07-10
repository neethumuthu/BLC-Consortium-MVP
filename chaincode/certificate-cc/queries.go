package main

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// GetCertificate returns the certificate registered under
// certificateID. Read-only, no caller restriction — per the design doc,
// anyone can verify/look up a certificate, matching institution-cc's own
// query-function convention.
func (s *SmartContract) GetCertificate(ctx contractapi.TransactionContextInterface, certificateID string) (*Certificate, error) {
	certificate, err := getCertificate(ctx, certificateID)
	if err != nil {
		return nil, err
	}
	if certificate == nil {
		return nil, fmt.Errorf("certificate %s does not exist", certificateID)
	}
	return certificate, nil
}

// GetCertificatesByInstitution returns every certificate issued by
// institutionID, most recent first. Uses a plain CouchDB rich query on
// docType+issuerId (no custom index shipped with the chaincode package —
// same simplicity precedent as institution-cc's
// hasLiveProposalForApplicant) and sorts the result by consortiumNumber
// descending in Go, rather than via a Mango "sort" clause.
func (s *SmartContract) GetCertificatesByInstitution(ctx contractapi.TransactionContextInterface, institutionID string) ([]*Certificate, error) {
	selector := fmt.Sprintf(`{"selector":{"docType":"%s","issuerId":"%s"}}`, docTypeCertificate, institutionID)
	iterator, err := ctx.GetStub().GetQueryResult(selector)
	if err != nil {
		return nil, fmt.Errorf("failed to query certificates for %s: %v", institutionID, err)
	}
	defer iterator.Close()

	certificates := []*Certificate{}
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate certificates: %v", err)
		}
		var certificate Certificate
		if err := json.Unmarshal(result.Value, &certificate); err != nil {
			return nil, fmt.Errorf("failed to unmarshal certificate: %v", err)
		}
		certificates = append(certificates, &certificate)
	}

	sort.Slice(certificates, func(i, j int) bool {
		return certificates[i].ConsortiumNumber > certificates[j].ConsortiumNumber
	})
	return certificates, nil
}

// VerifyCertificate recalculates certificateID's hash from its stored
// holderName/holderDetails/metadata and compares it against the stored
// certificateHash. Read-only, no caller restriction, per the design doc
// ("Caller: Anyone").
func (s *SmartContract) VerifyCertificate(ctx contractapi.TransactionContextInterface, certificateID string) (*VerificationResult, error) {
	certificate, err := getCertificate(ctx, certificateID)
	if err != nil {
		return nil, err
	}
	if certificate == nil {
		return nil, fmt.Errorf("certificate %s does not exist", certificateID)
	}

	recomputedHash, err := computeCertificateHash(certificate.HolderName, certificate.HolderDetails, certificate.Metadata)
	if err != nil {
		return nil, err
	}

	verificationStatus := verificationStatusValid
	if recomputedHash != certificate.CertificateHash {
		verificationStatus = verificationStatusTampered
	}

	return &VerificationResult{
		VerificationStatus: verificationStatus,
		Certificate:        certificate,
	}, nil
}
