package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// remoteInstitutionStatusActive mirrors institution-cc's own
// institutionStatusActive constant at the wire level only — the two
// chaincodes are independently deployed Go modules and must not share
// compiled types, just the JSON shape of institution-cc's GetInstitution
// response.
const remoteInstitutionStatusActive = "active"

// remoteInstitution is a deliberately narrow view of institution-cc's
// Institution type — only the fields IssueCertificate actually needs
// from GetInstitution's response.
type remoteInstitution struct {
	InstitutionID string `json:"institutionId"`
	Status        string `json:"status"`
}

// requireActiveInstitution checks mspID against institution-cc's own
// ledger, not this chaincode's — certificate-cc has no institution data
// of its own. InvokeChaincode is peer-local (see docs/BUILD_LOG.md's
// Phase 8 entry): it requires institution-cc to be installed on
// whatever peer executes this call, and merges institution-cc's read
// set into this transaction's own, so a change to the caller's
// Institution record between simulation and commit would invalidate
// this transaction too, not silently use stale data.
func requireActiveInstitution(ctx contractapi.TransactionContextInterface, mspID string) error {
	resp := ctx.GetStub().InvokeChaincode(
		"institution-cc",
		[][]byte{[]byte("GetInstitution"), []byte(mspID)},
		ctx.GetStub().GetChannelID(),
	)
	if resp.Status != shim.OK {
		return fmt.Errorf("%s is not a registered institution", mspID)
	}

	var institution remoteInstitution
	if err := json.Unmarshal(resp.Payload, &institution); err != nil {
		return fmt.Errorf("failed to parse institution-cc's response: %v", err)
	}
	if institution.Status != remoteInstitutionStatusActive {
		return fmt.Errorf("%s is not an active institution", mspID)
	}
	return nil
}

// nextSequenceNumber reads, increments, and writes back the counter at
// key in this same transaction. Shared by nextConsortiumNumber (one
// global key, contended by every org) and nextIssuerSequenceNumber (one
// key per issuer, contended only by that issuer's own concurrent
// issuances) — same read-increment-write shape, different key scope.
func nextSequenceNumber(ctx contractapi.TransactionContextInterface, key string) (int, error) {
	bytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return 0, fmt.Errorf("failed to read counter %s: %v", key, err)
	}
	current := 0
	if bytes != nil {
		current, err = strconv.Atoi(string(bytes))
		if err != nil {
			return 0, fmt.Errorf("failed to parse counter %s: %v", key, err)
		}
	}
	next := current + 1
	if err := ctx.GetStub().PutState(key, []byte(strconv.Itoa(next))); err != nil {
		return 0, fmt.Errorf("failed to write counter %s: %v", key, err)
	}
	return next, nil
}

// nextConsortiumNumber increments certCounterKey — a single global key
// every org's IssueCertificate call writes to, by design (the design
// doc requires consortium-wide, not per-org, sequential numbering).
// Concurrent issuances from different orgs in the same block will
// MVCC-conflict; the loser must retry client-side. Accepted design
// cost, not a bug — see docs/BUILD_LOG.md's Phase 8 entry.
func nextConsortiumNumber(ctx contractapi.TransactionContextInterface) (int, error) {
	return nextSequenceNumber(ctx, certCounterKey)
}

// nextIssuerSequenceNumber increments issuerID's own counter — stored
// permanently on the issued Certificate (Certificate.IssuerSequenceNumber)
// rather than computed on demand, per the product decision logged in
// docs/BUILD_LOG.md's Phase 8 addendum: a certificate number is an
// identity assigned at issuance, not a value that should shift if
// derived from a query whose result set can later change.
func nextIssuerSequenceNumber(ctx contractapi.TransactionContextInterface, issuerID string) (int, error) {
	key, err := issuerCounterKey(ctx, issuerID)
	if err != nil {
		return 0, fmt.Errorf("failed to build issuer counter key: %v", err)
	}
	return nextSequenceNumber(ctx, key)
}

// txTimestamp returns the transaction's client-supplied timestamp,
// identical across every endorsing peer — same determinism reasoning as
// institution-cc's own txTimestamp helper (governance.go). Chaincode
// must never use time.Now().
func txTimestamp(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("failed to get transaction timestamp: %v", err)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339), nil
}

// IssueCertificate issues a new certificate on behalf of the caller,
// unilaterally — per Szymon's confirmation (docs/BUILD_LOG.md's Phase 8
// entry), certificate issuance does not require a second institution's
// chaincode-level action. "Both institutions sign that certificate is
// legitimate" is already satisfied by the channel's existing MAJORITY
// endorsement policy, not by anything in this function.
func (s *SmartContract) IssueCertificate(ctx contractapi.TransactionContextInterface, holderName string, holderDetails string, metadata map[string]interface{}) (*Certificate, error) {
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("failed to get caller MSP ID: %v", err)
	}

	if err := requireActiveInstitution(ctx, callerMSP); err != nil {
		return nil, err
	}

	hash, err := computeCertificateHash(holderName, holderDetails, metadata)
	if err != nil {
		return nil, err
	}

	timestamp, err := txTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	consortiumNumber, err := nextConsortiumNumber(ctx)
	if err != nil {
		return nil, err
	}

	issuerSequenceNumber, err := nextIssuerSequenceNumber(ctx, callerMSP)
	if err != nil {
		return nil, err
	}

	certificate := &Certificate{
		CertificateID:        ctx.GetStub().GetTxID(),
		ConsortiumNumber:     consortiumNumber,
		IssuerSequenceNumber: issuerSequenceNumber,
		HolderName:           holderName,
		HolderDetails:        holderDetails,
		Metadata:             metadata,
		CertificateHash:      hash,
		IssuerID:             callerMSP,
		IssuedAt:             timestamp,
		Status:               certificateStatusActive,
		DocType:              docTypeCertificate,
	}
	if err := putCertificate(ctx, certificate); err != nil {
		return nil, err
	}
	return certificate, nil
}
