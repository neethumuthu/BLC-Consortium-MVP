package generate

import (
	"fmt"
	"path/filepath"

	"blc/network/internal/config"
)

// ConnectionProfileData is the shape connection-profile.json.tmpl is
// rendered against — one instance per founding/member organization,
// though every instance shares the same Orderers list (every org's
// clients need to reach the same ordering service).
//
// Host fields here use "localhost" + the host-published port, matching
// the addressing bootstrap-crypto.sh's own fabric-ca-client calls
// already use for host-based tooling (peer CLI, and eventually the
// backend API if it runs on the host rather than inside the "blc"
// Docker network). This is deliberately different from configtx.yaml's
// Host fields (Phase 5's data.go), which use Docker service hostnames
// for inter-container Raft/gossip traffic — two different consumers
// with two different networking contexts, not an inconsistency. If the
// backend ends up running inside the Docker network as a container,
// these connection profiles would need a docker-service-hostname
// variant instead — flagged as a follow-up, not solved now since the
// backend isn't built in this pass.
type ConnectionProfileData struct {
	OrgName  string
	OrgMSP   string
	CAPort   int
	Peers    []ConnectionPeer
	Orderers []ConnectionOrderer
}

// ConnectionPeer describes one peer for a connection profile.
type ConnectionPeer struct {
	Name          string
	Host          string
	Port          int
	TLSCACertPath string
}

// ConnectionOrderer describes one orderer node for a connection profile.
type ConnectionOrderer struct {
	Name          string
	Host          string
	Port          int
	TLSCACertPath string
}

// BuildConnectionProfiles returns one ConnectionProfileData per
// founding/member organization — "pending" organizations have no
// client-facing presence yet, matching the same filter used everywhere
// else in this package.
func BuildConnectionProfiles(net *config.NetworkConfig, dep *config.DeploymentConfig, cryptoDir string) ([]ConnectionProfileData, error) {
	absCryptoDir, err := filepath.Abs(cryptoDir)
	if err != nil {
		return nil, fmt.Errorf("resolving crypto dir %s: %w", cryptoDir, err)
	}

	merged, err := config.Merge(net, dep)
	if err != nil {
		return nil, err
	}

	var orderers []ConnectionOrderer
	for i, node := range dep.Orderer.Nodes {
		nodeName := fmt.Sprintf("orderer%d", i)
		orderers = append(orderers, ConnectionOrderer{
			Name: fmt.Sprintf("%s.%s", nodeName, net.Orderer.Name),
			Host: "localhost",
			Port: node.GeneralPort,
			TLSCACertPath: filepath.Join(absCryptoDir, "organizations", net.Orderer.Name,
				"orderers", nodeName, "tls", "ca.pem"),
		})
	}

	var profiles []ConnectionProfileData
	for _, org := range merged {
		if org.Status != "founding" && org.Status != "member" {
			continue
		}

		profile := ConnectionProfileData{
			OrgName:  org.Name,
			OrgMSP:   org.MSP,
			CAPort:   org.CAPort,
			Orderers: orderers,
		}

		for i, peer := range org.Peers {
			nodeName := fmt.Sprintf("peer%d", i)
			profile.Peers = append(profile.Peers, ConnectionPeer{
				Name: fmt.Sprintf("%s.%s", nodeName, org.Name),
				Host: "localhost",
				Port: peer.PeerPort,
				TLSCACertPath: filepath.Join(absCryptoDir, "organizations", org.Name,
					"peers", nodeName, "tls", "ca.pem"),
			})
		}

		profiles = append(profiles, profile)
	}

	return profiles, nil
}
