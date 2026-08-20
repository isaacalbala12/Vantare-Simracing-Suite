package app

import (
	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

// engineerCapabilityBySignal maps the shared capability vocabulary onto the
// Engineer manifest ids. Engineer still exposes one monolithic spatial
// capability; the shared vocabulary splits it, and the safe reduction is that
// Engineer's spatial is supported only when laterality is, because the message
// families gated on it (Spotter side awareness) are exactly the ones that need
// a lateral position.
var engineerCapabilityBySignal = []struct {
	Engineer engineerprojection.CapabilityID
	Signal   capability.ID
}{
	{engineerprojection.CapabilitySession, capability.Session},
	{engineerprojection.CapabilityStandings, capability.Standings},
	{engineerprojection.CapabilityControls, capability.Controls},
	{engineerprojection.CapabilityPit, capability.Pit},
	{engineerprojection.CapabilityFuel, capability.Fuel},
	{engineerprojection.CapabilityGaps, capability.Gaps},
	{engineerprojection.CapabilitySpatial, capability.SpatialLateral},
}

// engineerCapabilities derives the Engineer manifest from the active driver's
// capability set. Before ISA-372 F10 this manifest was a hardcoded list of
// seven Supported entries in the composition root, so a simulator without
// rival positions would still have had the Spotter families enabled.
func engineerCapabilities(set capability.Set) []engineerprojection.Capability {
	entries := make([]engineerprojection.Capability, 0, len(engineerCapabilityBySignal))
	for _, mapping := range engineerCapabilityBySignal {
		entries = append(entries, engineerprojection.Capability{
			ID:    mapping.Engineer,
			State: engineerCapabilityState(set.State(mapping.Signal)),
		})
	}
	return entries
}

func engineerCapabilityState(state capability.State) engineerprojection.CapabilityState {
	switch state {
	case capability.StateSupported:
		return engineerprojection.CapabilitySupported
	case capability.StateUnsupported:
		return engineerprojection.CapabilityUnsupported
	case capability.StateDegraded:
		return engineerprojection.CapabilityDegraded
	default:
		return engineerprojection.CapabilityUnknown
	}
}

// descriptorCapabilityTokens is what the composition root hands to Overlay v2
// through SourceContextV2. It carries two vocabularies on purpose:
//
//   - the acquisition channels of the active driver's descriptor, which is
//     what the Overlay v2 builder consumes today, and
//   - the product capability ids resolved from the driver's own declaration.
//
// The Overlay v2 builder still expands an acquisition channel into a fixed
// list of product capabilities. That mapping belongs to the Overlay v2 owner
// and is documented as the remaining seam of this phase; feeding both
// vocabularies keeps the LMU frame byte-identical while making the declared
// capabilities available to the builder the moment it consumes them.
func descriptorCapabilityTokens(descriptor driver.Descriptor, set capability.Set) []string {
	tokens := make([]string, 0, len(descriptor.Capabilities)+len(set.Supported()))
	for _, channel := range descriptor.Capabilities {
		tokens = append(tokens, string(channel))
	}
	return append(tokens, set.SupportedKeys()...)
}

// overlayCapabilityModes resolves, for one published tick, how the active
// driver actually answered each capability, and translates the result into the
// Overlay v2 wire vocabulary.
//
// It lives in the composition root because it is the only layer allowed to see
// both sides: ADR 0004 keeps `projection` free of any capability or driver
// import, so the builder receives modes already resolved and never learns which
// simulator produced them. The declaration bounds the answer (a driver that
// never sends world coordinates can never publish "xyz") and the live state
// narrows it (fresh geometry degrades to lap distance and then to none).
func overlayCapabilityModes(declaration capability.Declaration, final derive.FinalState) overlayv2.CapabilityModesV2 {
	modes := capability.ResolveModes(declaration, capability.SessionEvidence{
		WorldPosition:   bestVehicleQuality(final, func(state core.VehicleState) schema.Freshness { return state.WorldPosition.Freshness() }),
		LapDistance:     bestVehicleQuality(final, func(state core.VehicleState) schema.Freshness { return state.LapDistance.Freshness() }),
		DeltaReferences: overlayv2.AvailableDeltaReferences(final),
		Standings:       bestVehicleQuality(final, func(state core.VehicleState) schema.Freshness { return state.Position.Freshness() }),
		Gaps:            capabilityQuality(final.Derived.Gaps.Freshness),
	})
	spatial := make([]string, 0, 1)
	if modes.Spatial != capability.SpatialNone {
		spatial = append(spatial, string(modes.Spatial))
	}
	return overlayv2.CapabilityModesV2{
		Spatial:   spatial,
		Delta:     modes.DeltaReferences,
		Standings: overlayv2.Mode(modes.Standings),
		Gaps:      overlayv2.Mode(modes.Gaps),
	}
}

// bestVehicleQuality answers with the best freshness any vehicle reports for
// one field, which is the same rule the Overlay v2 availability map uses: one
// car with a valid position is enough for the capability to exist.
func bestVehicleQuality(final derive.FinalState, freshness func(core.VehicleState) schema.Freshness) capability.Quality {
	best := schema.FreshnessMissing
	for _, vehicle := range final.Observed.Vehicles {
		if freshnessRank(freshness(vehicle)) > freshnessRank(best) {
			best = freshness(vehicle)
		}
	}
	return capabilityQuality(best)
}

func freshnessRank(value schema.Freshness) int {
	switch value {
	case schema.FreshnessFresh:
		return 3
	case schema.FreshnessStale:
		return 2
	case schema.FreshnessInvalid:
		return 1
	default:
		return 0
	}
}

func capabilityQuality(value schema.Freshness) capability.Quality {
	switch value {
	case schema.FreshnessFresh:
		return capability.QualityFresh
	case schema.FreshnessStale:
		return capability.QualityStale
	case schema.FreshnessInvalid:
		return capability.QualityInvalid
	default:
		return capability.QualityMissing
	}
}
