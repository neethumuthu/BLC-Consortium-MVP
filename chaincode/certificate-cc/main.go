package main

import (
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// main runs certificate-cc as a chaincode-as-a-service (ccaas) server,
// same deployment model as institution-cc — see docs/BUILD_LOG.md's
// Phase 7 entry for why classic packaging was never a real option on
// this host. CHAINCODE_ID and CHAINCODE_SERVER_ADDRESS are set per-org
// by chaincode.sh; this binary is identical across every org's
// container.
func main() {
	chaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		log.Panicf("error creating certificate-cc chaincode: %v", err)
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
		// for this MVP — same local-dev-scope reasoning as institution-cc,
		// recorded in ARCHITECTURE.md.
		TLSProps: shim.TLSProperties{
			Disabled: true,
		},
	}

	if err := server.Start(); err != nil {
		log.Panicf("error starting certificate-cc chaincode server: %v", err)
	}
}
