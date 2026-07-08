package config

import (
	"strings"
	"testing"
)

func TestValidate_ValidConfig(t *testing.T) {
	net, err := LoadNetworkConfig("testdata/valid_network.yaml")
	if err != nil {
		t.Fatalf("loading valid network fixture: %v", err)
	}

	dep, err := LoadDeploymentConfig("testdata/valid_deployment.yaml")
	if err != nil {
		t.Fatalf("loading valid deployment fixture: %v", err)
	}

	if err := Validate(net, dep); err != nil {
		t.Fatalf("expected valid config to pass validation, got error: %v", err)
	}
}

func TestValidate_BrokenConfig(t *testing.T) {
	net, err := LoadNetworkConfig("testdata/broken_network.yaml")
	if err != nil {
		t.Fatalf("loading broken network fixture: %v", err)
	}

	dep, err := LoadDeploymentConfig("testdata/broken_deployment.yaml")
	if err != nil {
		t.Fatalf("loading broken deployment fixture: %v", err)
	}

	err = Validate(net, dep)
	if err == nil {
		t.Fatal("expected validation to fail on broken fixture, got nil error")
	}

	msg := err.Error()

	wantSubstrings := []string{
		`duplicate MSP ID "BLCFounderMSP"`,
		`invalid status "invalidstatus"`,
		`port 7051 is used by both`,
	}

	for _, want := range wantSubstrings {
		if !strings.Contains(msg, want) {
			t.Errorf("expected validation error to contain %q, full error was:\n%s", want, msg)
		}
	}
}
