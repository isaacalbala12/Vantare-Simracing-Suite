package overlayv2

import (
	"math"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

// Delta references published by the v2 contract. The names are the ones the
// widget configuration already uses, so the frontend never has to translate.
const (
	DeltaReferencePersonalBest = "personal-best"
	DeltaReferenceSessionBest  = "session-best"
	DeltaReferencePreviousLap  = "previous-lap"
)

// deltaReferencePriority is the fallback order when the requested reference has
// no usable value. It is the same preference Overlay v1 applied silently inside
// delta-view-model.ts (personal best first, then the reconstructed ones).
var deltaReferencePriority = [3]string{
	DeltaReferencePersonalBest,
	DeltaReferenceSessionBest,
	DeltaReferencePreviousLap,
}

// BuildDelta resolves the delta reference in Go.
//
// Overlay v1 resolved it in the widget (delta-view-model.ts:111-118): it read
// the requested reference from the widget content, picked the matching field
// and fell back to `player.deltaSeconds` when no reference lap existed, without
// ever telling the consumer which reference it actually used. Here the
// resolution is explicit and observable:
//
//   - `Requested` is the reference the consumer asked for (a preference, so the
//     frame is still one per tick and not one per widget);
//   - `Available` lists the references that carry a usable value right now;
//   - `Reference` is the effective one: the requested reference when it is
//     available, otherwise the first available in the documented priority, and
//     empty when none is;
//   - `Seconds` is the value of the effective reference with its own quality.
//
// Trend stays empty: the canonical state carries the bounded delta history
// (derive.SelfDelta.History) but no trend concept, and reconstructing one here
// would create a second authority for something delta-trace already owns. It is
// declared missing rather than invented.
//
// History is published on every frame, even when no reference is effective:
// it is the measured series with its own quality derived from the delta
// freshness, not a function of the resolved reference. Delta is a fast-tier
// section rebuilt on every tick, so no dirty signal is needed to keep the
// series current.
func BuildDelta(final derive.FinalState, preferences PreferencesV2) DeltaViewV2 {
	preferences = normalizedPreferences(preferences)
	candidates := deltaReferenceCandidates(final)
	available := AvailableDeltaReferences(final)

	requested := preferences.DeltaReference
	effective := ""
	if usableDeltaSeconds(candidates[requested]) {
		effective = requested
	} else if len(available) > 0 {
		effective = available[0]
	}

	result := DeltaViewV2{
		Seconds:   missingValue[float64](),
		Requested: requested,
		Available: available,
		History:   buildDeltaHistory(final.Derived.Delta),
	}
	if effective == "" {
		return result
	}
	field := candidates[effective]
	result.Reference = effective
	result.Seconds = qualityValue(field, func(value session.DeltaSeconds) float64 { return float64(value) })
	result.Authority = deltaAuthority(field)
	return result
}

// buildDeltaHistory projects the canonical SelfDelta series verbatim:
// absolute Unix capture instants plus unquantized seconds, oldest first.
// Both arrays grow together from the same samples, so they stay aligned by
// construction; the tail is kept when the canonical state ever exceeds the
// consumer bound. A series without usable quality publishes its quality
// with no entries, never a sentinel. The copy owns its backing arrays: the
// caller can never alias the canonical history.
func buildDeltaHistory(delta derive.SelfDelta) DeltaHistoryV2 {
	quality := qualityFromFreshness(delta.Freshness)
	view := DeltaHistoryV2{Q: quality}
	switch quality {
	case QualityFresh, QualityStale:
	default:
		return view
	}
	samples := delta.History
	if len(samples) > derive.MaxSelfDeltaHistory {
		samples = samples[len(samples)-derive.MaxSelfDeltaHistory:]
	}
	view.CapturedAtMS = make([]int64, len(samples))
	view.Seconds = make([]float64, len(samples))
	for index, sample := range samples {
		view.CapturedAtMS[index] = sample.CapturedAt.UnixMilli()
		view.Seconds[index] = float64(sample.Seconds)
	}
	return view
}

func deltaReferenceCandidates(final derive.FinalState) map[string]schema.Field[session.DeltaSeconds] {
	delta := final.Derived.Delta
	return map[string]schema.Field[session.DeltaSeconds]{
		DeltaReferencePersonalBest: delta.PersonalBest,
		DeltaReferenceSessionBest:  delta.SessionBest,
		DeltaReferencePreviousLap:  delta.PreviousLap,
	}
}

// AvailableDeltaReferences lists, in the documented priority order, the delta
// references that carry a usable value right now. It is the single source for
// both the delta view and the capability modes the composition root resolves,
// so the two can never disagree about what the session can answer.
func AvailableDeltaReferences(final derive.FinalState) []string {
	candidates := deltaReferenceCandidates(final)
	available := make([]string, 0, len(deltaReferencePriority))
	for _, name := range deltaReferencePriority {
		if usableDeltaSeconds(candidates[name]) {
			available = append(available, name)
		}
	}
	return available
}

// usableDeltaSeconds accepts only a present, finite value whose quality can be
// shown. A missing or invalid field is not an available reference.
func usableDeltaSeconds(field schema.Field[session.DeltaSeconds]) bool {
	value, present := field.Value()
	if !present {
		return false
	}
	switch qualityFromFreshness(field.Freshness()) {
	case QualityFresh, QualityStale:
	default:
		return false
	}
	return !math.IsNaN(float64(value)) && !math.IsInf(float64(value), 0)
}

// deltaAuthority reports where the published value came from. The simulator
// provides the personal best directly (observed); the session best and the
// previous lap are reconstructed by the pipeline (derived).
func deltaAuthority(field schema.Field[session.DeltaSeconds]) Authority {
	if field.Provenance() == schema.ProvenanceObserved {
		return AuthorityNative
	}
	return AuthorityDerived
}
