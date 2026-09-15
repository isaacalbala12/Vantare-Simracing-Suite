package derive

import (
	"context"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

var pipelineControlsHistoryBenchmarkSink PipelineCandidate

func BenchmarkPipelinePrepareControlsHistory(b *testing.B) {
	for _, current := range []struct {
		name      string
		history   int
		freshness schema.Freshness
	}{
		{name: "empty_fresh", history: 0, freshness: schema.FreshnessFresh},
		{name: "partial_fresh", history: 60, freshness: schema.FreshnessFresh},
		{name: "full_fresh", history: MaxControlsHistory, freshness: schema.FreshnessFresh},
		{name: "full_stale", history: MaxControlsHistory, freshness: schema.FreshnessStale},
		{name: "full_missing", history: MaxControlsHistory, freshness: schema.FreshnessMissing},
	} {
		b.Run(current.name, func(b *testing.B) {
			pipeline := NewPipeline(Config{})
			for sequence := 1; sequence <= current.history; sequence++ {
				snapshot := benchmarkControlsSnapshot(b, schema.Sequence(sequence), schema.FreshnessFresh)
				if _, err := pipeline.Apply(context.Background(), snapshot); err != nil {
					b.Fatal(err)
				}
			}
			snapshot := benchmarkControlsSnapshot(b, schema.Sequence(current.history+1), current.freshness)
			b.ReportAllocs()
			b.ResetTimer()
			for range b.N {
				candidate, err := pipeline.Prepare(context.Background(), snapshot)
				if err != nil {
					b.Fatal(err)
				}
				pipelineControlsHistoryBenchmarkSink = candidate
			}
		})
	}
}

func benchmarkControlsSnapshot(b *testing.B, sequence schema.Sequence, freshness schema.Freshness) envelope.Snapshot[core.ObservedState] {
	b.Helper()
	field := func(value schema.Ratio) schema.Field[schema.Ratio] {
		if freshness == schema.FreshnessMissing {
			return schema.MissingField[schema.Ratio]()
		}
		result, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
		if err != nil {
			b.Fatal(err)
		}
		return result
	}
	identityValue := identity.RunIdentity{Event: "bench-event", Session: "bench-session", Vehicle: "player"}
	player, err := schema.NewField(true, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		b.Fatal(err)
	}
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: sequence},
		Identity: identityValue,
		Clock: schema.NewClock(
			schema.Field[time.Duration]{},
			schema.Field[time.Duration]{},
			time.Unix(0, int64(sequence)),
		),
	}
	state := core.ObservedState{Vehicles: []core.VehicleState{{
		Identity: identityValue,
		Player:   player,
		Throttle: field(.5),
		Brake:    field(.25),
		Clutch:   field(.1),
	}}}
	snapshot, err := envelope.NewSnapshot(header, state, cloneObservedForTest)
	if err != nil {
		b.Fatal(err)
	}
	return snapshot
}
