package telemetryanalysis

import (
	"math"
	"sort"
)

// orderedProjectionBoundaryScan keeps the original rows bracketing each
// requested instant. It is fed only usable samples from one aligned channel,
// in source order. Keeping both sides preserves the distinct lookup/tie rules
// used by the existing projection derivations.
type orderedProjectionBoundaryScan struct {
	queries   []float64
	selected  map[int64]HistoricalSample
	previous  *HistoricalSample
	position  int
	firstSame bool
	lastTime  float64
	seen      bool
}

func newOrderedProjectionBoundaryScan(queries []float64) (*orderedProjectionBoundaryScan, error) {
	for i, query := range queries {
		if math.IsNaN(query) || math.IsInf(query, 0) || (i > 0 && query <= queries[i-1]) {
			return nil, ErrInvalidCorrection
		}
	}
	return &orderedProjectionBoundaryScan{queries: append([]float64(nil), queries...), selected: make(map[int64]HistoricalSample)}, nil
}

// accept ignores unusable values exactly as the scalar/vector series readers
// do. false means valid samples were not ordered by timestamp; a paged caller
// must reject or use an explicitly verified alternative, never return a
// different nearest value silently.
func (scan *orderedProjectionBoundaryScan) accept(sample HistoricalSample, usable bool) bool {
	if !usable || sample.TimestampSeconds == nil || math.IsNaN(*sample.TimestampSeconds) || math.IsInf(*sample.TimestampSeconds, 0) {
		return true
	}
	seconds := *sample.TimestampSeconds
	if scan.seen && seconds < scan.lastTime {
		return false
	}
	for scan.position < len(scan.queries) && scan.queries[scan.position] < seconds {
		if scan.previous != nil {
			scan.selectSample(*scan.previous)
		}
		if !scan.firstSame {
			scan.selectSample(sample)
		}
		scan.position++
		scan.firstSame = false
	}
	if scan.position < len(scan.queries) && scan.queries[scan.position] == seconds && !scan.firstSame {
		scan.selectSample(sample)
		scan.firstSame = true
	}
	copy := sample
	scan.previous = &copy
	scan.lastTime, scan.seen = seconds, true
	return true
}

func (scan *orderedProjectionBoundaryScan) finish() []HistoricalSample {
	for scan.position < len(scan.queries) {
		if scan.previous != nil {
			scan.selectSample(*scan.previous)
		}
		scan.position++
	}
	result := make([]HistoricalSample, 0, len(scan.selected))
	for _, sample := range scan.selected {
		result = append(result, sample)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Index < result[j].Index })
	return result
}

func (scan *orderedProjectionBoundaryScan) selectSample(sample HistoricalSample) {
	if _, exists := scan.selected[sample.Index]; exists {
		return
	}
	copy := sample
	seconds := *sample.TimestampSeconds
	copy.TimestampSeconds = &seconds
	copy.Values = append([]HistoricalValue(nil), sample.Values...)
	scan.selected[sample.Index] = copy
}
