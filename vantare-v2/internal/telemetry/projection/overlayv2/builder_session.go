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
// signal (ISA-1106 B2, candidate mapping). The driver asserts FlagYellow only
// for the documented candidate integers 2, 3, 4, 5 of the official
// LMU-distributed SDK enum ("Yellow flag states (applies to full-course
// only)"); 1 and 6 stay neutral and every other shape stays missing, so
// absence never reads as green and a sector-scoped flag never promotes to
// this global signal. The REST == SDK code equivalence is still pending
// active-session verification: candidate contract proven by fixtures, not a
// certified source.
func BuildSession(final derive.FinalState) SessionV2 {
	return SessionV2{
		Track:            qualityValue(final.Observed.TrackName, func(value string) string { return value }),
		Phase:            qualityValue(final.Observed.SessionType, projection.SessionTypeName),
		Flag:             qualityValue(final.Observed.SessionFlag, func(value session.Flag) string { return string(value) }),
		RemainingSeconds: qualityValue(final.Derived.SessionRemaining, func(value session.RemainingTime) float64 { return float64(value) }),
		MaximumLaps:      qualityValue(final.Observed.MaximumLaps, func(value session.MaximumLaps) int32 { return int32(value) }),
	}
}
