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
)

// fakeLedger is the committed world state shared across every simulated
// transaction in a test. Each call to newTx gets its own fakeStub with an
// isolated pending write set — mirroring how independent CastVote calls
// in the real network are independent transactions against one ledger.
//
// versions tracks how many times each key has been committed — the basis
// for this fake's MVCC conflict detection (see fakeStub.commit below).
// Added after certificate-cc's Phase 8 concurrency test proved this
// modeling necessary for CERT_COUNTER; CastVote's own VotesFor/
// VotesAgainst counters on MembershipProposal have the identical
// read-modify-write shape and are subject to the identical contention —
// confirmed live during Phase 9 pre-work (two concurrent CastVote calls
// on the same proposal, one silently lost its commit), see
// docs/BUILD_LOG.md's Phase 9 entry.
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

// fakeStub implements shim.ChaincodeStubInterface by embedding the
// interface (nil) and overriding only the methods institution-cc actually
// calls. Any other method would panic on a nil interface if ever invoked —
// acceptable, since the chaincode never calls them.
//
// Deliberately models three Fabric semantics precisely, not just
// approximately, because tests below depend on all three:
//  1. GetState sees this transaction's own pending writes ("read your own
//     writes"), matching real Fabric.
//  2. GetQueryResult only ever scans committed state, NEVER this
//     transaction's own pending writes — matching real CouchDB rich-query
//     behavior (see approvingVoters' doc comment in governance.go). A
//     fake that didn't enforce this distinction would let a bug where
//     approvingVoters is queried AFTER writing the current vote pass
//     silently.
//  3. MVCC read-write conflicts: GetState records the ledger's current
//     version of each key it reads (readVersions, snapshotted on the
//     FIRST read of that key in this transaction, not every read), and
//     commit() refuses to apply this transaction's pending writes —
//     returning an error instead — if any key it read has since been
//     committed at a different version by another transaction. Mirrors
//     real Fabric: a transaction is simulated against a snapshot, but
//     validated against the ledger's actual state at commit time.
type fakeStub struct {
	shim.ChaincodeStubInterface
	ledger       *fakeLedger
	pending      map[string][]byte
	readVersions map[string]int
	txID         string
	txTimestamp  *timestamp.Timestamp
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

// GetQueryResult implements a minimal subset of CouchDB Mango selectors —
// exactly the shapes governance.go's queries actually produce (field
// equality and "$in"). Deliberately scans only s.ledger.committed.
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
		// Not a JSON object (e.g. the founding list, a JSON array) —
		// never matches a field-based selector, same as real CouchDB
		// would simply not return a non-conforming document.
		return false
	}
	for field, want := range selector {
		docVal, ok := doc[field]
		if !ok {
			return false
		}
		switch w := want.(type) {
		case string:
			if docVal != w {
				return false
			}
		case map[string]interface{}:
			inList, ok := w["$in"].([]interface{})
			if !ok {
				return false
			}
			matched := false
			for _, v := range inList {
				if docVal == v {
					matched = true
					break
				}
			}
			if !matched {
				return false
			}
		default:
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
// interface (nil) and overriding only GetMSPID, which is all this
// chaincode ever calls on it.
type fakeClientIdentity struct {
	cid.ClientIdentity
	mspID string
}

func (f *fakeClientIdentity) GetMSPID() (string, error) {
	return f.mspID, nil
}

// newTx creates a transaction context for one simulated transaction
// against ledger, as the given caller MSP, at the given time. Callers
// must explicitly call commit() on the returned stub if the simulated
// transaction function returns no error — mirroring Fabric's all-or-
// nothing commit semantics (see docs/BUILD_LOG.md's Phase 7 CastVote
// entry): a transaction that returns an error must leave no trace on
// the ledger. commit() itself can also fail (MVCC conflict) even when
// the simulated function returned no error — real Fabric endorses two
// concurrent transactions independently before either commits; the
// conflict only surfaces at commit/validation time. Callers must check
// commit()'s own returned error, not just the simulated function's.
func newTx(ledger *fakeLedger, txID string, callerMSP string, ts time.Time) (contractapi.TransactionContextInterface, *fakeStub) {
	stub := &fakeStub{
		ledger:       ledger,
		pending:      map[string][]byte{},
		readVersions: map[string]int{},
		txID:         txID,
		txTimestamp: &timestamp.Timestamp{
			Seconds: ts.Unix(),
			Nanos:   int32(ts.Nanosecond()),
		},
	}
	ctx := &contractapi.TransactionContext{}
	ctx.SetStub(stub)
	ctx.SetClientIdentity(&fakeClientIdentity{mspID: callerMSP})
	return ctx, stub
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
// commits the transaction's pending writes to the shared ledger, and
// fails the test if that commit itself is rejected (MVCC conflict).
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
