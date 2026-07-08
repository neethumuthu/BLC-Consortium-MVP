package config

import (
	"errors"
	"fmt"
	"strings"
)

// Validate checks a NetworkConfig against its matching DeploymentConfig
// and returns every problem found, joined into one error via errors.Join.
// It returns nil if the configuration is valid. Every individual check
// keeps running even after an earlier one fails, so a single validate
// call reports all problems at once instead of one-at-a-time.
func Validate(net *NetworkConfig, dep *DeploymentConfig) error {
	var errs []error

	if strings.TrimSpace(net.Channel.Name) == "" {
		errs = append(errs, fmt.Errorf("channel.name must not be empty"))
	}

	if strings.TrimSpace(net.Channel.Capabilities.Channel) == "" {
		errs = append(errs, fmt.Errorf("channel.capabilities.channel must not be empty"))
	}
	if strings.TrimSpace(net.Channel.Capabilities.Orderer) == "" {
		errs = append(errs, fmt.Errorf("channel.capabilities.orderer must not be empty"))
	}
	if strings.TrimSpace(net.Channel.Capabilities.Application) == "" {
		errs = append(errs, fmt.Errorf("channel.capabilities.application must not be empty"))
	}

	if net.Orderer.Count < 1 {
		errs = append(errs, fmt.Errorf("orderer.count must be at least 1, got %d", net.Orderer.Count))
	} else if net.Orderer.Count > 1 && net.Orderer.Count%2 == 0 {
		errs = append(errs, fmt.Errorf("orderer.count is %d: a Raft cluster with more than 1 node must have an odd count for fault tolerance", net.Orderer.Count))
	}

	if net.Orderer.Count != len(dep.Orderer.Nodes) {
		errs = append(errs, fmt.Errorf("orderer.count is %d in network.yaml but deployment config has %d orderer node port entries — these must match", net.Orderer.Count, len(dep.Orderer.Nodes)))
	}

	if strings.TrimSpace(net.Orderer.Name) == "" {
		errs = append(errs, fmt.Errorf("orderer.name must not be empty"))
	}
	if strings.TrimSpace(net.Orderer.MSP) == "" {
		errs = append(errs, fmt.Errorf("orderer.msp must not be empty"))
	}

	seenNames := make(map[string]bool)
	seenMSPs := make(map[string]string) // MSP ID -> org name that first used it
	validStatuses := map[string]bool{"founding": true, "pending": true, "member": true}

	if net.Orderer.MSP != "" {
		seenMSPs[net.Orderer.MSP] = net.Orderer.Name
	}

	for _, org := range net.Organizations {

		if seenNames[org.Name] {
			errs = append(errs, fmt.Errorf("duplicate organization name %q", org.Name))
		}
		seenNames[org.Name] = true

		if existing, ok := seenMSPs[org.MSP]; ok {
			errs = append(errs, fmt.Errorf("duplicate MSP ID %q: used by both %q and %q", org.MSP, existing, org.Name))
		} else {
			seenMSPs[org.MSP] = org.Name
		}

		if !validStatuses[org.Status] {
			errs = append(errs, fmt.Errorf("organization %q has invalid status %q: must be one of founding, pending, member", org.Name, org.Status))
		}
	}

	type portUse struct {
		org  string
		kind string
	}
	seenPorts := make(map[int]portUse)

	ordererPorts := []struct {
		value int
		kind  string
	}{
		{dep.Orderer.CAPort, "ca_port"},
	}
	for i, node := range dep.Orderer.Nodes {
		ordererPorts = append(ordererPorts,
			struct {
				value int
				kind  string
			}{node.GeneralPort, fmt.Sprintf("node%d.general_port", i)},
			struct {
				value int
				kind  string
			}{node.AdminPort, fmt.Sprintf("node%d.admin_port", i)},
			struct {
				value int
				kind  string
			}{node.OperationsPort, fmt.Sprintf("node%d.operations_port", i)},
		)
	}
	for _, p := range ordererPorts {
		if existing, ok := seenPorts[p.value]; ok {
			errs = append(errs, fmt.Errorf("port %d is used by both %s (%s) and %s (%s)", p.value, existing.org, existing.kind, net.Orderer.Name, p.kind))
		} else {
			seenPorts[p.value] = portUse{org: net.Orderer.Name, kind: p.kind}
		}
	}

	for _, org := range net.Organizations {

		depOrg, ok := dep.Organizations[org.Name]
		if !ok {
			errs = append(errs, fmt.Errorf("organization %q is in network.yaml but has no matching entry in deployment config", org.Name))
			continue
		}

		ports := []struct {
			value int
			kind  string
		}{
			{depOrg.CAPort, "ca_port"},
		}
		for i, peer := range depOrg.Peers {
			ports = append(ports,
				struct {
					value int
					kind  string
				}{peer.PeerPort, fmt.Sprintf("peer%d.peer_port", i)},
				struct {
					value int
					kind  string
				}{peer.CouchDBPort, fmt.Sprintf("peer%d.couchdb_port", i)},
			)
		}

		for _, p := range ports {
			if existing, ok := seenPorts[p.value]; ok {
				errs = append(errs, fmt.Errorf("port %d is used by both %s (%s) and %s (%s)", p.value, existing.org, existing.kind, org.Name, p.kind))
			} else {
				seenPorts[p.value] = portUse{org: org.Name, kind: p.kind}
			}
		}
	}

	return errors.Join(errs...)
}
