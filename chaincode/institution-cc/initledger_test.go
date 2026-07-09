package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestInitLedger_Success(t *testing.T) {
	ledger := newFakeLedger()
	contract := &SmartContract{}
	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())

	mustCommit(t, stub, contract.InitLedger(ctx, []string{"BLCFounderMSP", "InstitutionAMSP"}))

	raw, ok := ledger.committed[foundingListKey]
	if !ok {
		t.Fatal("expected founding list to be written to the ledger")
	}
	var founders []string
	if err := json.Unmarshal(raw, &founders); err != nil {
		t.Fatalf("failed to unmarshal founding list: %v", err)
	}
	if len(founders) != 2 || founders[0] != "BLCFounderMSP" || founders[1] != "InstitutionAMSP" {
		t.Fatalf("unexpected founding list contents: %v", founders)
	}
}

func TestInitLedger_RejectsEmptyList(t *testing.T) {
	ledger := newFakeLedger()
	contract := &SmartContract{}
	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())

	err := contract.InitLedger(ctx, []string{})
	mustFail(t, stub, err)

	if _, exists := ledger.committed[foundingListKey]; exists {
		t.Fatal("expected no founding list to be written when InitLedger is called with an empty list")
	}
}

// TestInitLedger_SecondCallRejectedByApplicationCheck is the specific
// regression test agreed when this design was reviewed: it proves
// InitLedger refuses a second call via its OWN existence check on
// foundingListKey, not via Fabric's --init-required/--isInit lifecycle
// gate. The fake stub in mocks_test.go does not implement that gate at
// all — there is no "has Init already run for this version" tracking
// anywhere in the fake — so this test can only pass because of
// InitLedger's own code, exactly the property we wanted verified
// independent of Fabric's mechanism.
func TestInitLedger_SecondCallRejectedByApplicationCheck(t *testing.T) {
	ledger := newFakeLedger()
	contract := &SmartContract{}

	ctx1, stub1 := newTx(ledger, "tx1", "BLCFounderMSP", time.Now())
	mustCommit(t, stub1, contract.InitLedger(ctx1, []string{"BLCFounderMSP", "InstitutionAMSP"}))

	// Second call, identical args — simulating a naive re-invocation.
	ctx2, stub2 := newTx(ledger, "tx2", "BLCFounderMSP", time.Now())
	mustFail(t, stub2, contract.InitLedger(ctx2, []string{"BLCFounderMSP", "InstitutionAMSP"}))

	// A DIFFERENT founding list on the second call must be equally
	// rejected — the list can't be silently redefined either, which is
	// the actual property that matters (see docs/BUILD_LOG.md's Phase 7
	// entry on why Fabric's own Init gate can't be relied on for this).
	ctx3, stub3 := newTx(ledger, "tx3", "BLCFounderMSP", time.Now())
	mustFail(t, stub3, contract.InitLedger(ctx3, []string{"SomeOtherMSP"}))

	raw := ledger.committed[foundingListKey]
	var founders []string
	if err := json.Unmarshal(raw, &founders); err != nil {
		t.Fatalf("failed to unmarshal founding list: %v", err)
	}
	if len(founders) != 2 || founders[0] != "BLCFounderMSP" || founders[1] != "InstitutionAMSP" {
		t.Fatalf("founding list was modified by a rejected re-init call: %v", founders)
	}
}
