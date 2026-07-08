package generate

import (
	"fmt"
	"os"
	"strings"

	"blc/network/internal/config"
)

// ComposeData is the shape docker-compose-ca.yaml.tmpl and
// docker-compose-net.yaml.tmpl are rendered against. Unlike
// TemplateData (configtx.yaml's data), this needs image versions, CA
// ports, and per-node names — none of which configtx.yaml cares about.
type ComposeData struct {
	FabricVersion        string
	CAVersion            string
	CouchDBAdminUser     string
	CouchDBAdminPassword string
	OrdererBaseYAML      string
	PeerBaseYAML         string
	Orderer              ComposeOrderer
	ActiveOrgs           []ComposeOrg
}

// ComposeOrderer describes the orderer org for compose generation.
type ComposeOrderer struct {
	Name   string
	MSP    string
	CAPort int
	Nodes  []ComposeOrdererNode
}

// ComposeOrdererNode describes one Raft orderer node's container identity.
type ComposeOrdererNode struct {
	Name           string // e.g. "orderer0"
	GeneralPort    int
	AdminPort      int
	OperationsPort int
}

// ComposeOrg describes one peer organization for compose generation.
type ComposeOrg struct {
	Name   string
	MSP    string
	CAPort int
	Peers  []ComposeOrgPeer
}

// ComposeOrgPeer describes one peer node's container identity.
type ComposeOrgPeer struct {
	Name            string // e.g. "peer0"
	PeerPort        int
	CouchDBPort     int
	GossipBootstrap string // comma-separated addresses of every other peer in this org
}

// BuildComposeData turns validated config into the shape the compose
// templates expect. Like BuildTemplateData, only "founding"/"member"
// organizations are included — a "pending" org's containers are started
// later by org-add.sh's own compose fragment, never by this one.
//
// baseDir is the directory containing the hand-written peer-base.yaml/
// orderer-base.yaml fragments (network/../docker/) — their raw content
// is embedded verbatim so the anchors they define resolve in the same
// YAML document as the generated per-node service blocks that merge
// them in via `<<: *peer-base` / `<<: *orderer-base`.
func BuildComposeData(net *config.NetworkConfig, dep *config.DeploymentConfig, baseDir string) (*ComposeData, error) {
	merged, err := config.Merge(net, dep)
	if err != nil {
		return nil, err
	}

	peerBase, err := os.ReadFile(baseDir + "/peer-base.yaml")
	if err != nil {
		return nil, fmt.Errorf("reading peer-base.yaml: %w", err)
	}

	ordererBase, err := os.ReadFile(baseDir + "/orderer-base.yaml")
	if err != nil {
		return nil, fmt.Errorf("reading orderer-base.yaml: %w", err)
	}

	data := &ComposeData{
		FabricVersion:        dep.FabricVersion,
		CAVersion:            dep.CAVersion,
		CouchDBAdminUser:     dep.CouchDBAdminUser,
		CouchDBAdminPassword: dep.CouchDBAdminPassword,
		OrdererBaseYAML:      string(ordererBase),
		PeerBaseYAML:         string(peerBase),
		Orderer: ComposeOrderer{
			Name:   net.Orderer.Name,
			MSP:    net.Orderer.MSP,
			CAPort: dep.Orderer.CAPort,
		},
	}

	for i, node := range dep.Orderer.Nodes {
		data.Orderer.Nodes = append(data.Orderer.Nodes, ComposeOrdererNode{
			Name:           fmt.Sprintf("orderer%d", i),
			GeneralPort:    node.GeneralPort,
			AdminPort:      node.AdminPort,
			OperationsPort: node.OperationsPort,
		})
	}

	for _, org := range merged {
		if org.Status != "founding" && org.Status != "member" {
			continue
		}

		orgData := ComposeOrg{
			Name:   org.Name,
			MSP:    org.MSP,
			CAPort: org.CAPort,
		}

		// Every peer needs at least one other peer in its own org to
		// bootstrap gossip discovery from — with only 1 peer per org
		// (the original MVP shape) this never mattered, but with 2+
		// peers per org each one must be told about its org-mates or
		// it starts up isolated from its own org's gossip network.
		addresses := make([]string, len(org.Peers))
		for i, peer := range org.Peers {
			addresses[i] = fmt.Sprintf("peer%d.%s:%d", i, org.Name, peer.PeerPort)
		}

		for i, peer := range org.Peers {
			var bootstrap []string
			for j, addr := range addresses {
				if j != i {
					bootstrap = append(bootstrap, addr)
				}
			}

			orgData.Peers = append(orgData.Peers, ComposeOrgPeer{
				Name:            fmt.Sprintf("peer%d", i),
				PeerPort:        peer.PeerPort,
				CouchDBPort:     peer.CouchDBPort,
				GossipBootstrap: strings.Join(bootstrap, ","),
			})
		}

		data.ActiveOrgs = append(data.ActiveOrgs, orgData)
	}

	return data, nil
}
