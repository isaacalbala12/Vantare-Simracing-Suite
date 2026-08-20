package app

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

func mustResolve(t *testing.T, declaration capability.Declaration) capability.Set {
	t.Helper()
	set, err := capability.Resolve(declaration, nil)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	return set
}

// The Engineer manifest used to be seven hardcoded Supported entries in the
// composition root. This test fails against that version: a driver without
// lateral spatial support still produced CapabilitySpatial = Supported, and the
// Spotter families gated on it stayed enabled with no positions to reason
// about.
func TestEngineerManifestIsDerivedFromActiveDriver(t *testing.T) {
	t.Parallel()

	live, err := engineerprojection.NewManifest(engineerCapabilities(mustResolve(t, lmu.Capabilities())))
	if err != nil {
		t.Fatalf("NewManifest() error = %v", err)
	}
	if live.State(engineerprojection.CapabilitySpatial) != engineerprojection.CapabilitySupported {
		t.Fatal("LMU publishes rival positions and must keep Engineer spatial supported")
	}
	for _, id := range []engineerprojection.CapabilityID{
		engineerprojection.CapabilitySession,
		engineerprojection.CapabilityStandings,
		engineerprojection.CapabilityControls,
		engineerprojection.CapabilityPit,
		engineerprojection.CapabilityFuel,
		engineerprojection.CapabilityGaps,
	} {
		if live.State(id) != engineerprojection.CapabilitySupported {
			t.Fatalf("LMU capability %q = %v, want supported", id, live.State(id))
		}
	}

	lapDistanceOnly := capability.Declaration{
		Driver:    "simx",
		Supported: []capability.ID{capability.Session, capability.Standings, capability.Controls, capability.Pit, capability.Fuel, capability.Gaps, capability.SpatialLongitudinal},
		Modes:     capability.Modes{Spatial: capability.SpatialLapDistance, Standings: capability.StandingsOfficial, Gaps: capability.GapsEstimated},
	}
	degraded, err := engineerprojection.NewManifest(engineerCapabilities(mustResolve(t, lapDistanceOnly)))
	if err != nil {
		t.Fatalf("NewManifest() error = %v", err)
	}
	if degraded.State(engineerprojection.CapabilitySpatial) != engineerprojection.CapabilityUnsupported {
		t.Fatalf("spatial state = %v, want unsupported for a driver without lateral positions",
			degraded.State(engineerprojection.CapabilitySpatial))
	}
	if degraded.State(engineerprojection.CapabilityStandings) != engineerprojection.CapabilitySupported {
		t.Fatal("an unsupported spatial capability must not degrade the standings capability")
	}
}

// The runtime keeps feeding Overlay v2 the acquisition channels it consumes
// today and now also the product capabilities declared by the driver, so the
// LMU frame is unchanged while the declaration travels with it.
func TestDescriptorCapabilityTokensCarryChannelsAndDeclaredCapabilities(t *testing.T) {
	t.Parallel()

	descriptor := driver.Descriptor{
		ID:           lmu.DriverID,
		Capabilities: []driver.Capability{lmu.CapabilitySharedMemory, lmu.CapabilityREST},
	}
	tokens := descriptorCapabilityTokens(descriptor, mustResolve(t, lmu.Capabilities()))
	if len(tokens) < 2 || tokens[0] != string(lmu.CapabilitySharedMemory) || tokens[1] != string(lmu.CapabilityREST) {
		t.Fatalf("tokens = %v, want the acquisition channels first", tokens)
	}
	for _, want := range []string{string(capability.SpatialLateral), string(capability.SpatialLongitudinal), string(capability.Delta)} {
		if !contains(tokens, want) {
			t.Fatalf("tokens = %v, missing declared capability %q", tokens, want)
		}
	}
	if contains(tokens, string(capability.Weather)) {
		t.Fatalf("tokens = %v, weather is not mapped for LMU and must not be declared", tokens)
	}
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
