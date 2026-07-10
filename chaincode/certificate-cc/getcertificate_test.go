package main

import (
	"testing"
)

func TestGetCertificate_Exists(t *testing.T) {
	ledger := newFakeLedger()
	hash, err := computeCertificateHash("Alice", "Bachelor of Science", nil)
	if err != nil {
		t.Fatalf("failed to compute hash: %v", err)
	}
	seedCertificate(ledger, &Certificate{
		CertificateID:    "cert1",
		ConsortiumNumber: 1,
		HolderName:       "Alice",
		HolderDetails:    "Bachelor of Science",
		CertificateHash:  hash,
		IssuerID:         "BLCFounderMSP",
		IssuedAt:         "2026-07-09T00:00:00Z",
		Status:           certificateStatusActive,
		DocType:          docTypeCertificate,
	})

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	got, err := sc.GetCertificate(ctx, "cert1")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if got.CertificateID != "cert1" || got.HolderName != "Alice" || got.IssuerID != "BLCFounderMSP" {
		t.Fatalf("unexpected certificate returned: %+v", got)
	}
}

func TestGetCertificate_DoesNotExist(t *testing.T) {
	ledger := newFakeLedger()
	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	_, err := sc.GetCertificate(ctx, "no-such-cert")
	if err == nil {
		t.Fatal("expected an error for a nonexistent certificate, got nil")
	}
}
