package overlayv2

import (
	"math"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

// controlsPerMille is the quantization of a pedal ratio on the v2 wire: three
// decimals, which is finer than any pedal chart can resolve and an order of
// magnitude cheaper than a float per sample.
const controlsPerMille = 1000

// BuildControls publishes the player's pedal history from the canonical
// derivation.
//
// The authority is derive.FinalState.Derived.ControlsHistory, the same series
// Overlay v1 projects as `controlsHistory`. It is built once, in Go, from the
// canonical stream; nothing here accumulates state. That is the whole point of
// the section: the Overlay v1 path had every input-telemetry widget keep its
// own TypeScript accumulator, one per widget id, fed by whatever snapshots
// happened to reach the browser, so two widgets could disagree about the same
// lap. The canonical history has one owner and one retention rule.
//
// Only the ratios travel. Overlay v1's TypeScript samples also carried speed,
// rpm and gear, but the canonical ControlSample has none of them: the
// derivation records pedals. They are declared gaps, not reconstructed here.
func BuildControls(final derive.FinalState) ControlsV2 {
	history := final.Derived.ControlsHistory
	quality := qualityFromFreshness(history.Freshness)
	samples := history.Samples
	if len(samples) == 0 || quality == QualityMissing || quality == QualityInvalid {
		return ControlsV2{History: ControlsHistoryV2{Q: quality}}
	}
	view := ControlsHistoryV2{
		Q:        quality,
		Throttle: make([]int16, len(samples)),
		Brake:    make([]int16, len(samples)),
		Clutch:   make([]int16, len(samples)),
	}
	for index, sample := range samples {
		view.Throttle[index] = quantizeRatio(sample.Throttle)
		view.Brake[index] = quantizeRatio(sample.Brake)
		view.Clutch[index] = quantizeRatio(sample.Clutch)
	}
	if len(samples) > 1 {
		span := samples[len(samples)-1].CapturedAt.Sub(samples[0].CapturedAt).Milliseconds()
		if span > 0 {
			view.WindowMS = span
		}
	}
	return ControlsV2{History: view}
}

// quantizeRatio clamps to the 0..1 the schema promises and rounds half away
// from zero, so a pedal at rest stays exactly zero and a pedal fully pressed
// stays exactly 1000.
func quantizeRatio(value schema.Ratio) int16 {
	ratio := float64(value)
	if !finite(ratio) || ratio <= 0 {
		return 0
	}
	if ratio >= 1 {
		return controlsPerMille
	}
	return int16(math.Round(ratio * controlsPerMille))
}
