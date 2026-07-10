package main

import (
	"testing"
)

func seedForInstitutionTest(ledger *fakeLedger) {
	seedCertificate(ledger, &Certificate{
		CertificateID:    "certA1",
		ConsortiumNumber: 1,
		HolderName:       "Alice",
		IssuerID:         "BLCFounderMSP",
		DocType:          docTypeCertificate,
	})
	seedCertificate(ledger, &Certificate{
		CertificateID:    "certA3",
		ConsortiumNumber: 3,
		HolderName:       "Carol",
		IssuerID:         "BLCFounderMSP",
		DocType:          docTypeCertificate,
	})
	seedCertificate(ledger, &Certificate{
		CertificateID:    "certA2",
		ConsortiumNumber: 2,
		HolderName:       "Bob",
		IssuerID:         "BLCFounderMSP",
		DocType:          docTypeCertificate,
	})
	// Belongs to a different institution — must never appear in
	// BLCFounderMSP's results.
	seedCertificate(ledger, &Certificate{
		CertificateID:    "certB1",
		ConsortiumNumber: 4,
		HolderName:       "Dave",
		IssuerID:         "InstitutionAMSP",
		DocType:          docTypeCertificate,
	})
}

func TestGetCertificatesByInstitution_SortedDescendingAndFiltered(t *testing.T) {
	ledger := newFakeLedger()
	seedForInstitutionTest(ledger)

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	got, err := sc.GetCertificatesByInstitution(ctx, "BLCFounderMSP")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 certificates for BLCFounderMSP, got %d", len(got))
	}
	wantOrder := []int{3, 2, 1}
	for i, want := range wantOrder {
		if got[i].ConsortiumNumber != want {
			t.Fatalf("position %d: expected consortiumNumber %d, got %d (full order: %v)",
				i, want, got[i].ConsortiumNumber, consortiumNumbers(got))
		}
	}
	for _, cert := range got {
		if cert.IssuerID != "BLCFounderMSP" {
			t.Fatalf("result includes a certificate from another issuer: %+v", cert)
		}
	}
}

func TestGetCertificatesByInstitution_NoneFound(t *testing.T) {
	ledger := newFakeLedger()
	seedForInstitutionTest(ledger)

	ctx := newQueryCtx(ledger)
	sc := &SmartContract{}

	got, err := sc.GetCertificatesByInstitution(ctx, "InstitutionBMSP")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no certificates, got %d", len(got))
	}
}

func consortiumNumbers(certs []*Certificate) []int {
	nums := make([]int, len(certs))
	for i, c := range certs {
		nums[i] = c.ConsortiumNumber
	}
	return nums
}
