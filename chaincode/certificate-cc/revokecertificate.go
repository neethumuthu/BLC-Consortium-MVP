package main

import (
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// RevokeCertificate marks certificateID as revoked, permanently
// recording reason and the revocation's transaction timestamp. Only the
// certificate's ORIGINAL ISSUER (caller MSP == certificate.IssuerID) may
// revoke it — no governance vote, no other institution allowed, per
// Szymon's 2026-07-15 confirmation. Unlike IssueCertificate, this does
// NOT call requireActiveInstitution: an institution that issued a
// certificate while active, then later left/was suspended, must still
// be able to revoke its own prior issuances — the authorization check
// here is narrower and stricter (exact issuer match) than "any active
// institution," not weaker.
func (s *SmartContract) RevokeCertificate(ctx contractapi.TransactionContextInterface, certificateID string, reason string) (*Certificate, error) {
	if reason == "" {
		return nil, fmt.Errorf("revocation reason must not be empty")
	}

	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("failed to get caller MSP ID: %v", err)
	}

	certificate, err := getCertificate(ctx, certificateID)
	if err != nil {
		return nil, err
	}
	if certificate == nil {
		return nil, fmt.Errorf("certificate %s does not exist", certificateID)
	}

	if certificate.IssuerID != callerMSP {
		return nil, fmt.Errorf("%s is not the issuer of certificate %s", callerMSP, certificateID)
	}
	if certificate.Status == certificateStatusRevoked {
		return nil, fmt.Errorf("certificate %s is already revoked", certificateID)
	}

	timestamp, err := txTimestamp(ctx)
	if err != nil {
		return nil, err
	}

	certificate.Status = certificateStatusRevoked
	certificate.RevokedAt = timestamp
	certificate.RevokedReason = reason

	if err := putCertificate(ctx, certificate); err != nil {
		return nil, err
	}
	return certificate, nil
}
