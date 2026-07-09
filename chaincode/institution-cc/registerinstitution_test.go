package main

import (
	"testing"
	"time"
)

// setupFoundingLedger initializes a ledger with BLCFounderMSP and
// InstitutionAMSP as the founding list — the state every other test in
// this file starts from.
func setupFoundingLedger(t *testing.T) *fakeLedger {
	t.Helper()
	ledger := newFakeLedger()
	contract := &SmartContract{}
	ctx, stub := newTx(ledger, "tx0", "BLCFounderMSP", time.Now())
	mustCommit(t, stub, contract.InitLedger(ctx, []string{"BLCFounderMSP", "InstitutionAMSP"}))
	return ledger
}

func TestRegisterInstitution_FoundingOrgSucceeds(t *testing.T) {
	ledger := setupFoundingLedger(t)
	contract := &SmartContract{}

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	institution, err := contract.RegisterInstitution(ctx, "BLC Founder")
	mustCommit(t, stub, err)

	if institution.InstitutionID != "BLCFounderMSP" {
		t.Fatalf("expected institutionId BLCFounderMSP, got %s", institution.InstitutionID)
	}
	if institution.Status != institutionStatusActive {
		t.Fatalf("expected status active, got %s", institution.Status)
	}
	if institution.Type != institutionTypeFounding {
		t.Fatalf("expected type founding, got %s", institution.Type)
	}
}

// TestRegisterInstitution_BothFoundersCanRegisterInEitherOrder is the
// direct regression test for the bug found in the first proposed design
// (see docs/BUILD_LOG.md's Phase 7 entry): a "zero institutions exist
// yet" guard would have blocked the second founder from ever
// registering, since after the first founder registers, the ledger is
// no longer empty. This proves both founders succeed regardless of
// order, because the check is list-membership, not a ledger count.
func TestRegisterInstitution_BothFoundersCanRegisterInEitherOrder(t *testing.T) {
	ledger := setupFoundingLedger(t)
	contract := &SmartContract{}

	ctx1, stub1 := newTx(ledger, "tx1", "InstitutionAMSP", time.Now())
	mustCommit(t, stub1, func() error {
		_, err := contract.RegisterInstitution(ctx1, "Institution A")
		return err
	}())

	ctx2, stub2 := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	mustCommit(t, stub2, func() error {
		_, err := contract.RegisterInstitution(ctx2, "BLC Founder")
		return err
	}())

	if _, ok := ledger.committed[mustInstitutionKey(t, ledger, "InstitutionAMSP")]; !ok {
		t.Fatal("expected InstitutionA to be registered")
	}
	if _, ok := ledger.committed[mustInstitutionKey(t, ledger, "BLCFounderMSP")]; !ok {
		t.Fatal("expected BLCFounder to be registered")
	}
}

func TestRegisterInstitution_NonFoundingOrgRejected(t *testing.T) {
	ledger := setupFoundingLedger(t)
	contract := &SmartContract{}

	ctx, stub := newTx(ledger, "tx1", "InstitutionBMSP", time.Now())
	_, err := contract.RegisterInstitution(ctx, "Institution B")
	mustFail(t, stub, err)
}

func TestRegisterInstitution_DuplicateRegistrationRejected(t *testing.T) {
	ledger := setupFoundingLedger(t)
	contract := &SmartContract{}

	ctx1, stub1 := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	mustCommit(t, stub1, func() error {
		_, err := contract.RegisterInstitution(ctx1, "BLC Founder")
		return err
	}())

	ctx2, stub2 := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	_, err := contract.RegisterInstitution(ctx2, "BLC Founder Again")
	mustFail(t, stub2, err)
}

func TestRegisterInstitution_FailsWithoutInitLedger(t *testing.T) {
	ledger := newFakeLedger() // no InitLedger call
	contract := &SmartContract{}

	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	_, err := contract.RegisterInstitution(ctx, "BLC Founder")
	mustFail(t, stub, err)
}

// mustInstitutionKey is a small test-only helper mirroring the
// production institutionKey composite-key builder, so assertions can
// look up ledger entries directly by institutionID.
func mustInstitutionKey(t *testing.T, ledger *fakeLedger, institutionID string) string {
	t.Helper()
	ctx, _ := newTx(ledger, "lookup", "n/a", time.Now())
	key, err := institutionKey(ctx, institutionID)
	if err != nil {
		t.Fatalf("failed to build institution key: %v", err)
	}
	return key
}
