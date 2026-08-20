package app

import (
	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
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
