package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// LoadNetworkConfig reads and parses network/config/network.yaml.
func LoadNetworkConfig(path string) (*NetworkConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading network config %s: %w", path, err)
	}

	var cfg NetworkConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing network config %s: %w", path, err)
	}

	return &cfg, nil
}

// LoadDeploymentConfig reads and parses network/deployment/local.yaml.
func LoadDeploymentConfig(path string) (*DeploymentConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading deployment config %s: %w", path, err)
	}

	var cfg DeploymentConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing deployment config %s: %w", path, err)
	}

	return &cfg, nil
}

// Merge joins NetworkConfig's organizations with DeploymentConfig's
// per-org infra settings, matched by organization name. It returns an
// error if any organization in net is missing a deployment entry.
func Merge(net *NetworkConfig, dep *DeploymentConfig) ([]MergedOrganization, error) {
	merged := make([]MergedOrganization, 0, len(net.Organizations))

	for _, org := range net.Organizations {
		depOrg, ok := dep.Organizations[org.Name]
		if !ok {
			return nil, fmt.Errorf("organization %q is in network.yaml but has no matching entry in deployment config", org.Name)
		}

		merged = append(merged, MergedOrganization{
			Organization:  org,
			OrgDeployment: depOrg,
		})
	}

	return merged, nil
}
