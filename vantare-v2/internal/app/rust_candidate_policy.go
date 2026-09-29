package app

import (
	"fmt"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
	"github.com/vantare/overlays/v2/internal/app/telemetryprocess"
	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

// rustCandidatePolicy sends the driver's stable declaration to Rust. The child
// resolves live modes from its own committed observations.
func rustCandidatePolicy(revision uint64, consumers telemetryprocess.ConsumersV1, policy performancepolicy.Policy) (telemetryprocess.ConfigurationV1, error) {
	declaration := lmu.Capabilities()
	set, err := capability.Resolve(declaration, nil)
	if err != nil {
		return telemetryprocess.ConfigurationV1{}, fmt.Errorf("resolve Rust candidate capabilities: %w", err)
	}
	modes := declaration.Modes
	spatial := []string{}
	if modes.Spatial != capability.SpatialNone {
		spatial = append(spatial, string(modes.Spatial))
	}
	preferences := overlayv2.DefaultPreferencesV2()
	cadence := performancepolicy.CadenceFor(policy.Level)
	configuration := telemetryprocess.ConfigurationV1{
		Revision:  revision,
		Consumers: consumers,
		Cadence: telemetryprocess.CadenceV1{
			FastNS: int64(cadence.Fast), MidNS: int64(cadence.Mid), SlowNS: int64(cadence.Slow),
			SpotterNS: int64(cadence.Spotter), SessionNS: int64(cadence.Session),
			RelativeNS: int64(cadence.Relative), StandingsNS: int64(cadence.Standings),
			FuelNS: int64(cadence.Fuel), DirtyCeilingNS: int64(cadence.DirtyCeiling),
		},
		Preferences: telemetryprocess.PreferencesV1{
			Speed: preferences.Speed, Temperature: preferences.Temperature,
			Pressure: preferences.Pressure, Fuel: preferences.Fuel,
			DeltaReference: preferences.DeltaReference,
		},
		Source: telemetryprocess.CapabilitySourceV1{
			DescriptorCapabilities: descriptorCapabilityTokens(driver.Descriptor{
				ID:           lmu.DriverID,
				Capabilities: []driver.Capability{lmu.CapabilitySharedMemory, lmu.CapabilityREST},
			}, set),
			Modes: overlayv2.CapabilityModesV2{
				Spatial: spatial, Delta: modes.DeltaReferences,
				Standings: overlayv2.Mode(modes.Standings), Gaps: overlayv2.Mode(modes.Gaps),
			},
			Performance:              overlayPerformancePolicy(policy, policy.SourceHz),
			ResolveModesFromEvidence: true,
		},
	}
	if _, err := telemetryprocess.EncodeConfiguration(configuration); err != nil {
		return telemetryprocess.ConfigurationV1{}, fmt.Errorf("encode Rust candidate policy: %w", err)
	}
	return configuration, nil
}
