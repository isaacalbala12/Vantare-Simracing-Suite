package main

import (
	"context"
	"errors"
	"fmt"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"strings"
)

type historicalParser interface {
	Inspect(context.Context) (telemetryanalysis.HistoricalSession, error)
	ReadPage(context.Context, string, int64, int) (telemetryanalysis.HistoricalPage, error)
}

func clearFloats(v []float64)  { clear(v) }
func clearEvents(v []LapEvent) { clear(v) }
func clearGeo(v [][]GeoPoint) {
	for _, x := range v {
		clear(x)
	}
	clear(v)
}

const (
	maxPageLogicalBytes = uint64((pageSize + 1) * 256)
)

func structSliceBytes(count, fields uint64) (uint64, error) {
	s, ok := checkedAdd(fields, logicalStructOverhead)
	if !ok {
		return 0, errLogicalCap
	}
	return logicalSliceBytes(count, s)
}

func geometryPhaseBytes(samples uint64, laps []OracleLap) (uint64, error) {
	// Simultaneous worst case: oracle triples/lap bounds, raw+projected points,
	// two fold aligned copies, centerlines, median scratch and residual grid.
	var total uint64
	add := func(count, stride uint64, structure bool) error {
		var n uint64
		var err error
		var ok bool
		if structure {
			n, err = structSliceBytes(count, stride)
		} else {
			n, err = logicalSliceBytes(count, stride)
		}
		if err != nil {
			return err
		}
		total, ok = checkedAdd(total, n)
		if !ok {
			return errLogicalCap
		}
		return nil
	}
	var originals uint64
	for _, lap := range laps {
		if lap.End < lap.Start {
			return 0, errLogicalCap
		}
		var ok bool
		originals, ok = checkedAdd(originals, uint64(lap.End-lap.Start))
		if !ok {
			return 0, errLogicalCap
		}
	}
	lapCount := uint64(len(laps))
	gridLaps, ok := checkedMul(lapCount, gridSize)
	if !ok {
		return 0, errLogicalCap
	}
	// Original u vectors; oracle values/laps (+32); raw/projected/aligned points;
	// fold indices; centerlines, median point/float scratch and residuals.
	parts := [][3]uint64{{samples, 16, 1}, {samples, 16, 1}, {samples, 16, 1}, {lapCount, 32, 1}, {originals, 8, 0}, {lapCount, 24, 0}, {gridLaps, 16, 1}, {gridLaps, 16, 1}, {gridLaps, 16, 1}, {lapCount * 2, 8, 0}, {3 * gridSize, 16, 1}, {gridLaps, 8, 0}, {gridSize, 16, 1}}
	for _, p := range parts {
		if err := add(p[0], p[1], p[2] == 1); err != nil {
			return 0, err
		}
	}
	// Outer slice headers for raw/projected/aligned lap matrices.
	outer, err := logicalSliceBytes(lapCount, logicalSliceHeader)
	if err != nil {
		return 0, err
	}
	outer, ok = checkedMul(outer, 3)
	if !ok {
		return 0, errLogicalCap
	}
	total, ok = checkedAdd(total, outer)
	if !ok {
		return 0, errLogicalCap
	}
	return total, nil
}

func canonicalInputBytes(counts []uint64) (uint64, error) {
	var total uint64
	for _, count := range counts {
		var ok bool
		total, ok = checkedAdd(total, count)
		if !ok {
			return 0, errLogicalCap
		}
	}
	bytes, ok := checkedMul(total, 8)
	if !ok || bytes > 256<<20 {
		return 0, errLogicalCap
	}
	return bytes, nil
}

func (b *productionBackend) materialize(ctx context.Context, p historicalParser) (CandidateResult, error) {
	budget := b.logicalBudget
	if budget == nil {
		budget = newLogicalBudgetV1(logicalLimit)
	}
	baseline := budget.account.Live
	defer func() { budget.release(budget.account.Live - baseline) }()
	s, e := p.Inspect(ctx)
	if e != nil {
		return CandidateResult{}, e
	}
	group, e := publicGroup(s.Metadata)
	if e != nil {
		return CandidateResult{Class: "data_invalid"}, nil
	}
	chs := map[string]telemetryanalysis.HistoricalChannel{}
	for _, c := range s.Channels {
		if _, ok := chs[c.SourceName]; ok {
			return CandidateResult{Class: "data_invalid"}, nil
		}
		chs[c.SourceName] = c
	}
	vals := map[string][]float64{}
	defer func() {
		for _, v := range vals {
			clearFloats(v)
		}
	}()
	for _, name := range requiredChannels {
		c, ok := chs[name]
		if !ok {
			return CandidateResult{Class: "data_invalid"}, nil
		}
		v, x := readHistoricalContinuous(ctx, p, c, budget)
		if x != nil {
			if errors.Is(x, errLogicalCap) {
				return CandidateResult{}, x
			}
			if e := ctx.Err(); e != nil {
				return CandidateResult{}, e
			}
			return CandidateResult{Class: "data_invalid"}, nil
		}
		vals[name] = v
	}
	geometryChannels := []string{"GPS Latitude", "GPS Longitude", "Lap Dist", "Total Dist"}
	freq := chs[geometryChannels[0]].Sampling.FrequencyHz
	for _, name := range geometryChannels[1:] {
		if chs[name].Sampling.FrequencyHz != freq {
			return CandidateResult{Class: "data_invalid"}, nil
		}
	}
	lap, ok := chs["Lap"]
	if !ok || len(lap.Columns) != 1 || (lap.Columns[0].Type != telemetryanalysis.ScalarInteger && lap.Columns[0].Type != telemetryanalysis.ScalarNumber) {
		return CandidateResult{Class: "data_invalid"}, nil
	}
	events, x := readHistoricalEvents(ctx, p, lap, budget)
	if x != nil {
		if errors.Is(x, errLogicalCap) {
			return CandidateResult{}, x
		}
		if e := ctx.Err(); e != nil {
			return CandidateResult{}, e
		}
		return CandidateResult{Class: "data_invalid"}, nil
	}
	defer clearEvents(events)
	n := len(vals["Lap Dist"])
	for _, name := range geometryChannels {
		if len(vals[name]) != n {
			return CandidateResult{Class: "data_invalid"}, nil
		}
	}
	or := OracleRecording{Frequency: float64(chs["Lap Dist"].Sampling.FrequencyHz), GPSTimeFrequency: float64(chs["GPS Time"].Sampling.FrequencyHz), CoordinateFrequency: float64(chs["GPS Latitude"].Sampling.FrequencyHz), CoordinateFirst: 0, CoordinateLast: n - 1, CoordinateCount: n, Events: events}
	defer clearOracle(&or)
	lapValues, ok := checkedMul(uint64(n), 2)
	if !ok {
		return CandidateResult{}, errLogicalCap
	}
	oracleValues, ok := checkedAdd(uint64(len(vals["GPS Time"])), lapValues)
	if !ok {
		return CandidateResult{}, errLogicalCap
	}
	oracleBytes, ok := checkedMul(oracleValues, 24)
	if !ok {
		return CandidateResult{}, errLogicalCap
	}
	if e := budget.reserve(oracleBytes); e != nil {
		return CandidateResult{}, e
	}
	for i := range vals["GPS Time"] {
		or.GPSTime = append(or.GPSTime, OracleValue{int64(i), vals["GPS Time"][i]})
	}
	for i := 0; i < n; i++ {
		or.LapDist = append(or.LapDist, OracleValue{int64(i), vals["Lap Dist"][i]})
		or.TotalDist = append(or.TotalDist, OracleValue{int64(i), vals["Total Dist"][i]})
	}
	o := classifyOracle(or)
	defer clearOracleResult(&o)
	base := CandidateResult{Class: o.Class, SessionID: s.ID, GroupToken: group, Laps: len(o.Laps)}
	if o.Class != "accepted" {
		return base, nil
	}
	counts := make([]uint64, 0, len(requiredChannels))
	for _, name := range requiredChannels {
		counts = append(counts, uint64(len(vals[name])))
	}
	logical, x := canonicalInputBytes(counts)
	if x != nil {
		return CandidateResult{Class: "data_invalid"}, nil
	}
	account := ResourceAccountant{}
	if account.Add(logical) != nil {
		return CandidateResult{}, fmt.Errorf("resource_cap")
	}
	defer account.Release(logical)
	phase, x := geometryPhaseBytes(uint64(n), o.Laps)
	if x != nil || budget.reserve(phase) != nil {
		return CandidateResult{}, fmt.Errorf("resource_cap")
	}
	defer budget.release(phase)
	laps, e := projectLaps(o.Laps, vals["Lap Dist"], vals["GPS Latitude"], vals["GPS Longitude"])
	if e != nil {
		base.Class = "data_invalid"
		return base, nil
	}
	defer clearGeo(laps)
	ledger := crossfitGeo(laps)
	all := make([]int, len(laps))
	defer clear(all)
	for i := range all {
		all[i] = i
	}
	_, center, centerErr := trainingGeometry(laps, all)
	if centerErr == nil {
		if e := budget.reserve(gridSize*2*8 + 32); e != nil {
			return CandidateResult{}, e
		}
		base.Centerline = center
	}
	base.Pass = ledger.Pass
	base.FailThreshold = ledger.FailThreshold
	base.FailGeometry = ledger.FailGeometry
	base.FailTraining = ledger.FailTraining
	base.Contributing = ledger.Structural
	base.Passing = ledger.Structural && recordingPass(ledger.Pass, ledger.Total)
	return base, nil
}
func publicGroup(m []telemetryanalysis.HistoricalMetadata) (string, error) {
	want := []string{"TrackName", "TrackLayout", "CarName", "CarClass"}
	v := map[string]string{}
	for _, x := range m {
		for _, k := range want {
			if x.Key == k {
				if !validOpaque(x.Value, 256) {
					return "", fmt.Errorf("metadata")
				}
				if _, ok := v[k]; ok || x.Sensitive || x.Redacted || !x.Present || x.Quality != telemetryanalysis.QualityValid {
					return "", fmt.Errorf("metadata")
				}
				z := strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(x.Value)), " "))
				if z == "" {
					return "", fmt.Errorf("metadata")
				}
				v[k] = z
			}
		}
	}
	var out []string
	for _, k := range want {
		if v[k] == "" {
			return "", fmt.Errorf("metadata")
		}
		out = append(out, v[k])
	}
	return strings.Join(out, "\x00"), nil
}
func readHistoricalContinuous(ctx context.Context, p historicalParser, c telemetryanalysis.HistoricalChannel, budget *logicalBudgetV1) ([]float64, error) {
	if c.Capability != telemetryanalysis.QualityValid || c.Sampling.Kind != telemetryanalysis.SamplingContinuousImplicitFrequency || c.Sampling.FrequencyHz <= 0 || len(c.Columns) != 1 || c.Columns[0].Type != telemetryanalysis.ScalarNumber {
		return nil, fmt.Errorf("channel")
	}
	return readHistoricalPages(ctx, p, c.ID, false, budget)
}
func readHistoricalPages(ctx context.Context, p historicalParser, id string, event bool, budget *logicalBudgetV1) ([]float64, error) {
	limit := maxSamples
	if event {
		limit = maxEvents
	}
	out := []float64{}
	var owned uint64
	for start := int64(0); ; start += pageSize {
		if e := ctx.Err(); e != nil {
			return nil, e
		}
		if e := budget.reserve(maxPageLogicalBytes); e != nil {
			return nil, e
		}
		page, e := p.ReadPage(ctx, id, start, pageSize)
		if e != nil {
			budget.release(maxPageLogicalBytes)
			return nil, e
		}
		if page.Start != start || page.ChannelID != id || len(page.Samples) > pageSize || len(out)+len(page.Samples) > limit {
			budget.release(maxPageLogicalBytes)
			return nil, fmt.Errorf("page")
		}
		for i, s := range page.Samples {
			if len(out) == cap(out) {
				var e error
				out, e = budget.growFloats(out, &owned)
				if e != nil {
					budget.release(maxPageLogicalBytes)
					return nil, e
				}
			}
			if s.Index != start+int64(i) || len(s.Values) != 1 {
				return nil, fmt.Errorf("sample")
			}
			x := s.Values[0]
			if !x.Present || x.Quality != telemetryanalysis.QualityValid {
				return nil, fmt.Errorf("value")
			}
			var v float64
			if event && x.Scalar.Kind == telemetryanalysis.ScalarInteger {
				if x.Scalar.Integer < -(1<<53) || x.Scalar.Integer > 1<<53 {
					return nil, fmt.Errorf("integer")
				}
				v = float64(x.Scalar.Integer)
			} else if x.Scalar.Kind == telemetryanalysis.ScalarNumber {
				v = x.Scalar.Number
			} else {
				return nil, fmt.Errorf("kind")
			}
			if !finite(v) {
				return nil, fmt.Errorf("finite")
			}
			out = append(out, v)
		}
		budget.release(maxPageLogicalBytes)
		if len(page.Samples) < pageSize {
			break
		}
	}
	return out, nil
}
func readHistoricalEvents(ctx context.Context, p historicalParser, c telemetryanalysis.HistoricalChannel, budget *logicalBudgetV1) ([]LapEvent, error) {
	if c.Capability != telemetryanalysis.QualityValid || c.Sampling.Kind != telemetryanalysis.SamplingEventTimestamped || len(c.Columns) != 1 {
		return nil, fmt.Errorf("event")
	}
	var out []LapEvent
	var owned uint64
	for start := int64(0); ; start += pageSize {
		if e := ctx.Err(); e != nil {
			return nil, e
		}
		if e := budget.reserve(maxPageLogicalBytes); e != nil {
			return nil, e
		}
		page, e := p.ReadPage(ctx, c.ID, start, pageSize)
		if e != nil {
			budget.release(maxPageLogicalBytes)
			return nil, e
		}
		if page.Start != start || page.ChannelID != c.ID || len(page.Samples) > pageSize || len(out)+len(page.Samples) > maxEvents {
			budget.release(maxPageLogicalBytes)
			return nil, fmt.Errorf("event page")
		}
		for i, s := range page.Samples {
			if len(out) == cap(out) {
				var e error
				out, e = budget.growEvents(out, &owned)
				if e != nil {
					budget.release(maxPageLogicalBytes)
					return nil, e
				}
			}
			if s.Index != start+int64(i) || s.TimestampSeconds == nil || !finite(*s.TimestampSeconds) || len(s.Values) != 1 {
				return nil, fmt.Errorf("event sample")
			}
			x := s.Values[0]
			if !x.Present || x.Quality != telemetryanalysis.QualityValid {
				return nil, fmt.Errorf("event value")
			}
			var v float64
			switch x.Scalar.Kind {
			case telemetryanalysis.ScalarNumber:
				v = x.Scalar.Number
			case telemetryanalysis.ScalarInteger:
				if x.Scalar.Integer < -(1<<53) || x.Scalar.Integer > 1<<53 {
					return nil, fmt.Errorf("event integer")
				}
				v = float64(x.Scalar.Integer)
			default:
				return nil, fmt.Errorf("event kind")
			}
			if !finite(v) {
				return nil, fmt.Errorf("event finite")
			}
			out = append(out, LapEvent{s.Index, *s.TimestampSeconds, v, true, true})
		}
		budget.release(maxPageLogicalBytes)
		if len(page.Samples) < pageSize {
			break
		}
	}
	return out, nil
}
func projectLaps(bounds []OracleLap, dist, lat, lon []float64) ([][]GeoPoint, error) {
	raw := make([][]GeoPoint, len(bounds))
	for k, b := range bounds {
		if b.Start < 0 || b.End > len(dist) || b.End-b.Start < 2 {
			return nil, fmt.Errorf("bounds")
		}
		raw[k] = make([]GeoPoint, gridSize)
		u := make([]float64, b.End-b.Start)
		for i := range u {
			u[i] = dist[b.Start+i] / b.LapLength
			if !finite(u[i]) || u[i] < 0 {
				return nil, fmt.Errorf("u")
			}
		}
		for j := 0; j < gridSize; j++ {
			target := (float64(j) + .5) / gridSize
			la, e := interpolateCyclic(u, lat[b.Start:b.End], target)
			if e != nil {
				return nil, e
			}
			lo, e := interpolateCyclic(u, lon[b.Start:b.End], target)
			if e != nil {
				return nil, e
			}
			if !finite(la) || !finite(lo) {
				return nil, fmt.Errorf("coordinate")
			}
			raw[k][j] = GeoPoint{la, lo}
		}
	}
	return raw, nil
}
