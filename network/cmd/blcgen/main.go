package main

import (
	"flag"
	"fmt"
	"os"

	"blc/network/internal/config"
	"blc/network/internal/generate"
)

const (
	generatorVersion     = "0.1.0"
	configSchemaVersion  = "1"
	networkConfigPath    = "config/network.yaml"
	deploymentConfigPath = "deployment/local.yaml"
	cryptoDir            = "crypto"

	configtxTemplatePath = "templates/configtx.yaml.tmpl"
	configtxOutputPath   = "generated/configtx.yaml"

	dockerBaseDir          = "../docker"
	composeCATemplatePath  = "templates/docker-compose-ca.yaml.tmpl"
	composeCAOutputPath    = "generated/docker-compose-ca.yaml"
	composeNetTemplatePath = "templates/docker-compose-net.yaml.tmpl"
	composeNetOutputPath   = "generated/docker-compose-net.yaml"

	connectionProfileTemplatePath = "templates/connection-profile.json.tmpl"
)

func main() {
	if len(os.Args) < 2 {
		runShow(networkConfigPath, deploymentConfigPath)
		return
	}

	switch os.Args[1] {
	case "validate":
		runValidate(os.Args[2:])
	case "version":
		runVersion()
	case "generate":
		runGenerate(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
		fmt.Fprintln(os.Stderr, "usage: blcgen [validate|version|generate]")
		os.Exit(1)
	}
}

func runShow(netPath, depPath string) {
	netCfg, depCfg, err := loadBoth(netPath, depPath)
	if err != nil {
		fail(err)
	}

	merged, err := config.Merge(netCfg, depCfg)
	if err != nil {
		fail(err)
	}

	printMerged(netCfg, merged)
}

func runValidate(args []string) {
	fs := flag.NewFlagSet("validate", flag.ExitOnError)
	netPath := fs.String("network", networkConfigPath, "path to network.yaml")
	depPath := fs.String("deployment", deploymentConfigPath, "path to deployment config (e.g. local.yaml)")
	fs.Parse(args)

	netCfg, depCfg, err := loadBoth(*netPath, *depPath)
	if err != nil {
		fail(err)
	}

	if err := config.Validate(netCfg, depCfg); err != nil {
		fmt.Fprintln(os.Stderr, "validation failed:")
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println("config is valid")
}

func runVersion() {
	fabricVersion := "unknown"
	if depCfg, err := config.LoadDeploymentConfig(deploymentConfigPath); err == nil {
		fabricVersion = depCfg.FabricVersion
	}

	fmt.Printf("blcgen version:        %s\n", generatorVersion)
	fmt.Printf("target Fabric version: %s\n", fabricVersion)
	fmt.Printf("config schema version: %s\n", configSchemaVersion)
}

func runGenerate(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "usage: blcgen generate <configtx|compose|profiles>")
		os.Exit(1)
	}

	switch args[0] {
	case "configtx":
		runGenerateConfigTx()
	case "compose":
		runGenerateCompose()
	case "profiles":
		runGenerateProfiles()
	default:
		fmt.Fprintf(os.Stderr, "unknown generate target %q\n", args[0])
		os.Exit(1)
	}
}

func runGenerateConfigTx() {
	netCfg, depCfg, err := loadBoth(networkConfigPath, deploymentConfigPath)
	if err != nil {
		fail(err)
	}

	if err := config.Validate(netCfg, depCfg); err != nil {
		fmt.Fprintln(os.Stderr, "cannot generate: config is invalid")
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	data, err := generate.BuildTemplateData(netCfg, depCfg, cryptoDir)
	if err != nil {
		fail(err)
	}

	if err := generate.Render(data, configtxTemplatePath, configtxOutputPath); err != nil {
		fail(err)
	}

	fmt.Printf("wrote %s\n", configtxOutputPath)
}

func runGenerateCompose() {
	netCfg, depCfg, err := loadBoth(networkConfigPath, deploymentConfigPath)
	if err != nil {
		fail(err)
	}

	if err := config.Validate(netCfg, depCfg); err != nil {
		fmt.Fprintln(os.Stderr, "cannot generate: config is invalid")
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	data, err := generate.BuildComposeData(netCfg, depCfg, dockerBaseDir)
	if err != nil {
		fail(err)
	}

	if err := generate.Render(data, composeCATemplatePath, composeCAOutputPath); err != nil {
		fail(err)
	}
	fmt.Printf("wrote %s\n", composeCAOutputPath)

	if err := generate.Render(data, composeNetTemplatePath, composeNetOutputPath); err != nil {
		fail(err)
	}
	fmt.Printf("wrote %s\n", composeNetOutputPath)
}

func runGenerateProfiles() {
	netCfg, depCfg, err := loadBoth(networkConfigPath, deploymentConfigPath)
	if err != nil {
		fail(err)
	}

	if err := config.Validate(netCfg, depCfg); err != nil {
		fmt.Fprintln(os.Stderr, "cannot generate: config is invalid")
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	profiles, err := generate.BuildConnectionProfiles(netCfg, depCfg, cryptoDir)
	if err != nil {
		fail(err)
	}

	for _, profile := range profiles {
		outputPath := fmt.Sprintf("generated/connection-%s.json", profile.OrgName)
		if err := generate.Render(profile, connectionProfileTemplatePath, outputPath); err != nil {
			fail(err)
		}
		fmt.Printf("wrote %s\n", outputPath)
	}
}

func loadBoth(netPath, depPath string) (*config.NetworkConfig, *config.DeploymentConfig, error) {
	netCfg, err := config.LoadNetworkConfig(netPath)
	if err != nil {
		return nil, nil, err
	}

	depCfg, err := config.LoadDeploymentConfig(depPath)
	if err != nil {
		return nil, nil, err
	}

	return netCfg, depCfg, nil
}

func printMerged(netCfg *config.NetworkConfig, merged []config.MergedOrganization) {
	fmt.Printf("Channel: %s (capabilities: channel=%s orderer=%s application=%s)\n",
		netCfg.Channel.Name,
		netCfg.Channel.Capabilities.Channel,
		netCfg.Channel.Capabilities.Orderer,
		netCfg.Channel.Capabilities.Application)
	fmt.Printf("Orderer: %s x%d\n", netCfg.Orderer.Type, netCfg.Orderer.Count)
	fmt.Printf("Chaincode packaging: %s\n\n", netCfg.Chaincode.Packaging)

	for _, org := range merged {
		fmt.Printf("Organization: %s\n", org.Name)
		fmt.Printf("  MSP:    %s\n", org.MSP)
		fmt.Printf("  Status: %s\n", org.Status)
		fmt.Printf("  CA port: %d\n", org.CAPort)
		for i, peer := range org.Peers {
			fmt.Printf("  Peer %d: peer_port=%d couchdb_port=%d\n", i, peer.PeerPort, peer.CouchDBPort)
		}
		fmt.Println()
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
