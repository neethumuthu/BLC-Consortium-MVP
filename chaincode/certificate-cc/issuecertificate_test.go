package main

import (
	"testing"
	"time"

	pb "github.com/hyperledger/fabric-protos-go/peer"
)

func TestIssueCertificate_Success(t *testing.T) {
	ledger := newFakeLedger()
	ctx, stub := newTx(ledger, "tx1", "BLCFounderMSP", time.Unix(1700000000, 0), func(name string, args [][]byte, channel string) pb.Response {
		return activeInstitutionResponse("BLCFounderMSP")
	})
	sc := &SmartContract{}

	cert, err := sc.IssueCertificate(ctx, "Alice", "Bachelor of Science", nil)
	mustCommit(t, stub, err)

	if cert.CertificateID != "tx1" {
		t.Fatalf("expected certificateId to be the txID, got %s", cert.CertificateID)
	}
	if cert.ConsortiumNumber != 1 {
		t.Fatalf("expected consortiumNumber 1, got %d", cert.ConsortiumNumber)
	}
	if cert.IssuerSequenceNumber != 1 {
		t.Fatalf("expected issuerSequenceNumber 1, got %d", cert.IssuerSequenceNumber)
	}
	if cert.IssuerID != "BLCFounderMSP" {
		t.Fatalf("expected issuerId to be the caller's MSP, got %s", cert.IssuerID)
	}
	if cert.Status != certificateStatusActive {
		t.Fatalf("expected status active, got %s", cert.Status)
	}
	wantHash, _ := computeCertificateHash("Alice", "Bachelor of Science", nil)
	if cert.CertificateHash != wantHash {
		t.Fatalf("stored hash does not match computeCertificateHash's output")
	}

	// Confirm it's actually readable back through GetCertificate, not
	// just returned by IssueCertificate itself.
	queryCtx := newQueryCtx(ledger)
	got, err := sc.GetCertificate(queryCtx, "tx1")
	if err != nil {
		t.Fatalf("expected the committed certificate to be readable, got error: %v", err)
	}
	if got.HolderName != "Alice" {
		t.Fatalf("unexpected certificate read back: %+v", got)
	}
}

func TestIssueCertificate_SecondCertificateFromDifferentIssuer(t *testing.T) {
	ledger := newFakeLedger()
	sc := &SmartContract{}
	respondActive := func(mspID string) func(string, [][]byte, string) pb.Response {
		return func(name string, args [][]byte, channel string) pb.Response {
			return activeInstitutionResponse(mspID)
		}
	}

	ctx1, stub1 := newTx(ledger, "tx1", "BLCFounderMSP", time.Unix(1700000000, 0), respondActive("BLCFounderMSP"))
	cert1, err := sc.IssueCertificate(ctx1, "Alice", "Bachelor of Science", nil)
	mustCommit(t, stub1, err)
	if cert1.ConsortiumNumber != 1 || cert1.IssuerSequenceNumber != 1 {
		t.Fatalf("expected first certificate to be consortiumNumber=1, issuerSequenceNumber=1, got %d/%d",
			cert1.ConsortiumNumber, cert1.IssuerSequenceNumber)
	}

	// A separate, later, non-concurrent transaction from a DIFFERENT org.
	// The global counter keeps advancing (2), but the issuer counter is
	// scoped per-issuer, so InstitutionA's own first certificate is still
	// issuerSequenceNumber 1, not 2 — the two counters are independent.
	ctx2, stub2 := newTx(ledger, "tx2", "InstitutionAMSP", time.Unix(1700000100, 0), respondActive("InstitutionAMSP"))
	cert2, err := sc.IssueCertificate(ctx2, "Bob", "Master of Arts", nil)
	mustCommit(t, stub2, err)
	if cert2.ConsortiumNumber != 2 {
		t.Fatalf("expected second certificate's consortiumNumber to be 2, got %d", cert2.ConsortiumNumber)
	}
	if cert2.IssuerSequenceNumber != 1 {
		t.Fatalf("expected InstitutionA's own first certificate to have issuerSequenceNumber 1, got %d", cert2.IssuerSequenceNumber)
	}
}

func TestIssueCertificate_SecondCertificateFromSameIssuer(t *testing.T) {
	ledger := newFakeLedger()
	sc := &SmartContract{}
	respondActive := func(string, [][]byte, string) pb.Response {
		return activeInstitutionResponse("BLCFounderMSP")
	}

	ctx1, stub1 := newTx(ledger, "tx1", "BLCFounderMSP", time.Unix(1700000000, 0), respondActive)
	cert1, err := sc.IssueCertificate(ctx1, "Alice", "Bachelor of Science", nil)
	mustCommit(t, stub1, err)

	// Same issuer, second certificate: both counters advance together
	// this time, since the same institution is the only issuer so far.
	ctx2, stub2 := newTx(ledger, "tx2", "BLCFounderMSP", time.Unix(1700000100, 0), respondActive)
	cert2, err := sc.IssueCertificate(ctx2, "Carol", "Master of Arts", nil)
	mustCommit(t, stub2, err)

	if cert1.IssuerSequenceNumber != 1 || cert2.IssuerSequenceNumber != 2 {
		t.Fatalf("expected issuerSequenceNumbers 1 then 2 for the same issuer, got %d then %d",
			cert1.IssuerSequenceNumber, cert2.IssuerSequenceNumber)
	}
	if cert1.ConsortiumNumber != 1 || cert2.ConsortiumNumber != 2 {
		t.Fatalf("expected consortiumNumbers 1 then 2, got %d then %d", cert1.ConsortiumNumber, cert2.ConsortiumNumber)
	}
}

func TestIssueCertificate_CallerNotAnInstitution(t *testing.T) {
	ledger := newFakeLedger()
	ctx, stub := newTx(ledger, "tx1", "InstitutionBMSP", time.Unix(1700000000, 0), func(name string, args [][]byte, channel string) pb.Response {
		return notAnInstitutionResponse("InstitutionBMSP")
	})
	sc := &SmartContract{}

	_, err := sc.IssueCertificate(ctx, "Alice", "Bachelor of Science", nil)
	mustFail(t, stub, err)
}

func TestIssueCertificate_CallerInstitutionNotActive(t *testing.T) {
	// Defense-in-depth: institution-cc's own code never actually sets a
	// non-"active" status on an Institution today (same shape as
	// institution-cc's own applicant-cannot-vote-on-its-own-proposal
	// test), but requireActiveInstitution must still reject this
	// response shape rather than assume "response came back Status 200
	// therefore active."
	ledger := newFakeLedger()
	ctx, stub := newTx(ledger, "tx1", "InstitutionCMSP", time.Unix(1700000000, 0), func(name string, args [][]byte, channel string) pb.Response {
		payload := []byte(`{"institutionId":"InstitutionCMSP","status":"suspended"}`)
		return pb.Response{Status: 200, Payload: payload}
	})
	sc := &SmartContract{}

	_, err := sc.IssueCertificate(ctx, "Alice", "Bachelor of Science", nil)
	mustFail(t, stub, err)
}

// TestIssueCertificate_ConcurrentIssuance_OneWinsOneConflicts simulates
// two institutions independently issuing a certificate against the same
// starting ledger state — both simulate and endorse successfully (the
// conflict is invisible during simulation, exactly as in real Fabric),
// but only one may actually commit, since both write CERT_COUNTER.
func TestIssueCertificate_ConcurrentIssuance_OneWinsOneConflicts(t *testing.T) {
	ledger := newFakeLedger()
	sc := &SmartContract{}

	ctxA, stubA := newTx(ledger, "txA", "BLCFounderMSP", time.Unix(1700000000, 0), func(name string, args [][]byte, channel string) pb.Response {
		return activeInstitutionResponse("BLCFounderMSP")
	})
	ctxB, stubB := newTx(ledger, "txB", "InstitutionAMSP", time.Unix(1700000000, 0), func(name string, args [][]byte, channel string) pb.Response {
		return activeInstitutionResponse("InstitutionAMSP")
	})

	certA, errA := sc.IssueCertificate(ctxA, "Alice", "Bachelor of Science", nil)
	if errA != nil {
		t.Fatalf("expected A's simulation to succeed, got error: %v", errA)
	}
	certB, errB := sc.IssueCertificate(ctxB, "Bob", "Master of Arts", nil)
	if errB != nil {
		t.Fatalf("expected B's simulation to succeed, got error: %v", errB)
	}

	// Both read CERT_COUNTER as absent and independently computed the
	// same next number — the conflict has not been detected yet, exactly
	// as real Fabric wouldn't detect it during simulation either.
	if certA.ConsortiumNumber != 1 || certB.ConsortiumNumber != 1 {
		t.Fatalf("expected both transactions to have computed consortiumNumber 1 independently, got A=%d B=%d",
			certA.ConsortiumNumber, certB.ConsortiumNumber)
	}

	// A commits first and must succeed cleanly.
	if err := stubA.commit(); err != nil {
		t.Fatalf("expected A's commit to succeed, got error: %v", err)
	}

	// B commits second and must be rejected with a conflict, not crash
	// and not silently succeed.
	errCommitB := stubB.commit()
	if errCommitB == nil {
		t.Fatal("expected B's commit to fail with an MVCC-style conflict, got nil")
	}

	// The counter itself reflects only A's increment.
	if got := string(ledger.committed[certCounterKey]); got != "1" {
		t.Fatalf("expected CERT_COUNTER to be \"1\" (only A's write applied), got %q", got)
	}

	// The stronger claim, not just "the counter is right": B's entire
	// transaction — including its own Certificate asset — must be
	// absent from committed state, not merely absent under the counter
	// key. Same standard as mustFail's len(stub.pending) > 0 check for
	// institution-cc: nothing survives a failed/rejected transaction.
	//
	// Checking key PRESENCE rather than comparing values against
	// stubB.pending: A and B both computed the same consortiumNumber (1)
	// from the same starting state, so A's legitimately-committed
	// CERT_COUNTER value ("1") is byte-identical to what B's rejected
	// write would have been. A value-equality diff against B's pending
	// map can't distinguish "A's write" from "B's write" when they
	// coincide — only checking exactly which KEYS exist proves
	// attribution. certAKey and certBKey are unique per txID, so they
	// can't coincide the way CERT_COUNTER's value did.
	certAKey := docTypeCertificate + "\x00" + certA.CertificateID
	certBKey := docTypeCertificate + "\x00" + certB.CertificateID
	if _, exists := ledger.committed[certBKey]; exists {
		t.Fatalf("expected B's certificate (%s) to never have committed, but it's present in ledger state", certB.CertificateID)
	}
	if _, exists := ledger.committed[certAKey]; !exists {
		t.Fatalf("expected A's certificate (%s) to be committed", certA.CertificateID)
	}
	issuerAKey := docTypeIssuerCounter + "\x00" + "BLCFounderMSP"
	issuerBKey := docTypeIssuerCounter + "\x00" + "InstitutionAMSP"
	wantKeys := map[string]bool{certCounterKey: true, certAKey: true, issuerAKey: true}
	if len(ledger.committed) != len(wantKeys) {
		t.Fatalf("expected committed state to contain exactly %v, got keys %v", keysOf(wantKeys), keysOf(ledger.committed))
	}
	for key := range ledger.committed {
		if !wantKeys[key] {
			t.Fatalf("unexpected key committed from B's rejected transaction: %q", key)
		}
	}
	// B's own issuer counter (a different key from A's, since they're
	// different institutions) must also be untouched — not because it
	// conflicted, but because B's whole transaction never committed.
	if _, exists := ledger.committed[issuerBKey]; exists {
		t.Fatalf("expected InstitutionA's issuer counter to be absent (B's transaction never committed), found one")
	}
}

// TestIssueCertificate_ConcurrentIssuance_SameIssuer_OneWinsOneConflicts
// is the counterpart to the cross-issuer concurrency test above: two
// certificates from the SAME institution, issued concurrently. Unlike
// certCounterKey (always contended, by design), issuerCounterKey is
// scoped per issuer — so this specific conflict could only ever happen
// between two transactions from the same institution, never across
// institutions, and is worth its own test rather than assuming the
// cross-issuer test already covers it.
func TestIssueCertificate_ConcurrentIssuance_SameIssuer_OneWinsOneConflicts(t *testing.T) {
	ledger := newFakeLedger()
	sc := &SmartContract{}
	respondActive := func(string, [][]byte, string) pb.Response {
		return activeInstitutionResponse("BLCFounderMSP")
	}

	ctxA, stubA := newTx(ledger, "txA", "BLCFounderMSP", time.Unix(1700000000, 0), respondActive)
	ctxB, stubB := newTx(ledger, "txB", "BLCFounderMSP", time.Unix(1700000000, 0), respondActive)

	certA, errA := sc.IssueCertificate(ctxA, "Alice", "Bachelor of Science", nil)
	if errA != nil {
		t.Fatalf("expected A's simulation to succeed, got error: %v", errA)
	}
	certB, errB := sc.IssueCertificate(ctxB, "Bob", "Master of Arts", nil)
	if errB != nil {
		t.Fatalf("expected B's simulation to succeed, got error: %v", errB)
	}
	if certA.IssuerSequenceNumber != 1 || certB.IssuerSequenceNumber != 1 {
		t.Fatalf("expected both transactions to have computed issuerSequenceNumber 1 independently, got A=%d B=%d",
			certA.IssuerSequenceNumber, certB.IssuerSequenceNumber)
	}

	if err := stubA.commit(); err != nil {
		t.Fatalf("expected A's commit to succeed, got error: %v", err)
	}
	if err := stubB.commit(); err == nil {
		t.Fatal("expected B's commit to fail with an MVCC-style conflict on the shared issuer counter, got nil")
	}

	certBKey := docTypeCertificate + "\x00" + certB.CertificateID
	if _, exists := ledger.committed[certBKey]; exists {
		t.Fatalf("expected B's certificate (%s) to never have committed", certB.CertificateID)
	}
	issuerKey := docTypeIssuerCounter + "\x00" + "BLCFounderMSP"
	if got := string(ledger.committed[issuerKey]); got != "1" {
		t.Fatalf("expected the shared issuer counter to be \"1\" (only A's write applied), got %q", got)
	}
}

func keysOf[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
