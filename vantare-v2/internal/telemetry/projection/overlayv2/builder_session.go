package overlayv2

import (
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

// BuildSession projects the session slice of the Overlay v2 contract. It reads
// only the canonical state: nothing here is inferred from a simulator concept.
//
// Flag stays explicitly missing. The canonical ObservedState has no session
// flag signal today (no global flag, no sector flags), so the builder declares
// the absence instead of inventing a green default. Overlay v1 has the same
// hole, which keeps the racing-flags widget at parity across both contracts.
func BuildSession(final derive.FinalState) SessionV2 {
	return SessionV2{
		Track:            qualityValue(final.Observed.TrackName, func(value string) string { return value }),
		Phase:            qualityValue(final.Observed.SessionType, projection.SessionTypeName),
		Flag:             missingValue[string](),
		RemainingSeconds: qualityValue(final.Derived.SessionRemaining, func(value session.RemainingTime) float64 { return float64(value) }),
		MaximumLaps:      qualityValue(final.Observed.MaximumLaps, func(value session.MaximumLaps) int32 { return int32(value) }),
	}
}
