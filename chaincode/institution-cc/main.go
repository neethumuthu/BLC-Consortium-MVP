package main

import (
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// main runs institution-cc as a chaincode-as-a-service (ccaas) server,
// not as a process the peer builds and launches itself. See
// docs/BUILD_LOG.md's Phase 7 entry: Fabric 2.5.0's bundled Docker client
// (used by the peer's classic "golang" builder) is incompatible with
// this host's Docker Engine version, forcing this migration earlier
// than ARCHITECTURE.md originally planned. CHAINCODE_ID and
// CHAINCODE_SERVER_ADDRESS are set per-org by docker-compose-net.yaml —
// this binary is identical across every org's container; only those two
// env vars differ.
func main() {
	chaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		log.Panicf("error creating institution-cc chaincode: %v", err)
	}

	ccid := os.Getenv("CHAINCODE_ID")
	address := os.Getenv("CHAINCODE_SERVER_ADDRESS")
	if ccid == "" || address == "" {
		log.Panicf("CHAINCODE_ID and CHAINCODE_SERVER_ADDRESS must both be set")
	}

	server := &shim.ChaincodeServer{
		CCID:    ccid,
		Address: address,
		CC:      chaincode,
		// TLS on the peer<->chaincode-server hop is deliberately disabled
		// for this MVP — same local-dev-scope reasoning as the CouchDB
		// credentials, both recorded together in ARCHITECTURE.md.
		TLSProps: shim.TLSProperties{
			Disabled: true,
		},
	}

	if err := server.Start(); err != nil {
		log.Panicf("error starting institution-cc chaincode server: %v", err)
	}
}
