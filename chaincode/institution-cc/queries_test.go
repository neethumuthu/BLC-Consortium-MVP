package main

import (
	"testing"
	"time"
)

func TestGetInstitution_ReturnsExisting(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	institution, err := contract.GetInstitution(ctx, "BLCFounderMSP")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if institution.InstitutionID != "BLCFounderMSP" {
		t.Fatalf("expected BLCFounderMSP, got %s", institution.InstitutionID)
	}
}

func TestGetInstitution_ErrorsOnMissing(t *testing.T) {
	ledger := newFakeLedger()
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	_, err := contract.GetInstitution(ctx, "NoSuchMSP")
	if err == nil {
		t.Fatal("expected an error for a nonexistent institution, got nil")
	}
}

func TestGetInstitution_CallableByAnyIdentity(t *testing.T) {
	// Per the design doc, query functions have no caller restriction at
	// the chaincode level (the real gate is Fabric channel membership
	// itself, enforced before the proposal ever reaches this code — see
	// the access-control discussion this test intentionally does NOT
	// re-implement). Confirms the chaincode adds no additional check by
	// calling as a caller identity that is not itself an institution.
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "SomeRandomBackendServiceMSP", time.Now())
	institution, err := contract.GetInstitution(ctx, "BLCFounderMSP")
	if err != nil {
		t.Fatalf("expected query to succeed regardless of caller identity, got error: %v", err)
	}
	if institution.InstitutionID != "BLCFounderMSP" {
		t.Fatalf("expected BLCFounderMSP, got %s", institution.InstitutionID)
	}
}

func TestGetAllInstitutions_ReturnsAllRegardlessOfStatus(t *testing.T) {
	ledger := setupActiveFounders(t)
	injectActiveInstitution(t, ledger, "Org3MSP")

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}
	institutions, err := contract.GetAllInstitutions(ctx)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(institutions) != 3 {
		t.Fatalf("expected 3 institutions (BLCFounder, InstitutionA, Org3), got %d", len(institutions))
	}
}

func TestGetAllInstitutions_EmptyLedgerReturnsEmptyNotError(t *testing.T) {
	ledger := newFakeLedger()
	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	contract := &SmartContract{}

	institutions, err := contract.GetAllInstitutions(ctx)
	if err != nil {
		t.Fatalf("expected success on an empty ledger, got error: %v", err)
	}
	if len(institutions) != 0 {
		t.Fatalf("expected 0 institutions, got %d", len(institutions))
	}
}

func TestGetProposal_ReturnsExisting(t *testing.T) {
	ledger := setupActiveFounders(t)
	contract := &SmartContract{}

	proposeCtx, proposeStub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	created, err := contract.ProposeNewMember(proposeCtx, "InstitutionBMSP", "Institution B")
	mustCommit(t, proposeStub, err)

	getCtx, _ := newTx(ledger, "tx2", "n/a", time.Now())
	fetched, err := contract.GetProposal(getCtx, created.ProposalID)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if fetched.ApplicantID != "InstitutionBMSP" {
		t.Fatalf("expected applicantId InstitutionBMSP, got %s", fetched.ApplicantID)
	}
}

func TestGetProposal_ErrorsOnMissing(t *testing.T) {
	ledger := newFakeLedger()
	contract := &SmartContract{}

	ctx, _ := newTx(ledger, "tx1", "n/a", time.Now())
	_, err := contract.GetProposal(ctx, "no-such-proposal")
	if err == nil {
		t.Fatal("expected an error for a nonexistent proposal, got nil")
	}
}
