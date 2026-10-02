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

// BuildDelta resolves all widget reference requests once per projection. The
// legacy top-level selection follows the runtime preference; References lets
// independent widgets select a Go-resolved payload without deriving or choosing
// a fallback in React. Each response preserves its requested name; Reference
// identifies the effective available comparison (priority: personal, session,
// previous), and Seconds preserves that comparison's quality. When none is
// usable, the effective reference/authority are empty and Seconds is missing.
// History remains one shared canonical series even without a usable reference.
// Trend stays empty because the canonical state has no trend concept.
func BuildDelta(final derive.FinalState, preferences PreferencesV2) DeltaViewV2 {
	preferences = normalizedPreferences(preferences)
	candidates := deltaReferenceCandidates(final)
	available := AvailableDeltaReferences(final)

	result := DeltaViewV2{
		Available:  available,
		History:    buildDeltaHistory(final.Derived.Delta),
		References: make([]DeltaReferenceViewV2, 0, len(deltaReferencePriority)),
	}
	for _, requested := range deltaReferencePriority {
		resolved := resolveDeltaReference(requested, candidates, available)
		result.References = append(result.References, resolved)
		if requested == preferences.DeltaReference {
			result.Requested = resolved.Requested
			result.Reference = resolved.Reference
			result.Seconds = resolved.Seconds
			result.Authority = resolved.Authority
		}
	}
	return result
}

func resolveDeltaReference(requested string, candidates map[string]schema.Field[session.DeltaSeconds], available []string) DeltaReferenceViewV2 {
	result := DeltaReferenceViewV2{Requested: requested, Seconds: missingValue[float64]()}
	effective := ""
	if usableDeltaSeconds(candidates[requested]) {
		effective = requested
	} else if len(available) > 0 {
		effective = available[0]
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
