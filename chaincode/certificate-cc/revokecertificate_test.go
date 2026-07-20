package main

import (
	"testing"
	"time"
)

func TestRevokeCertificate_Success_ByIssuer(t *testing.T) {
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

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Unix(1700000000, 0), nil)
	sc := &SmartContract{}

	got, err := sc.RevokeCertificate(ctx, "cert1", "credential found to be fraudulent")
	mustCommit(t, stub, err)

	if got.Status != certificateStatusRevoked {
		t.Fatalf("expected status revoked, got %s", got.Status)
	}
	if got.RevokedReason != "credential found to be fraudulent" {
		t.Fatalf("expected the given reason to be stored, got %q", got.RevokedReason)
	}
	if got.RevokedAt != "2023-11-14T22:13:20Z" {
		t.Fatalf("expected revokedAt to be the tx timestamp, got %q", got.RevokedAt)
	}

	// Confirm it's actually readable back as revoked, not just returned
	// by RevokeCertificate itself.
	queryCtx := newQueryCtx(ledger)
	readBack, err := sc.GetCertificate(queryCtx, "cert1")
	if err != nil {
		t.Fatalf("expected the committed certificate to be readable, got error: %v", err)
	}
	if readBack.Status != certificateStatusRevoked || readBack.RevokedReason != "credential found to be fraudulent" {
		t.Fatalf("unexpected certificate read back: %+v", readBack)
	}
}

func TestRevokeCertificate_RejectsNonIssuer(t *testing.T) {
	ledger := newFakeLedger()
	hash, _ := computeCertificateHash("Bob", "Master of Arts", nil)
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert2",
		HolderName:      "Bob",
		HolderDetails:   "Master of Arts",
		CertificateHash: hash,
		IssuerID:        "BLCFounderMSP",
		Status:          certificateStatusActive,
		DocType:         docTypeCertificate,
	})

	// InstitutionA did not issue cert2 — only BLCFounderMSP (its
	// issuerId) may revoke it. No governance vote, no other institution
	// allowed, per the confirmed product decision.
	ctx, stub := newTx(ledger, "tx1", "InstitutionAMSP", time.Unix(1700000000, 0), nil)
	sc := &SmartContract{}

	_, err := sc.RevokeCertificate(ctx, "cert2", "some reason")
	mustFail(t, stub, err)
}

func TestRevokeCertificate_RejectsEmptyReason(t *testing.T) {
	ledger := newFakeLedger()
	hash, _ := computeCertificateHash("Carol", "PhD", nil)
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert3",
		HolderName:      "Carol",
		HolderDetails:   "PhD",
		CertificateHash: hash,
		IssuerID:        "BLCFounderMSP",
		Status:          certificateStatusActive,
		DocType:         docTypeCertificate,
	})

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Unix(1700000000, 0), nil)
	sc := &SmartContract{}

	_, err := sc.RevokeCertificate(ctx, "cert3", "")
	mustFail(t, stub, err)
}

func TestRevokeCertificate_RejectsDoubleRevoke(t *testing.T) {
	// The goal is preserving the ORIGINAL revocation's reason/timestamp,
	// not silently accepting a repeat call — so a second RevokeCertificate
	// against an already-revoked certificate must fail outright, and must
	// leave the original revokedAt/revokedReason untouched.
	ledger := newFakeLedger()
	hash, _ := computeCertificateHash("Dave", "MBA", nil)
	seedCertificate(ledger, &Certificate{
		CertificateID:   "cert4",
		HolderName:      "Dave",
		HolderDetails:   "MBA",
		CertificateHash: hash,
		IssuerID:        "BLCFounderMSP",
		Status:          certificateStatusRevoked,
		RevokedAt:       "2026-01-01T00:00:00Z",
		RevokedReason:   "original reason",
		DocType:         docTypeCertificate,
	})

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Unix(1700000000, 0), nil)
	sc := &SmartContract{}

	_, err := sc.RevokeCertificate(ctx, "cert4", "a different, later reason")
	mustFail(t, stub, err)

	// Not committed (mustFail already checked stub.pending is empty) —
	// also confirm the ledger's own committed copy still has the
	// ORIGINAL reason/timestamp, not the rejected attempt's values.
	queryCtx := newQueryCtx(ledger)
	readBack, err := sc.GetCertificate(queryCtx, "cert4")
	if err != nil {
		t.Fatalf("expected the seeded certificate to still be readable, got error: %v", err)
	}
	if readBack.RevokedReason != "original reason" || readBack.RevokedAt != "2026-01-01T00:00:00Z" {
		t.Fatalf("expected the original revocation to be untouched, got %+v", readBack)
	}
}

func TestRevokeCertificate_DoesNotExist(t *testing.T) {
	ledger := newFakeLedger()
	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Unix(1700000000, 0), nil)
	sc := &SmartContract{}

	_, err := sc.RevokeCertificate(ctx, "no-such-cert", "some reason")
	mustFail(t, stub, err)
}
