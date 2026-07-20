package main

import (
	"testing"
)

func TestVerifyCertificate_ValidCertificate_NoMetadata(t *testing.T) {
	// Exercises the exact scenario model.go's Metadata field was
	// proactively tagged for: a certificate issued with no metadata at
	// all (nil map, omitted from JSON) must still hash and verify
	// correctly, not just a certificate that happens to have metadata.
	ledger := newFakeLedger()
	hash, err := computeCertificateHash("Alice", "Bachelor of Science", nil)
	if err != nil {
		t.Fatalf("failed to compute hash: %v", err)
	}
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert1",
		HolderName:      "Alice",
		HolderDetails:   "Bachelor of Science",
		CertificateHash: hash,
		IssuerID:        "BLCFounderMSP",
		Status:          certificateStatusActive,
		DocType:         docTypeCertificate,
	})

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	result, err := sc.VerifyCertificate(ctx, "cert1")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if result.VerificationStatus != verificationStatusValid {
		t.Fatalf("expected VALID, got %s", result.VerificationStatus)
	}
}

func TestVerifyCertificate_ValidCertificate_WithMetadata(t *testing.T) {
	metadata := map[string]interface{}{"grade": "A", "year": float64(2026)}
	ledger := newFakeLedger()
	hash, err := computeCertificateHash("Bob", "Master of Arts", metadata)
	if err != nil {
		t.Fatalf("failed to compute hash: %v", err)
	}
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert2",
		HolderName:      "Bob",
		HolderDetails:   "Master of Arts",
		Metadata:        metadata,
		CertificateHash: hash,
		IssuerID:        "InstitutionAMSP",
		Status:          certificateStatusActive,
		DocType:         docTypeCertificate,
	})

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	result, err := sc.VerifyCertificate(ctx, "cert2")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if result.VerificationStatus != verificationStatusValid {
		t.Fatalf("expected VALID, got %s", result.VerificationStatus)
	}
}

func TestVerifyCertificate_TamperedCertificate(t *testing.T) {
	// Simulates data that was altered after issuance without recomputing
	// the hash: the stored certificateHash corresponds to different
	// holderDetails than what's actually stored now.
	ledger := newFakeLedger()
	originalHash, err := computeCertificateHash("Carol", "Bachelor of Science", nil)
	if err != nil {
		t.Fatalf("failed to compute hash: %v", err)
	}
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert3",
		HolderName:      "Carol",
		HolderDetails:   "Doctor of Medicine", // changed after the hash was computed
		CertificateHash: originalHash,
		IssuerID:        "BLCFounderMSP",
		Status:          certificateStatusActive,
		DocType:         docTypeCertificate,
	})

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	result, err := sc.VerifyCertificate(ctx, "cert3")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if result.VerificationStatus != verificationStatusTampered {
		t.Fatalf("expected TAMPERED, got %s", result.VerificationStatus)
	}
	// The certificate itself is still returned alongside the verdict —
	// callers see both the verdict and the (tampered) stored data.
	if result.Certificate == nil || result.Certificate.HolderDetails != "Doctor of Medicine" {
		t.Fatalf("expected the stored certificate to be returned as-is, got %+v", result.Certificate)
	}
}

func TestVerifyCertificate_DoesNotExist(t *testing.T) {
	ledger := newFakeLedger()
	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	_, err := sc.VerifyCertificate(ctx, "no-such-cert")
	if err == nil {
		t.Fatal("expected an error for a nonexistent certificate, got nil")
	}
}

func TestVerifyCertificate_RevokedCertificate(t *testing.T) {
	ledger := newFakeLedger()
	hash, err := computeCertificateHash("Erin", "Bachelor of Arts", nil)
	if err != nil {
		t.Fatalf("failed to compute hash: %v", err)
	}
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert5",
		HolderName:      "Erin",
		HolderDetails:   "Bachelor of Arts",
		CertificateHash: hash, // untampered — matches stored fields
		IssuerID:        "BLCFounderMSP",
		Status:          certificateStatusRevoked,
		RevokedAt:       "2026-01-01T00:00:00Z",
		RevokedReason:   "credential found to be fraudulent",
		DocType:         docTypeCertificate,
	})

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	result, err := sc.VerifyCertificate(ctx, "cert5")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if result.VerificationStatus != verificationStatusRevoked {
		t.Fatalf("expected REVOKED, got %s", result.VerificationStatus)
	}
}

func TestVerifyCertificate_TamperedTakesPriorityOverRevoked(t *testing.T) {
	// A certificate that is BOTH revoked AND has a hash mismatch must
	// report TAMPERED, never REVOKED — hash integrity is checked first,
	// per the confirmed product decision, regardless of status.
	ledger := newFakeLedger()
	originalHash, err := computeCertificateHash("Frank", "Bachelor of Science", nil)
	if err != nil {
		t.Fatalf("failed to compute hash: %v", err)
	}
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert6",
		HolderName:      "Frank",
		HolderDetails:   "Doctor of Medicine", // changed after the hash was computed
		CertificateHash: originalHash,
		IssuerID:        "BLCFounderMSP",
		Status:          certificateStatusRevoked,
		RevokedAt:       "2026-01-01T00:00:00Z",
		RevokedReason:   "credential found to be fraudulent",
		DocType:         docTypeCertificate,
	})

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	result, err := sc.VerifyCertificate(ctx, "cert6")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if result.VerificationStatus != verificationStatusTampered {
		t.Fatalf("expected TAMPERED to take priority over REVOKED, got %s", result.VerificationStatus)
	}
}
