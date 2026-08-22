package lmu

import "github.com/vantare/overlays/v2/internal/telemetry/capability"

// Capabilities is the compiled capability declaration of the LMU driver. It is
// the single place that answers "what can this simulator never do", replacing
// the hardcoded manifest that lived in the composition root and claimed full
// support without asking any driver.
//
// LMU publishes world positions and orientation for the whole grid, so both
// spatial capabilities and the Spotter are supported. Weather is not: the
// canonical catalog still carries it as declared-but-unproduced, so declaring
// it supported here would be the same lie the old manifest told.
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
			capability.SpatialLateral,
			capability.Spotter,
			capability.Damage,
		},
		Modes: capability.Modes{
			Spatial:         capability.SpatialXYZ,
			DeltaReferences: []string{"personal-best", "session-best", "previous-lap"},
			Standings:       capability.StandingsOfficial,
			Gaps:            capability.GapsOfficial,
		},
	}
}
