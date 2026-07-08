package generate

import (
	"fmt"
	"path/filepath"

	"blc/network/internal/config"
)

// TemplateData is the shape configtx.yaml.tmpl is rendered against.
// Capabilities are split per Fabric capability group — see the comment
// on NetworkConfig.Channel.Capabilities for why Channel/Orderer and
// Application can't share one value.
type TemplateData struct {
	ChannelName           string
	ChannelCapability     string
	OrdererCapability     string
	ApplicationCapability string
	Orderer               OrdererTemplateData
	ActiveOrgs            []OrgTemplateData
}

// OrdererTemplateData describes the ordering service for the template.
// Consenters has one entry per Raft node — production topology runs 3,
// tolerating 1 node failure while keeping quorum.
type OrdererTemplateData struct {
	Name       string
	MSP        string
	MSPDir     string
	Consenters []OrdererConsenter
}

// OrdererConsenter describes one Raft orderer node.
type OrdererConsenter struct {
	Host        string
	GeneralPort int
	TLSCertPath string
}

// OrgTemplateData describes one peer organization for the template.
// Peers has one entry per peer node — production topology runs 2 per
// org, so one peer can restart/upgrade without taking the org offline.
type OrgTemplateData struct {
	Name   string
	MSP    string
	MSPDir string
	Peers  []OrgPeer
}

// OrgPeer describes one peer node within an organization, used for
// AnchorPeers entries.
type OrgPeer struct {
	Host string
	Port int
}

// BuildTemplateData turns validated config into the shape configtx.yaml.tmpl
// expects, resolving crypto material paths to absolute paths under
// cryptoDir. Only organizations with status "founding" or "member" are
// included — "pending" organizations join later via org-add.sh and must
// never appear in a genesis configuration.
func BuildTemplateData(net *config.NetworkConfig, dep *config.DeploymentConfig, cryptoDir string) (*TemplateData, error) {
	absCryptoDir, err := filepath.Abs(cryptoDir)
	if err != nil {
		return nil, fmt.Errorf("resolving crypto dir %s: %w", cryptoDir, err)
	}

	merged, err := config.Merge(net, dep)
	if err != nil {
		return nil, err
	}

	ordererDir := filepath.Join(absCryptoDir, "organizations", net.Orderer.Name)

	data := &TemplateData{
		ChannelName:           net.Channel.Name,
		ChannelCapability:     net.Channel.Capabilities.Channel,
		OrdererCapability:     net.Channel.Capabilities.Orderer,
		ApplicationCapability: net.Channel.Capabilities.Application,
		Orderer: OrdererTemplateData{
			Name:   net.Orderer.Name,
			MSP:    net.Orderer.MSP,
			MSPDir: filepath.Join(ordererDir, "msp"),
		},
	}

	for i, node := range dep.Orderer.Nodes {
		nodeName := fmt.Sprintf("orderer%d", i)
		data.Orderer.Consenters = append(data.Orderer.Consenters, OrdererConsenter{
			Host:        fmt.Sprintf("%s.%s", nodeName, net.Orderer.Name),
			GeneralPort: node.GeneralPort,
			TLSCertPath: filepath.Join(ordererDir, "orderers", nodeName, "tls", "signcerts", "cert.pem"),
		})
	}

	for _, org := range merged {
		if org.Status != "founding" && org.Status != "member" {
			continue
		}

		orgData := OrgTemplateData{
			Name:   org.Name,
			MSP:    org.MSP,
			MSPDir: filepath.Join(absCryptoDir, "organizations", org.Name, "msp"),
		}

		for i, peer := range org.Peers {
			nodeName := fmt.Sprintf("peer%d", i)
			orgData.Peers = append(orgData.Peers, OrgPeer{
				Host: fmt.Sprintf("%s.%s", nodeName, org.Name),
				Port: peer.PeerPort,
			})
		}

		data.ActiveOrgs = append(data.ActiveOrgs, orgData)
	}

	return data, nil
}
