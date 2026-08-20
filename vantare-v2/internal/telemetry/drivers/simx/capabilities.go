package simx

import "github.com/vantare/overlays/v2/internal/telemetry/capability"

// Capabilities is the compiled declaration of the synthetic driver. Everything
// SimX cannot do is stated here once, so no widget has to discover it by
// finding an empty value:
//
//   - spatial.lateral and spotter are unsupported: SimX publishes lap distance
//     but no rival world position, so a lateral "car on your left" cannot be
//     honest. Longitudinal proximity is supported and keeps working.
//   - weather is unsupported: SimX publishes none.
//   - delta is supported but reconstructed. SimX has no native delta, so
//     personal-best -- the reference that needs the simulator's own value -- is
//     not among the answerable references. The composition root resolves a
//     preference it cannot serve down to a declared one instead of leaving a
//     widget to negotiate it.
func Capabilities() capability.Declaration {
	return capability.Declaration{
		Driver: DriverID,
		Supported: []capability.ID{
			capability.Session,
			capability.Controls,
			capability.Standings,
			capability.Gaps,
			capability.Fuel,
			capability.Pit,
			capability.Delta,
			capability.SpatialLongitudinal,
		},
		Modes: capability.Modes{
			Spatial:         capability.SpatialLapDistance,
			DeltaReferences: []string{"session-best", "previous-lap"},
			Standings:       capability.StandingsOfficial,
			Gaps:            capability.GapsEstimated,
		},
	}
}
