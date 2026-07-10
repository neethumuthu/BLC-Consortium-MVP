package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/golang/protobuf/ptypes/timestamp"
	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-protos-go/ledger/queryresult"
	pb "github.com/hyperledger/fabric-protos-go/peer"
)

// fakeLedger is the committed world state shared across every simulated
// transaction in a test. versions tracks how many times each key has
// been committed — the basis for this fake's MVCC conflict detection
// (see fakeStub.commit below), needed for IssueCertificate's
// concurrent-issuance test in a way the read-only query tests never
// needed.
type fakeLedger struct {
	committed map[string][]byte
	versions  map[string]int
}

func newFakeLedger() *fakeLedger {
	return &fakeLedger{committed: map[string][]byte{}, versions: map[string]int{}}
}

func (l *fakeLedger) put(key string, value []byte) {
	l.committed[key] = value
	l.versions[key]++
}

// seedCertificate writes cert directly into the ledger's committed state
// at the same composite key certificateKey would produce, without going
// through a chaincode function — tests set up ledger state this way,
// then call the function under test against it.
func seedCertificate(ledger *fakeLedger, cert *Certificate) {
	key := docTypeCertificate + "\x00" + cert.CertificateID
	bytes, err := json.Marshal(cert)
	if err != nil {
		panic(err)
	}
	ledger.put(key, bytes)
}

// fakeStub implements shim.ChaincodeStubInterface by embedding the
// interface (nil) and overriding only the methods certificate-cc
// actually calls.
//
// Models Fabric's MVCC read-write conflict semantics precisely, not just
// approximately, because the concurrent-issuance test below depends on
// it: GetState records the ledger's current version of each key it
// reads (readVersions), and commit() refuses to apply this
// transaction's pending writes — returning an error instead — if any key
// it read has since been committed at a different version by another
// transaction. This mirrors real Fabric: a transaction is simulated
// against a snapshot, but validated against the ledger's actual state at
// commit time, and a version mismatch on anything in its read set is
// rejected (MVCC_READ_CONFLICT), not silently overwritten.
type fakeStub struct {
	shim.ChaincodeStubInterface
	ledger          *fakeLedger
	pending         map[string][]byte
	readVersions    map[string]int
	txID            string
	txTimestamp     *timestamp.Timestamp
	invokeChaincode func(chaincodeName string, args [][]byte, channel string) pb.Response
}

func (s *fakeStub) GetState(key string) ([]byte, error) {
	if v, ok := s.pending[key]; ok {
		return v, nil
	}
	if _, already := s.readVersions[key]; !already {
		s.readVersions[key] = s.ledger.versions[key]
	}
	return s.ledger.committed[key], nil
}

func (s *fakeStub) PutState(key string, value []byte) error {
	s.pending[key] = value
	return nil
}

func (s *fakeStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	return objectType + "\x00" + strings.Join(attributes, "\x00"), nil
}

func (s *fakeStub) GetTxID() string {
	return s.txID
}

func (s *fakeStub) GetTxTimestamp() (*timestamp.Timestamp, error) {
	return s.txTimestamp, nil
}

func (s *fakeStub) GetChannelID() string {
	return "blcchannel"
}

func (s *fakeStub) InvokeChaincode(chaincodeName string, args [][]byte, channel string) pb.Response {
	if s.invokeChaincode == nil {
		panic("fakeStub.invokeChaincode not configured for this test")
	}
	return s.invokeChaincode(chaincodeName, args, channel)
}

// GetQueryResult implements a minimal subset of CouchDB Mango
// selectors — plain field equality only, the only shape
// GetCertificatesByInstitution's selector actually produces.
func (s *fakeStub) GetQueryResult(query string) (shim.StateQueryIteratorInterface, error) {
	var parsed struct {
		Selector map[string]interface{} `json:"selector"`
	}
	if err := json.Unmarshal([]byte(query), &parsed); err != nil {
		return nil, err
	}

	var results []*queryresult.KV
	for key, value := range s.ledger.committed {
		if matchesSelector(value, parsed.Selector) {
			results = append(results, &queryresult.KV{Key: key, Value: value})
		}
	}
	return &fakeIterator{results: results}, nil
}

func matchesSelector(docBytes []byte, selector map[string]interface{}) bool {
	var doc map[string]interface{}
	if err := json.Unmarshal(docBytes, &doc); err != nil {
		// Not a JSON object — never matches a field-based selector, same
		// as real CouchDB would simply not return a non-conforming
		// document.
		return false
	}
	for field, want := range selector {
		docVal, ok := doc[field]
		if !ok {
			return false
		}
		wantStr, ok := want.(string)
		if !ok || docVal != wantStr {
			return false
		}
	}
	return true
}

type fakeIterator struct {
	results []*queryresult.KV
	index   int
}

func (it *fakeIterator) HasNext() bool {
	return it.index < len(it.results)
}

func (it *fakeIterator) Close() error {
	return nil
}

func (it *fakeIterator) Next() (*queryresult.KV, error) {
	kv := it.results[it.index]
	it.index++
	return kv, nil
}

// fakeClientIdentity implements cid.ClientIdentity by embedding the
// interface (nil) and overriding only GetMSPID, which is all
// certificate-cc ever calls on it.
type fakeClientIdentity struct {
	cid.ClientIdentity
	mspID string
}

func (f *fakeClientIdentity) GetMSPID() (string, error) {
	return f.mspID, nil
}

// newQueryCtx creates a transaction context for a read-only call against
// ledger — no caller identity is set, since none of GetCertificate/
// GetCertificatesByInstitution/VerifyCertificate check one.
func newQueryCtx(ledger *fakeLedger) contractapi.TransactionContextInterface {
	stub := &fakeStub{ledger: ledger, pending: map[string][]byte{}, readVersions: map[string]int{}}
	ctx := &contractapi.TransactionContext{}
	ctx.SetStub(stub)
	return ctx
}

// newTx creates a transaction context for one simulated transaction
// against ledger, as the given caller MSP, at the given time, with
// invokeChaincode controlling what InvokeChaincode("institution-cc", ...)
// returns. Callers must explicitly call commit() and check its returned
// error — mirroring Fabric's real validate-then-commit semantics, not
// just "apply and hope."
func newTx(ledger *fakeLedger, txID string, callerMSP string, ts time.Time, invokeChaincode func(string, [][]byte, string) pb.Response) (contractapi.TransactionContextInterface, *fakeStub) {
	stub := &fakeStub{
		ledger:       ledger,
		pending:      map[string][]byte{},
		readVersions: map[string]int{},
		txID:         txID,
		txTimestamp: &timestamp.Timestamp{
			Seconds: ts.Unix(),
			Nanos:   int32(ts.Nanosecond()),
		},
		invokeChaincode: invokeChaincode,
	}
	ctx := &contractapi.TransactionContext{}
	ctx.SetStub(stub)
	ctx.SetClientIdentity(&fakeClientIdentity{mspID: callerMSP})
	return ctx, stub
}

// activeInstitutionResponse builds the pb.Response InvokeChaincode would
// return for a GetInstitution call against an active institution —
// matching institution-cc's own contractapi-serialized JSON shape.
func activeInstitutionResponse(mspID string) pb.Response {
	payload, _ := json.Marshal(remoteInstitution{InstitutionID: mspID, Status: remoteInstitutionStatusActive})
	return pb.Response{Status: shim.OK, Payload: payload}
}

// notAnInstitutionResponse builds the pb.Response InvokeChaincode would
// return for a GetInstitution call against an MSP with no Institution
// asset — matching contractapi's shim.Error wrapping of GetInstitution's
// "does not exist" Go error.
func notAnInstitutionResponse(mspID string) pb.Response {
	return pb.Response{Status: shim.ERROR, Message: fmt.Sprintf("institution %s does not exist", mspID)}
}

// commit applies this transaction's pending writes to the shared ledger,
// but only after checking every key this transaction read is still at
// the version it was when read — otherwise returns an MVCC-conflict-
// shaped error and applies nothing, matching real Fabric commit-phase
// validation.
func (s *fakeStub) commit() error {
	for key, seenVersion := range s.readVersions {
		if s.ledger.versions[key] != seenVersion {
			return fmt.Errorf("MVCC_READ_CONFLICT: key %q was modified by another transaction after this transaction read it", key)
		}
	}
	for k, v := range s.pending {
		s.ledger.put(k, v)
	}
	return nil
}

// mustCommit fails the test immediately if err is non-nil; otherwise
// commits the transaction's pending writes to the shared ledger and
// fails the test if that commit itself is rejected.
func mustCommit(t *testing.T, stub *fakeStub, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if commitErr := stub.commit(); commitErr != nil {
		t.Fatalf("expected commit to succeed, got: %v", commitErr)
	}
}

// mustFail fails the test if err is nil, and confirms nothing from this
// transaction was committed — the direct, ledger-level check that a
// failed invocation really does leave no trace, not just an assumption.
func mustFail(t *testing.T, stub *fakeStub, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if len(stub.pending) > 0 {
		t.Fatalf("expected no pending writes on a failed transaction, got %d", len(stub.pending))
	}
}
