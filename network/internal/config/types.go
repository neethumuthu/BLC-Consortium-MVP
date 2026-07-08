package config

// NetworkConfig mirrors network/config/network.yaml — the architecture
// half: organizations, channel, governance. Changes when consortium
// membership or governance rules change.
type NetworkConfig struct {
	Channel struct {
		Name string `yaml:"name"`
		// Capabilities are split per Fabric capability group because
		// Fabric's own named capabilities aren't uniform across them:
		// Channel and Orderer top out at V2_0 for the entire 2.x line
		// (no V2_5 exists for those groups), while Application gained
		// a distinct V2_5 flag in Fabric 2.5. Using one shared value
		// for all three (the original design) silently produced an
		// unrecognized capability name for Channel/Orderer — caught in
		// Phase 6 when osnadmin rejected genesis blocks built that way.
		Capabilities struct {
			Channel     string `yaml:"channel"`
			Orderer     string `yaml:"orderer"`
			Application string `yaml:"application"`
		} `yaml:"capabilities"`
	} `yaml:"channel"`

	Orderer struct {
		Type  string `yaml:"type"`
		Count int    `yaml:"count"`
		Name  string `yaml:"name"`
		MSP   string `yaml:"msp"`
	} `yaml:"orderer"`

	Organizations []Organization `yaml:"organizations"`

	Chaincode struct {
		Packaging string `yaml:"packaging"`
	} `yaml:"chaincode"`
}

// Organization is one entry in NetworkConfig.Organizations.
type Organization struct {
	Name   string `yaml:"name"`
	MSP    string `yaml:"msp"`
	Status string `yaml:"status"`
}

// DeploymentConfig mirrors network/deployment/local.yaml — the
// infrastructure half: ports, image versions. Changes when the
// deployment target changes, never when consortium membership changes.
type DeploymentConfig struct {
	FabricVersion        string                   `yaml:"fabric_version"`
	CAVersion            string                   `yaml:"ca_version"`
	CouchDBAdminUser     string                   `yaml:"couchdb_admin_user"`
	CouchDBAdminPassword string                   `yaml:"couchdb_admin_password"`
	Orderer              OrdererDeployment        `yaml:"orderer"`
	Organizations        map[string]OrgDeployment `yaml:"organizations"`
}

// OrdererDeployment is the orderer's infra entry in DeploymentConfig. The
// number of orderer nodes is derived from len(Nodes) — not a separate
// count field — so it can never drift out of sync with the actual port
// list. NetworkConfig.Orderer.Count is the one governance-relevant count
// (consensus size affects the whole consortium's trust model) and is
// validated to match len(Nodes).
type OrdererDeployment struct {
	CAPort int                `yaml:"ca_port"`
	Nodes  []OrdererNodePorts `yaml:"nodes"`
}

// OrdererNodePorts is the port set for one Raft orderer node.
// OperationsPort is not referenced by configtx.yaml — Fabric's channel
// genesis config only cares about GeneralPort (client traffic + Raft
// consensus) and TLS certs. OperationsPort is a per-node runtime
// listener for Prometheus metrics/health checks, consumed directly by
// the orderer process itself (Phase 5/6's docker-compose env vars), not
// by the generator's configtx template.
type OrdererNodePorts struct {
	GeneralPort    int `yaml:"general_port"`
	AdminPort      int `yaml:"admin_port"`
	OperationsPort int `yaml:"operations_port"`
}

// OrgDeployment is the per-org entry in DeploymentConfig.Organizations,
// keyed by organization name. The number of peers is derived from
// len(Peers) — deliberately not a separate count field in network.yaml,
// since peer redundancy is a pure infra/availability concern, not a
// governance one, so it lives only here.
type OrgDeployment struct {
	CAPort int         `yaml:"ca_port"`
	Peers  []PeerPorts `yaml:"peers"`
}

// PeerPorts is the port pair for one peer node within an organization.
type PeerPorts struct {
	PeerPort    int `yaml:"peer_port"`
	CouchDBPort int `yaml:"couchdb_port"`
}

// MergedOrganization is NetworkConfig's Organization joined with its
// matching DeploymentConfig.OrgDeployment by name. This is the shape
// every later template and validation check actually operates on.
type MergedOrganization struct {
	Organization
	OrgDeployment
}
