package lmu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestDeltaTraceCompletesOnlyAfterTwoComparableNonPitLapsAndIsSanitized(t *testing.T) {
	var elapsed time.Duration
	completed := false
	collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() { completed = true })
	write := func(lap session.LapNumber, distance standings.LapDistance, source time.Duration, inPit bool) {
		t.Helper()
		observation := deltaTraceObservation(lap, distance, source, inPit, schema.FreshnessFresh)
		observation.Vehicles[0].DriverName = traceObserved(identity.DriverName("DRIVER-CANARY"), schema.FreshnessFresh)
		if err := collector.WriteObservation(context.Background(), observation); err != nil {
			t.Fatal(err)
		}
		elapsed += 100 * time.Millisecond
	}

	write(1, 100, 10*time.Second, false)
	write(2, 0, 20*time.Second, false)
	write(2, 100, 30*time.Second, false)
	write(2, 200, 40*time.Second, false)
	write(3, 0, 50*time.Second, false)
	if completed {
		t.Fatal("trace completed after only one comparable lap")
	}
	write(3, 100, 61*time.Second, false)
	write(3, 200, 72*time.Second, false)
	write(4, 0, 83*time.Second, false)
	if !completed {
		t.Fatal("trace did not complete after two comparable laps")
	}

	artifact, err := collector.Artifact()
	if err != nil {
		t.Fatal(err)
	}
	if artifact.Summary().CompletedLaps != 2 || artifact.Summary().Samples != 8 || len(artifact.SHA256()) != 64 {
		t.Fatalf("artifact summary/hash = %+v / %q", artifact.Summary(), artifact.SHA256())
	}
	if strings.Contains(string(artifact.Bytes()), "DRIVER-CANARY") {
		t.Fatal("trace leaked driver identity")
	}

	wantKeys := []string{
		"elapsed_offset_ns", "in_pit", "lap_distance_m", "lap_number", "quality",
		"sample_index", "source_time_ns", "speed_mps", "version",
	}
	for _, line := range strings.Split(strings.TrimSpace(string(artifact.Bytes())), "\n") {
		var document map[string]any
		if err := json.Unmarshal([]byte(line), &document); err != nil {
			t.Fatal(err)
		}
		gotKeys := make([]string, 0, len(document))
		for key := range document {
			gotKeys = append(gotKeys, key)
		}
		slicesSort(gotKeys)
		if !reflect.DeepEqual(gotKeys, wantKeys) {
			t.Fatalf("trace keys = %v, want %v", gotKeys, wantKeys)
		}
	}
}

func TestDeltaTraceSamplesAtMostTenHertzAndRequiresCompleteTrace(t *testing.T) {
	var elapsed time.Duration
	collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() {})
	for index := 0; index < 100; index++ {
		if err := collector.WriteObservation(context.Background(), deltaTraceObservation(1, standings.LapDistance(index), time.Duration(index)*16*time.Millisecond, false, schema.FreshnessFresh)); err != nil {
			t.Fatal(err)
		}
		elapsed += 16 * time.Millisecond
	}
	if len(collector.samples) > 17 {
		t.Fatalf("sampled %d rows in 1.6s, exceeds 10 Hz", len(collector.samples))
	}
	if _, err := collector.Artifact(); !errors.Is(err, ErrDeltaTraceIncomplete) {
		t.Fatalf("Artifact error = %v, want incomplete", err)
	}
}

func TestDeltaTracePitOrMissingInputInvalidatesCurrentComparableLap(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Observation)
	}{
		{name: "pit", mutate: func(observation *Observation) {
			observation.Vehicles[0].InPit = traceObserved(pit.InPit(true), schema.FreshnessFresh)
		}},
		{name: "missing distance", mutate: func(observation *Observation) {
			observation.Vehicles[0].LapDistance = schema.MissingField[standings.LapDistance]()
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var elapsed time.Duration
			collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() {})
			feed := func(observation Observation) {
				t.Helper()
				if err := collector.WriteObservation(context.Background(), observation); err != nil {
					t.Fatal(err)
				}
				elapsed += 100 * time.Millisecond
			}
			feed(deltaTraceObservation(1, 100, 10*time.Second, false, schema.FreshnessFresh))
			feed(deltaTraceObservation(2, 0, 20*time.Second, false, schema.FreshnessFresh))
			bad := deltaTraceObservation(2, 100, 30*time.Second, false, schema.FreshnessFresh)
			test.mutate(&bad)
			feed(bad)
			feed(deltaTraceObservation(2, 200, 40*time.Second, false, schema.FreshnessFresh))
			feed(deltaTraceObservation(3, 0, 50*time.Second, false, schema.FreshnessFresh))
			if collector.progress.completed != 0 {
				t.Fatalf("invalid lap counted as comparable: %+v", collector.progress)
			}
		})
	}
}

func TestDeltaTraceRequiresOverlappingDistanceDomains(t *testing.T) {
	var elapsed time.Duration
	completed := false
	collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() { completed = true })
	feed := func(lap session.LapNumber, distance standings.LapDistance, source time.Duration) {
		t.Helper()
		if err := collector.WriteObservation(context.Background(), deltaTraceObservation(lap, distance, source, false, schema.FreshnessFresh)); err != nil {
			t.Fatal(err)
		}
		elapsed += deltaTraceInterval
	}

	// The first witnessed wrap only synchronizes the collector. The next two
	// complete laps deliberately occupy disjoint distance ranges.
	feed(1, 1500, 10*time.Second)
	feed(2, 1000, 20*time.Second)
	feed(2, 1050, 21*time.Second)
	feed(2, 1100, 22*time.Second)
	feed(3, 0, 30*time.Second)
	feed(3, 50, 31*time.Second)
	feed(3, 100, 32*time.Second)
	feed(4, 0, 40*time.Second)

	if completed || collector.progress.completed != 1 {
		t.Fatalf("disjoint laps were accepted as comparable: %+v", collector.progress)
	}
	if _, err := collector.Artifact(); !errors.Is(err, ErrDeltaTraceIncomplete) {
		t.Fatalf("Artifact error = %v, want incomplete", err)
	}
}

func TestDeltaTraceAcceptsBoundedLMULapNumberDistanceResetSkew(t *testing.T) {
	var elapsed time.Duration
	completed := false
	collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() { completed = true })
	feed := func(lap session.LapNumber, distance standings.LapDistance, source time.Duration) {
		t.Helper()
		if err := collector.WriteObservation(context.Background(), deltaTraceObservation(lap, distance, source, false, schema.FreshnessFresh)); err != nil {
			t.Fatal(err)
		}
		elapsed += 100 * time.Millisecond
	}
	feed(1, 900, 10*time.Second)
	feed(2, 950, 20*time.Second)
	feed(2, 10, 20*time.Second+100*time.Millisecond)
	feed(2, 500, 30*time.Second)
	feed(3, 980, 40*time.Second)
	feed(3, 20, 40*time.Second+100*time.Millisecond)
	feed(3, 500, 50*time.Second)
	feed(4, 990, 60*time.Second)
	feed(4, 30, 60*time.Second+100*time.Millisecond)
	if !completed || collector.progress.completed != 2 {
		t.Fatalf("bounded wrap skew was not accepted: %+v", collector.progress)
	}
}

func TestDeltaTraceAcceptsBoundedLMUDistanceResetBeforeLapNumber(t *testing.T) {
	var elapsed time.Duration
	completed := false
	collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() { completed = true })
	feed := func(lap session.LapNumber, distance standings.LapDistance, source time.Duration) {
		t.Helper()
		if err := collector.WriteObservation(context.Background(), deltaTraceObservation(lap, distance, source, false, schema.FreshnessFresh)); err != nil {
			t.Fatal(err)
		}
		elapsed += 100 * time.Millisecond
	}
	feed(1, 900, 10*time.Second)
	feed(1, 10, 20*time.Second)
	feed(2, 20, 20*time.Second+200*time.Millisecond)
	feed(2, 500, 30*time.Second)
	feed(2, 10, 40*time.Second)
	feed(3, 20, 40*time.Second+200*time.Millisecond)
	feed(3, 500, 50*time.Second)
	feed(3, 10, 60*time.Second)
	feed(4, 20, 60*time.Second+200*time.Millisecond)
	if !completed || collector.progress.completed != 2 {
		t.Fatalf("distance-first wrap skew was not accepted: %+v", collector.progress)
	}
}

func TestDeltaTraceIgnoresIdenticalRepeatedLMUFrames(t *testing.T) {
	var elapsed time.Duration
	collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() {})
	observation := deltaTraceObservation(1, 100, 10*time.Second, false, schema.FreshnessFresh)
	for index := 0; index < 4; index++ {
		if err := collector.WriteObservation(context.Background(), observation); err != nil {
			t.Fatal(err)
		}
		elapsed += 100 * time.Millisecond
	}
	if collector.progress.invalidations != 0 || !collector.progress.hasLast {
		t.Fatalf("identical frames invalidated progress: %+v", collector.progress)
	}
}

func TestDeltaTraceLapRegressionClearsComparisonOnSpecialPaths(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(*deltaTraceProgress)
		sample  DeltaTraceSample
	}{
		{
			name:   "equal source time",
			sample: deltaTraceProgressSample(3, 150, 83*time.Second),
		},
		{
			name: "pending distance-first wrap",
			prepare: func(progress *deltaTraceProgress) {
				progress.Apply(deltaTraceProgressSample(4, 500, 90*time.Second))
				progress.Apply(deltaTraceProgressSample(4, 0, 91*time.Second))
			},
			sample: deltaTraceProgressSample(3, 10, 91*time.Second+200*time.Millisecond),
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			progress := completedDeltaTraceProgress()
			if test.prepare != nil {
				test.prepare(&progress)
			}
			progress.Apply(test.sample)
			if progress.hasComparisonBase || progress.completed != 0 {
				t.Fatalf("lap regression retained comparison: %+v", progress)
			}
		})
	}
}

func completedDeltaTraceProgress() deltaTraceProgress {
	progress := deltaTraceProgress{}
	for _, sample := range []DeltaTraceSample{
		deltaTraceProgressSample(1, 100, 10*time.Second),
		deltaTraceProgressSample(2, 0, 20*time.Second),
		deltaTraceProgressSample(2, 100, 30*time.Second),
		deltaTraceProgressSample(2, 200, 40*time.Second),
		deltaTraceProgressSample(3, 0, 50*time.Second),
		deltaTraceProgressSample(3, 100, 61*time.Second),
		deltaTraceProgressSample(3, 200, 72*time.Second),
		deltaTraceProgressSample(4, 0, 83*time.Second),
	} {
		progress.Apply(sample)
	}
	return progress
}

func deltaTraceProgressSample(lap int64, distance float64, source time.Duration) DeltaTraceSample {
	inPit := false
	sourceNS := int64(source)
	return DeltaTraceSample{
		Version: DeltaTraceVersion, SourceTimeNS: &sourceNS, LapNumber: &lap,
		LapDistanceMeters: &distance, InPit: &inPit, Quality: DeltaTraceFresh,
	}
}

func TestDeltaTraceReplaysHashPinnedRealLMUEvidence(t *testing.T) {
	path := filepath.Join("..", "..", "derive", "testdata", "lmu-1.4-self-delta-trace-v1.jsonl")
	trace, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var elapsed time.Duration
	completed := false
	collector := newDeltaTraceCollector(func() time.Duration { return elapsed }, func() { completed = true })
	for _, line := range strings.Split(strings.TrimSpace(string(trace)), "\n") {
		var sample DeltaTraceSample
		if err := json.Unmarshal([]byte(line), &sample); err != nil {
			t.Fatal(err)
		}
		if sample.Quality != DeltaTraceFresh || sample.SourceTimeNS == nil || sample.LapNumber == nil ||
			sample.LapDistanceMeters == nil || sample.SpeedMetersPerSecond == nil || sample.InPit == nil {
			t.Fatalf("real trace sample is incomplete: %+v", sample)
		}
		elapsed = time.Duration(sample.ElapsedOffsetNS)
		observation := deltaTraceObservation(
			session.LapNumber(*sample.LapNumber),
			standings.LapDistance(*sample.LapDistanceMeters),
			time.Duration(*sample.SourceTimeNS),
			*sample.InPit,
			schema.FreshnessFresh,
		)
		observation.Vehicles[0].SpeedMPS = traceObserved(*sample.SpeedMetersPerSecond, schema.FreshnessFresh)
		if err := collector.WriteObservation(context.Background(), observation); err != nil {
			t.Fatal(err)
		}
	}
	if !completed {
		t.Fatal("real LMU evidence did not close two comparable laps")
	}
	artifact, err := collector.Artifact()
	if err != nil {
		t.Fatal(err)
	}
	if artifact.Summary().Samples != 1846 || artifact.Summary().CompletedLaps != 2 {
		t.Fatalf("real trace summary = %+v", artifact.Summary())
	}
	if !bytes.Equal(artifact.Bytes(), trace) {
		t.Fatal("collector did not reproduce the hash-pinned sanitized trace")
	}
	if artifact.SHA256() != "d8f01beee1380d771e5e29de5dfa9e5de72517e1bf447bc14881ee44df7fe938" {
		t.Fatalf("real trace SHA-256 = %s", artifact.SHA256())
	}
}

func TestCaptureDeltaTraceReturnsDriverFailureAfterCompletedTrace(t *testing.T) {
	driverErr := errors.New("driver failed after capture")
	runner := func(ctx context.Context, sink drivercontract.ObservationSink[Observation]) error {
		collector, ok := sink.(*deltaTraceCollector)
		if !ok {
			t.Fatalf("sink = %T, want *deltaTraceCollector", sink)
		}
		var elapsed time.Duration
		collector.started = 0
		collector.elapsed = func() time.Duration { return elapsed }
		feed := func(lap session.LapNumber, distance standings.LapDistance, source time.Duration) {
			t.Helper()
			if err := sink.WriteObservation(context.Background(), deltaTraceObservation(lap, distance, source, false, schema.FreshnessFresh)); err != nil {
				t.Fatal(err)
			}
			elapsed += deltaTraceInterval
		}
		feed(1, 100, 10*time.Second)
		feed(2, 0, 20*time.Second)
		feed(2, 100, 30*time.Second)
		feed(2, 200, 40*time.Second)
		feed(3, 0, 50*time.Second)
		feed(3, 100, 61*time.Second)
		feed(3, 200, 72*time.Second)
		feed(4, 0, 83*time.Second)
		return driverErr
	}

	artifact, err := captureDeltaTrace(context.Background(), time.Minute, runner)
	if !errors.Is(err, driverErr) {
		t.Fatalf("captureDeltaTrace error = %v, want driver failure", err)
	}
	if len(artifact.Bytes()) != 0 {
		t.Fatal("captureDeltaTrace returned an artifact with a real driver failure")
	}
}

func TestWriteDeltaTraceIsExclusiveAndRemovesFailedPartialFile(t *testing.T) {
	artifact := DeltaTraceArtifact{data: []byte("safe\n")}
	path := filepath.Join(t.TempDir(), "trace.jsonl")
	if err := WriteDeltaTrace(path, artifact); err != nil {
		t.Fatal(err)
	}
	if err := WriteDeltaTrace(path, artifact); err == nil {
		t.Fatal("WriteDeltaTrace overwrote an existing file")
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "safe\n" {
		t.Fatalf("stored trace = %q, %v", got, err)
	}
}

func TestWriteDeltaTraceRemovesDestinationWhenCloseFails(t *testing.T) {
	artifact := DeltaTraceArtifact{data: []byte("safe\n")}
	path := filepath.Join(t.TempDir(), "trace.jsonl")
	closeErr := errors.New("close failed")
	err := writeDeltaTrace(path, artifact, func(path string) (deltaTraceFile, error) {
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return nil, err
		}
		return &closeFailureFile{File: file, err: closeErr}, nil
	})
	if !errors.Is(err, closeErr) {
		t.Fatalf("writeDeltaTrace error = %v, want close failure", err)
	}
	if _, statErr := os.Stat(path); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("failed trace destination remains: %v", statErr)
	}
}

type closeFailureFile struct {
	*os.File
	err error
}

func (file *closeFailureFile) Close() error {
	if err := file.File.Close(); err != nil {
		return err
	}
	return file.err
}

func deltaTraceObservation(lap session.LapNumber, distance standings.LapDistance, source time.Duration, inPit bool, freshness schema.Freshness) Observation {
	return Observation{
		SourceTime:    traceObserved(source, freshness),
		PlayerPresent: traceObserved(true, freshness),
		Vehicles: []VehicleObservation{{
			SourceID:    7,
			Player:      traceObserved(true, freshness),
			LapNumber:   traceObserved(lap, freshness),
			LapDistance: traceObserved(distance, freshness),
			SpeedMPS:    traceObserved(50.0, freshness),
			InPit:       traceObserved(pit.InPit(inPit), freshness),
		}},
	}
}

func traceObserved[T comparable](value T, freshness schema.Freshness) schema.Field[T] {
	field, err := schema.NewField(value, schema.ProvenanceObserved, freshness)
	if err != nil {
		panic(err)
	}
	return field
}

func slicesSort(values []string) {
	for index := 1; index < len(values); index++ {
		for current := index; current > 0 && values[current] < values[current-1]; current-- {
			values[current], values[current-1] = values[current-1], values[current]
		}
	}
}
