package lmu

import (
	"context"
	"encoding/binary"
	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"math"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestTrackLengthObservedScalarAndSanitization(t *testing.T) {
	original := readPinnedLMU13Fixture(t, "lmu-fixture.bin", "959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff")
	for _, tc := range []struct {
		name    string
		value   float64
		quality schema.Freshness
	}{
		{"observed", 4655.10986328125, schema.FreshnessFresh},
		{"absent", 0, schema.FreshnessMissing},
		{"negative", -1, schema.FreshnessInvalid},
		{"nan", math.NaN(), schema.FreshnessInvalid},
		{"infinite", math.Inf(1), schema.FreshnessInvalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			buf := append([]byte(nil), original...)
			binary.LittleEndian.PutUint64(buf[1720:], math.Float64bits(tc.value))
			observed, err := parseSupported(buf, time.Unix(100, 0))
			if err != nil {
				t.Fatal(err)
			}
			if observed.TrackLength.Freshness() != tc.quality {
				t.Fatalf("length=%+v want quality%v", observed.TrackLength, tc.quality)
			}
			if tc.quality == schema.FreshnessFresh {
				value, present := observed.TrackLength.Value()
				if !present || float64(value) != tc.value {
					t.Fatalf("length=%v present=%v", value, present)
				}
			}
		})
	}
}

func TestTrackLengthFusionMapperQualityAndSessionReplacement(t *testing.T) {
	wall := time.Unix(920, 0).UTC()
	first := sharedObservation(wall, "Track A")
	first.TrackLength = observed(standings.LapDistance(5000))
	state := new(Fusion)
	fused := state.Merge(wall, 0, first)
	var got core.Batch
	sink := core.BatchSinkFunc(func(_ context.Context, batch core.Batch) error { got = batch; return nil })
	mapper := NewBatchMapper()
	if err := mapper.WriteObservation(context.Background(), fused, sink); err != nil {
		t.Fatal(err)
	}
	value, present := got.State.TrackLength.Value()
	if !present || value != 5000 || got.State.TrackLength.Freshness() != schema.FreshnessFresh {
		t.Fatalf("length=%+v", got.State.TrackLength)
	}
	aged := state.Merge(wall.Add(time.Second), time.Second)
	if aged.TrackLength.Freshness() != schema.FreshnessStale {
		t.Fatalf("TTL length=%+v", aged.TrackLength)
	}
	second := sharedObservation(wall.Add(2*time.Second), "Track B")
	replaced := state.Merge(wall.Add(2*time.Second), 2*time.Second, second)
	if err := mapper.WriteObservation(context.Background(), replaced, sink); err != nil {
		t.Fatal(err)
	}
	if _, present := got.State.TrackLength.Value(); present {
		t.Fatalf("old session length retained:%+v", got.State.TrackLength)
	}
}
