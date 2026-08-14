package main

import (
	"context"
	"fmt"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"math"
	"time"
)

type syntheticSpec struct {
	group, laps int
	phi         []float64
}
type syntheticMutation uint8

const (
	syntheticNone syntheticMutation = iota
	syntheticNonrigid11
	syntheticConstantOrdinal1
)

type syntheticBackend struct {
	items         []InventoryItem
	specs         []syntheticSpec
	logicalBudget *logicalBudgetV1
}

func (b *syntheticBackend) setLogicalBudget(x *logicalBudgetV1) { b.logicalBudget = x }

func newSyntheticBackend() *syntheticBackend {
	specs := []syntheticSpec{{1, 2, []float64{0, math.Pi / 2}}, {1, 3, []float64{math.Pi, -math.Pi / 2, 0}}, {2, 2, []float64{math.Pi / 2, math.Pi}}}
	b := &syntheticBackend{specs: specs}
	for i := range specs {
		b.items = append(b.items, InventoryItem{ID: fmt.Sprintf("candidate-%d", i), Modified: time.Unix(int64(i), 0), Size: uint64(i + 1), Regular: true, WALAbsent: true, Stable: true})
	}
	return b
}
func (*syntheticBackend) Preflight(context.Context, RunConfig) error { return nil }
func (b *syntheticBackend) Discover(context.Context) ([]InventoryItem, error) {
	return append([]InventoryItem(nil), b.items...), nil
}
func (b *syntheticBackend) Cleanup() error { return nil }
func (*syntheticBackend) Ledger() Cleanup  { return Cleanup{} }
func (b *syntheticBackend) Process(ctx context.Context, item InventoryItem) (CandidateResult, error) {
	var idx int
	if _, e := fmt.Sscanf(item.ID, "candidate-%d", &idx); e != nil || idx < 0 || idx >= len(b.specs) {
		return CandidateResult{}, fmt.Errorf("candidate")
	}
	s := b.specs[idx]
	return (&productionBackend{logicalBudget: b.logicalBudget}).materialize(ctx, buildSyntheticParser(idx, s, syntheticNone, 100))
}

// buildSyntheticParser draws laps on an ellipse of semi axes r x ry. ry == r
// reproduces the frozen TA-04F7 circle; a distinct ry gives the anisotropic
// fixture the TA-04F8 canonical frame needs.
func buildSyntheticParser(idx int, s syntheticSpec, mutation syntheticMutation, ry float64) *syntheticParser {
	const geometryHz = 10.0
	const gpsTimeHz = 100.0
	r := 100.0
	c := 2 * math.Pi * r
	n := (s.laps + 2) * gridSize
	values := map[string][]telemetryanalysis.HistoricalSample{}
	for _, name := range requiredChannels {
		values[name] = make([]telemetryanalysis.HistoricalSample, 0, n)
	}
	for k := 0; k < s.laps+2; k++ {
		for j := 0; j < gridSize; j++ {
			i := k*gridSize + j
			u := float64(j) / float64(gridSize-1)
			phi := s.phi[max(0, min(s.laps-1, k-1))]
			a := 2*math.Pi*u + phi
			x, y := r*math.Cos(a), ry*math.Sin(a)
			nums := map[string]float64{"GPS Latitude": (y / 6371000) * 180 / math.Pi, "GPS Longitude": (x / 6371000) * 180 / math.Pi, "Lap Dist": c * u, "Total Dist": c*float64(k) + c*u}
			for _, name := range []string{"GPS Latitude", "GPS Longitude", "Lap Dist", "Total Dist"} {
				values[name] = append(values[name], syntheticSample(int64(i), nil, nums[name], telemetryanalysis.ScalarNumber))
			}
		}
	}
	values["GPS Time"] = make([]telemetryanalysis.HistoricalSample, n*10)
	for i := range values["GPS Time"] {
		values["GPS Time"][i] = syntheticSample(int64(i), nil, float64(i)/gpsTimeHz, telemetryanalysis.ScalarNumber)
	}
	values["Lap"] = append(values["Lap"], syntheticSample(0, floatPtr(0), 0, telemetryanalysis.ScalarInteger))
	for m := 1; m <= s.laps+1; m++ {
		values["Lap"] = append(values["Lap"], syntheticSample(int64(m), floatPtr(float64(m*gridSize)/geometryHz), float64(m), telemetryanalysis.ScalarInteger))
	}
	if mutation != syntheticNone {
		start := 2 * gridSize
		for j := 0; j < gridSize; j++ {
			u := float64(j) / float64(gridSize-1)
			radius := 100.0
			if mutation == syntheticNonrigid11 {
				if j%2 == 0 {
					radius = 111
				} else {
					radius = 89
				}
			} else {
				radius = 0
			}
			a := 2 * math.Pi * u
			lat := (radius * math.Sin(a) / 6371000) * 180 / math.Pi
			lon := (radius * math.Cos(a) / 6371000) * 180 / math.Pi
			values["GPS Latitude"][start+j].Values[0].Scalar.Number = lat
			values["GPS Longitude"][start+j].Values[0].Scalar.Number = lon
		}
	}
	return newSyntheticParser(idx, s.group, values)
}

type syntheticParser struct {
	session telemetryanalysis.HistoricalSession
	values  map[string][]telemetryanalysis.HistoricalSample
}

func newSyntheticParser(idx, group int, v map[string][]telemetryanalysis.HistoricalSample) *syntheticParser {
	p := &syntheticParser{values: v}
	p.session.ID = fmt.Sprintf("session-%d", idx)
	for _, k := range []string{"TrackName", "TrackLayout", "CarName", "CarClass"} {
		p.session.Metadata = append(p.session.Metadata, telemetryanalysis.HistoricalMetadata{Key: k, Present: true, Value: fmt.Sprintf("group-%d", group), Quality: telemetryanalysis.QualityValid})
	}
	for _, name := range requiredChannels {
		p.session.Channels = append(p.session.Channels, syntheticChannel(name, false))
	}
	p.session.Channels = append(p.session.Channels, syntheticChannel("Lap", true))
	return p
}
func syntheticChannel(name string, event bool) telemetryanalysis.HistoricalChannel {
	kind := telemetryanalysis.SamplingContinuousImplicitFrequency
	typ := telemetryanalysis.ScalarNumber
	hz := 10
	if name == "GPS Time" {
		hz = 100
	}
	if event {
		kind = telemetryanalysis.SamplingEventTimestamped
		typ = telemetryanalysis.ScalarInteger
		hz = 0
	}
	return telemetryanalysis.HistoricalChannel{ID: name, SourceName: name, Capability: telemetryanalysis.QualityValid, Sampling: telemetryanalysis.HistoricalSampling{Kind: kind, FrequencyHz: hz}, Columns: []telemetryanalysis.HistoricalColumn{{Name: "value", Type: typ}}}
}
func syntheticSample(i int64, t *float64, v float64, k telemetryanalysis.ScalarKind) telemetryanalysis.HistoricalSample {
	x := telemetryanalysis.HistoricalScalar{Kind: k, Number: v, Integer: int64(v)}
	return telemetryanalysis.HistoricalSample{Index: i, TimestampSeconds: t, Values: []telemetryanalysis.HistoricalValue{{Present: true, Quality: telemetryanalysis.QualityValid, Scalar: x}}}
}
func floatPtr(v float64) *float64 { return &v }
func (p *syntheticParser) Inspect(context.Context) (telemetryanalysis.HistoricalSession, error) {
	return p.session, nil
}
func (p *syntheticParser) ReadPage(_ context.Context, id string, start int64, limit int) (telemetryanalysis.HistoricalPage, error) {
	v := p.values[id]
	if start > int64(len(v)) {
		return telemetryanalysis.HistoricalPage{}, fmt.Errorf("start")
	}
	end := int(start) + limit
	if end > len(v) {
		end = len(v)
	}
	return telemetryanalysis.HistoricalPage{ChannelID: id, Start: start, Samples: v[start:end]}, nil
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
