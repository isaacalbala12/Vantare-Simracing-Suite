package overlayv2

import (
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

// BuildSession projects the session slice of the Overlay v2 contract. It reads
// only the canonical state: nothing here is inferred from a simulator concept.
//
// Flag reads the canonical SessionFlag admitted from the LMU REST sessionInfo
// signal (ISA-1106). The assertion stays conservative: yellow only on positive
// evidence, missing otherwise. Absence never reads as green, and a
// sector-scoped flag never promotes to this global signal, which keeps the
// racing-flags widget at parity across both contracts.
func BuildSession(final derive.FinalState) SessionV2 {
	return SessionV2{
		Track:            qualityValue(final.Observed.TrackName, func(value string) string { return value }),
		Phase:            qualityValue(final.Observed.SessionType, projection.SessionTypeName),
		Flag:             qualityValue(final.Observed.SessionFlag, func(value session.Flag) string { return string(value) }),
		RemainingSeconds: qualityValue(final.Derived.SessionRemaining, func(value session.RemainingTime) float64 { return float64(value) }),
		MaximumLaps:      qualityValue(final.Observed.MaximumLaps, func(value session.MaximumLaps) int32 { return int32(value) }),
	}
}
