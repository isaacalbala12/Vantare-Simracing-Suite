package derive

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestSelfDeltaRequiresCompletedReferenceAndInterpolatesDocumentedSign(t *testing.T) {
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	sequence := schema.Sequence(0)
	apply := func(lap session.LapNumber, distance standings.LapDistance, at time.Duration) SelfDelta {
		sequence++
		return tracker.Apply(deltaHeader(sequence), deltaObserved(lap, distance, at, false, schema.FreshnessFresh))
	}

	// The first observed lap is partial. The first witnessed wrap synchronizes
	// the tracker; only the next witnessed wrap can complete a reference lap.
	if got := apply(1, 100, 10*time.Second); got.Freshness != schema.FreshnessMissing {
		t.Fatalf("partial first lap delta = %+v", got)
	}
	apply(2, 0, 20*time.Second)
	apply(2, 100, 30*time.Second)
	apply(2, 200, 40*time.Second)
	referenceReady := apply(3, 0, 50*time.Second)
	if referenceReady.Reference.Freshness() != schema.FreshnessFresh {
		t.Fatalf("reference freshness = %v", referenceReady.Reference.Freshness())
	}
	if reference, present := referenceReady.Reference.Value(); !present || reference != session.DeltaReferenceBestCompletedPlayerLap {
		t.Fatalf("reference = (%v,%t)", reference, present)
	}

	faster := apply(3, 100, 59*time.Second)
	assertDeltaSeconds(t, faster, -1)
	if len(faster.History) != 1 || !faster.History[0].CapturedAt.Equal(deltaCapturedAt(6)) {
		t.Fatalf("delta history capture time = %+v, want %s", faster.History, deltaCapturedAt(6))
	}
	slower := apply(3, 150, 66*time.Second)
	assertDeltaSeconds(t, slower, 1)
}

func TestDeltaPrefersFreshNativeBestLapWithoutWarmupAndKeepsDerivedFallback(t *testing.T) {
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	native := deltaObserved(1, 100, 10*time.Second, false, schema.FreshnessFresh)
	native.Vehicles[0].DeltaBest = derivedInput(session.DeltaSeconds(-0.245), schema.FreshnessFresh)
	got := tracker.Apply(deltaHeader(1), native)
	value, present := got.Seconds.Value()
	if !present || value != session.DeltaSeconds(-0.245) || got.Seconds.Freshness() != schema.FreshnessFresh {
		t.Fatalf("native delta = (%v,%t,%v)", value, present, got.Seconds.Freshness())
	}
	if got.Seconds.Provenance() != schema.ProvenanceObserved || got.Reference.Provenance() != schema.ProvenanceObserved {
		t.Fatalf("native delta provenance = seconds:%v reference:%v", got.Seconds.Provenance(), got.Reference.Provenance())
	}

	staleNative := deltaObserved(1, 110, 11*time.Second, false, schema.FreshnessStale)
	staleNative.Vehicles[0].DeltaBest = derivedInput(session.DeltaSeconds(-0.240), schema.FreshnessStale)
	stale := tracker.Apply(deltaHeader(2), staleNative)
	staleValue, stalePresent := stale.Seconds.Value()
	if !stalePresent || staleValue != session.DeltaSeconds(-0.240) || stale.Freshness != schema.FreshnessStale ||
		stale.Seconds.Provenance() != schema.ProvenanceObserved {
		t.Fatalf("stale native delta = %+v", stale)
	}

	missingNative := deltaObserved(2, 0, 20*time.Second, false, schema.FreshnessFresh)
	missingNative.Vehicles[0].DeltaBest = schema.MissingField[session.DeltaSeconds]()
	if fallback := tracker.Apply(deltaHeader(3), missingNative); fallback.Freshness != schema.FreshnessMissing {
		t.Fatalf("fallback before completed reference = %+v", fallback)
	}
}

func TestSelfDeltaKeepsPersonalSessionAndPreviousReferencesIndependent(t *testing.T) {
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	sequence := schema.Sequence(0)
	apply := func(lap session.LapNumber, distance standings.LapDistance, at time.Duration, native session.DeltaSeconds) SelfDelta {
		sequence++
		observed := deltaObserved(lap, distance, at, false, schema.FreshnessFresh)
		observed.Vehicles[0].DeltaBest = derivedInput(native, schema.FreshnessFresh)
		return tracker.Apply(deltaHeader(sequence), observed)
	}

	apply(1, 100, 10*time.Second, -0.40)
	apply(2, 0, 20*time.Second, -0.35)
	apply(2, 100, 30*time.Second, -0.30)
	apply(2, 200, 40*time.Second, -0.25)
	apply(3, 0, 50*time.Second, -0.20) // lap 2: 30 seconds
	apply(3, 100, 58*time.Second, -0.15)
	apply(3, 200, 66*time.Second, -0.10)
	apply(4, 0, 74*time.Second, -0.05) // lap 3: 24 seconds, new session best
	got := apply(4, 100, 83*time.Second, 0.125)

	assertReferenceDelta(t, got.PersonalBest, 0.125, schema.ProvenanceObserved)
	assertReferenceDelta(t, got.SessionBest, 1, schema.ProvenanceDerived)
	assertReferenceDelta(t, got.PreviousLap, 1, schema.ProvenanceDerived)

	// A slower completed lap becomes "previous", but must not replace the
	// session-best curve.
	apply(4, 200, 94*time.Second, 0.20)
	apply(5, 0, 105*time.Second, 0.25) // lap 4: 31 seconds
	got = apply(5, 100, 113*time.Second, 0.30)
	assertReferenceDelta(t, got.PersonalBest, 0.30, schema.ProvenanceObserved)
	assertReferenceDelta(t, got.SessionBest, 0, schema.ProvenanceDerived)
	assertReferenceDelta(t, got.PreviousLap, -1, schema.ProvenanceDerived)
}

func TestNativePersonalDeltaReplacesDerivedHistoryForSameCursor(t *testing.T) {
	tracker := readyDeltaTracker(t)
	observed := deltaObserved(3, 100, 59*time.Second, false, schema.FreshnessFresh)
	observed.Vehicles[0].DeltaBest = derivedInput(session.DeltaSeconds(-0.245), schema.FreshnessFresh)

	got := tracker.Apply(deltaHeader(6), observed)

	if len(got.History) != 1 || got.History[0].Seconds != session.DeltaSeconds(-0.245) {
		t.Fatalf("native history = %+v, want the displayed personal delta", got.History)
	}
}

func assertReferenceDelta(t testing.TB, field schema.Field[session.DeltaSeconds], want session.DeltaSeconds, provenance schema.Provenance) {
	t.Helper()
	got, present := field.Value()
	if !present || field.Freshness() != schema.FreshnessFresh || field.Provenance() != provenance || math.Abs(float64(got-want)) > 1e-9 {
		t.Fatalf("reference delta = (%v,%t,%v,%v), want (%v,true,fresh,%v)", got, present, field.Freshness(), field.Provenance(), want, provenance)
	}
}

func TestSelfDeltaPromotesOnlyValidNonPitMonotonicLaps(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*core.ObservedState)
	}{
		{name: "pit", mutate: func(state *core.ObservedState) {
			state.Vehicles[0].InPit = derivedInput(pit.InPit(true), schema.FreshnessFresh)
		}},
		{name: "distance regression", mutate: func(state *core.ObservedState) {
			state.Vehicles[0].LapDistance = derivedInput(standings.LapDistance(0), schema.FreshnessFresh)
		}},
		{name: "invalid distance", mutate: func(state *core.ObservedState) {
			state.Vehicles[0].LapDistance = derivedInput(standings.LapDistance(math.NaN()), schema.FreshnessFresh)
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
			tracker.Apply(deltaHeader(1), deltaObserved(1, 100, 10*time.Second, false, schema.FreshnessFresh))
			tracker.Apply(deltaHeader(2), deltaObserved(2, 0, 20*time.Second, false, schema.FreshnessFresh))
			tracker.Apply(deltaHeader(3), deltaObserved(2, 100, 30*time.Second, false, schema.FreshnessFresh))
			bad := deltaObserved(2, 150, 35*time.Second, false, schema.FreshnessFresh)
			test.mutate(&bad)
			tracker.Apply(deltaHeader(4), bad)
			got := tracker.Apply(deltaHeader(5), deltaObserved(3, 0, 50*time.Second, false, schema.FreshnessFresh))
			if _, present := got.Reference.Value(); present {
				t.Fatalf("invalid lap became reference: %+v", got)
			}
		})
	}
}

func TestSelfDeltaMissingSampleInvalidatesCandidateWithoutInventingOutput(t *testing.T) {
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	tracker.Apply(deltaHeader(1), deltaObserved(1, 100, 10*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(2), deltaObserved(2, 0, 20*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(3), deltaObserved(2, 100, 30*time.Second, false, schema.FreshnessFresh))
	missing := deltaObserved(2, 150, 35*time.Second, false, schema.FreshnessFresh)
	missing.Vehicles[0].LapDistance = schema.MissingField[standings.LapDistance]()
	if got := tracker.Apply(deltaHeader(4), missing); got.Freshness != schema.FreshnessMissing {
		t.Fatalf("missing sample delta = %+v", got)
	}
	tracker.Apply(deltaHeader(5), deltaObserved(2, 200, 40*time.Second, false, schema.FreshnessFresh))
	got := tracker.Apply(deltaHeader(6), deltaObserved(3, 0, 50*time.Second, false, schema.FreshnessFresh))
	if _, present := got.Reference.Value(); present {
		t.Fatal("incomplete candidate became a reference after a missing sample")
	}
}

func TestSelfDeltaPrivateAndConsumerHistoriesAreIndependentlyBounded(t *testing.T) {
	const limit = 4
	private := newSelfDeltaTracker(limit)
	private.Apply(deltaHeader(1), deltaObserved(1, 100, time.Second, false, schema.FreshnessFresh))
	private.Apply(deltaHeader(2), deltaObserved(2, 0, 2*time.Second, false, schema.FreshnessFresh))
	for sequence := schema.Sequence(3); sequence <= 8; sequence++ {
		private.Apply(deltaHeader(sequence), deltaObserved(2, standings.LapDistance(sequence*10), time.Duration(sequence)*time.Second, false, schema.FreshnessFresh))
		if len(private.candidate) > limit {
			t.Fatalf("private samples = %d, limit %d", len(private.candidate), limit)
		}
	}

	public := newSelfDeltaTracker(MaxSelfDeltaSamples)
	public.Apply(deltaHeader(1), deltaObserved(1, 100, time.Second, false, schema.FreshnessFresh))
	public.Apply(deltaHeader(2), deltaObserved(2, 0, 2*time.Second, false, schema.FreshnessFresh))
	public.Apply(deltaHeader(3), deltaObserved(2, 1000, 12*time.Second, false, schema.FreshnessFresh))
	public.Apply(deltaHeader(4), deltaObserved(3, 0, 22*time.Second, false, schema.FreshnessFresh))
	var got SelfDelta
	for sequence := schema.Sequence(5); sequence <= 204; sequence++ {
		distance := standings.LapDistance(sequence - 4)
		got = public.Apply(deltaHeader(sequence), deltaObserved(3, distance, 22*time.Second+time.Duration(sequence-4)*100*time.Millisecond, false, schema.FreshnessFresh))
	}
	if len(got.History) != MaxSelfDeltaHistory {
		t.Fatalf("public history = %d, want bounded tail %d", len(got.History), MaxSelfDeltaHistory)
	}
	if got.History[0].Cursor.Sequence <= 5 {
		t.Fatalf("public history retained the unbounded prefix: first=%d", got.History[0].Cursor.Sequence)
	}
}

func TestSelfDeltaRejectsUnprovenPlayerAndObservedProvenance(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*core.ObservedState)
	}{
		{name: "player absent", mutate: func(state *core.ObservedState) {
			state.PlayerPresent = derivedInput(false, schema.FreshnessFresh)
		}},
		{name: "row not player", mutate: func(state *core.ObservedState) {
			state.Vehicles[0].Player = derivedInput(false, schema.FreshnessFresh)
		}},
		{name: "derived source time", mutate: func(state *core.ObservedState) {
			field, err := schema.NewField(time.Second, schema.ProvenanceDerived, schema.FreshnessFresh)
			if err != nil {
				t.Fatal(err)
			}
			state.SourceTime = field
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state := deltaObserved(1, 100, time.Second, false, schema.FreshnessFresh)
			test.mutate(&state)
			got := newSelfDeltaTracker(MaxSelfDeltaSamples).Apply(deltaHeader(1), state)
			if got.Freshness == schema.FreshnessFresh {
				t.Fatalf("unproven input produced fresh delta: %+v", got)
			}
		})
	}
}

func TestSelfDeltaLapRegressionClearsReference(t *testing.T) {
	tracker := readyDeltaTracker(t)
	before := tracker.Apply(deltaHeader(6), deltaObserved(3, 100, 59*time.Second, false, schema.FreshnessFresh))
	if _, present := before.Reference.Value(); !present {
		t.Fatal("test precondition: reference missing")
	}
	after := tracker.Apply(deltaHeader(7), deltaObserved(2, 150, 60*time.Second, false, schema.FreshnessFresh))
	if _, present := after.Reference.Value(); present || len(after.History) != 0 {
		t.Fatalf("lap regression retained reference/history: %+v", after)
	}
}

func TestSelfDeltaLapRegressionClearsReferenceOnSpecialPaths(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(*selfDeltaTracker)
		input   core.ObservedState
	}{
		{
			name:  "equal source time",
			input: deltaObserved(2, 150, 50*time.Second, false, schema.FreshnessFresh),
		},
		{
			name: "pending distance-first wrap",
			prepare: func(tracker *selfDeltaTracker) {
				tracker.Apply(deltaHeader(6), deltaObserved(3, 500, 60*time.Second, false, schema.FreshnessFresh))
				tracker.Apply(deltaHeader(7), deltaObserved(3, 0, 61*time.Second, false, schema.FreshnessFresh))
			},
			input: deltaObserved(2, 10, 61*time.Second+200*time.Millisecond, false, schema.FreshnessFresh),
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			tracker := readyDeltaTracker(t)
			if test.prepare != nil {
				test.prepare(tracker)
			}
			got := tracker.Apply(deltaHeader(8), test.input)
			if _, present := got.Reference.Value(); present || len(got.History) != 0 {
				t.Fatalf("lap regression retained reference/history: %+v", got)
			}
		})
	}
}

func TestSelfDeltaAcceptsBoundedLMULapNumberDistanceResetSkew(t *testing.T) {
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	sequence := schema.Sequence(0)
	apply := func(lap session.LapNumber, distance standings.LapDistance, at time.Duration) SelfDelta {
		sequence++
		return tracker.Apply(deltaHeader(sequence), deltaObserved(lap, distance, at, false, schema.FreshnessFresh))
	}
	apply(1, 900, 10*time.Second)
	apply(2, 950, 20*time.Second)
	apply(2, 10, 20*time.Second+100*time.Millisecond)
	apply(2, 500, 30*time.Second)
	apply(3, 980, 40*time.Second)
	reference := apply(3, 20, 40*time.Second+100*time.Millisecond)
	if _, present := reference.Reference.Value(); !present {
		t.Fatalf("bounded wrap skew did not produce reference: %+v", reference)
	}
	got := apply(3, 500, 51*time.Second)
	if got.Freshness != schema.FreshnessFresh {
		t.Fatalf("bounded wrap skew did not produce delta: %+v", got)
	}
}

func TestSelfDeltaAcceptsBoundedLMUDistanceResetBeforeLapNumber(t *testing.T) {
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	sequence := schema.Sequence(0)
	apply := func(lap session.LapNumber, distance standings.LapDistance, at time.Duration) SelfDelta {
		sequence++
		return tracker.Apply(deltaHeader(sequence), deltaObserved(lap, distance, at, false, schema.FreshnessFresh))
	}
	apply(1, 900, 10*time.Second)
	apply(1, 10, 20*time.Second)
	apply(2, 20, 20*time.Second+200*time.Millisecond)
	apply(2, 500, 30*time.Second)
	apply(2, 10, 40*time.Second)
	reference := apply(3, 20, 40*time.Second+200*time.Millisecond)
	if _, present := reference.Reference.Value(); !present {
		t.Fatalf("distance-first wrap skew did not produce reference: %+v", reference)
	}
	got := apply(3, 500, 51*time.Second)
	if got.Freshness != schema.FreshnessFresh {
		t.Fatalf("distance-first wrap skew did not produce delta: %+v", got)
	}
}

func TestSelfDeltaEpochResetClearsReferenceAndHistory(t *testing.T) {
	tracker := readyDeltaTracker(t)
	withHistory := tracker.Apply(deltaHeader(6), deltaObserved(3, 100, 59*time.Second, false, schema.FreshnessFresh))
	if _, present := withHistory.Reference.Value(); !present || len(withHistory.History) == 0 {
		t.Fatal("test precondition: expected reference and history")
	}
	header := deltaHeader(1)
	header.Cursor.Epoch = 2
	reset := tracker.Apply(header, deltaObserved(1, 100, time.Second, false, schema.FreshnessFresh))
	if _, present := reset.Reference.Value(); present || len(reset.History) != 0 || reset.Freshness != schema.FreshnessMissing {
		t.Fatalf("epoch reset retained delta state: %+v", reset)
	}
}

func TestSelfDeltaIgnoresIdenticalRepeatedLMUFrames(t *testing.T) {
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	tracker.Apply(deltaHeader(1), deltaObserved(1, 100, 10*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(2), deltaObserved(1, 100, 10*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(3), deltaObserved(2, 0, 20*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(4), deltaObserved(2, 0, 20*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(5), deltaObserved(2, 100, 30*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(6), deltaObserved(2, 200, 40*time.Second, false, schema.FreshnessFresh))
	got := tracker.Apply(deltaHeader(7), deltaObserved(3, 0, 50*time.Second, false, schema.FreshnessFresh))
	if _, present := got.Reference.Value(); !present {
		t.Fatalf("identical repeated frames invalidated the reference lap: %+v", got)
	}
}

func TestSelfDeltaRealLMUTraceMatchesMeasuredSameDistanceSign(t *testing.T) {
	tracePath := filepath.Join("testdata", "lmu-1.4-self-delta-trace-v1.jsonl")
	goldenPath := filepath.Join("testdata", "lmu-1.4-self-delta-trace-v1.golden.json")
	traceData, err := os.ReadFile(tracePath)
	if err != nil {
		t.Fatal(err)
	}
	goldenData, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatal(err)
	}
	var golden realDeltaTraceGolden
	if err := json.Unmarshal(goldenData, &golden); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(traceData)
	if got := hex.EncodeToString(digest[:]); got != golden.TraceSHA256 {
		t.Fatalf("trace SHA-256 = %s, want %s", got, golden.TraceSHA256)
	}

	wantKeys := []string{
		"elapsed_offset_ns", "in_pit", "lap_distance_m", "lap_number", "quality",
		"sample_index", "source_time_ns", "speed_mps", "version",
	}
	var samples []realDeltaTraceSample
	scanner := bufio.NewScanner(bytes.NewReader(traceData))
	for scanner.Scan() {
		line := scanner.Bytes()
		var document map[string]any
		if err := json.Unmarshal(line, &document); err != nil {
			t.Fatal(err)
		}
		keys := make([]string, 0, len(document))
		for key := range document {
			keys = append(keys, key)
		}
		slicesSortStrings(keys)
		if !reflect.DeepEqual(keys, wantKeys) {
			t.Fatalf("trace keys = %v, want exact allowlist %v", keys, wantKeys)
		}
		var sample realDeltaTraceSample
		if err := json.Unmarshal(line, &sample); err != nil {
			t.Fatal(err)
		}
		samples = append(samples, sample)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if len(samples) != golden.SampleCount {
		t.Fatalf("trace samples = %d, want %d", len(samples), golden.SampleCount)
	}

	wraps := make([]int, 0, 3)
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	outputs := make([]SelfDelta, len(samples))
	for index, sample := range samples {
		if sample.Version != golden.Version || sample.SampleIndex != index || sample.Quality != "fresh" || sample.InPit {
			t.Fatalf("invalid sanitized trace sample %d: %+v", index, sample)
		}
		if index > 0 {
			if sample.ElapsedOffsetNS-samples[index-1].ElapsedOffsetNS != int64(time.Second)/int64(golden.SampleFrequencyHz) {
				t.Fatalf("trace cadence changed at sample %d", index)
			}
			if sample.SourceTimeNS <= samples[index-1].SourceTimeNS {
				t.Fatalf("source time is not monotonic at sample %d", index)
			}
			if samples[index-1].LapDistanceMeters-sample.LapDistanceMeters >= float64(selfDeltaWrapMinimumDrop) {
				wraps = append(wraps, index)
			}
		}
		outputs[index] = tracker.Apply(
			deltaHeader(schema.Sequence(index+1)),
			deltaObserved(
				session.LapNumber(sample.LapNumber),
				standings.LapDistance(sample.LapDistanceMeters),
				time.Duration(sample.SourceTimeNS),
				sample.InPit,
				schema.FreshnessFresh,
			),
		)
	}
	if !reflect.DeepEqual(wraps, golden.WrapSampleIndices) {
		t.Fatalf("real trace wraps = %v, want %v", wraps, golden.WrapSampleIndices)
	}
	if len(wraps)-1 != golden.CompletedComparableLaps {
		t.Fatalf("comparable laps = %d, want %d", len(wraps)-1, golden.CompletedComparableLaps)
	}
	if len(wraps) < 3 {
		t.Fatal("real trace does not contain two complete comparable laps")
	}
	firstDuration := samples[wraps[1]].SourceTimeNS - samples[wraps[0]].SourceTimeNS
	secondDuration := samples[wraps[2]].SourceTimeNS - samples[wraps[1]].SourceTimeNS
	if firstDuration != golden.FirstLapDurationNS || secondDuration != golden.SecondLapDurationNS {
		t.Fatalf("real lap durations = %d/%d, want %d/%d", firstDuration, secondDuration, golden.FirstLapDurationNS, golden.SecondLapDurationNS)
	}
	if golden.SecondLapExpectedSign != "negative" || secondDuration >= firstDuration {
		t.Fatalf("real comparison summary is inconsistent: %+v", golden)
	}

	reference := samples[wraps[0]:wraps[1]]
	comparisonStart := samples[wraps[1]].SourceTimeNS
	compared := 0
	significant := 0
	for index := wraps[1]; index < wraps[2]; index++ {
		derived, present := outputs[index].Seconds.Value()
		if !present || outputs[index].Freshness != schema.FreshnessFresh {
			continue
		}
		referenceElapsed, ok := interpolateRecordedTrace(reference, samples[index].LapDistanceMeters)
		if !ok {
			continue
		}
		measured := float64(samples[index].SourceTimeNS-comparisonStart-referenceElapsed) / float64(time.Second)
		if math.Abs(measured) <= 1e-6 || math.Abs(float64(derived)) <= 1e-6 {
			continue
		}
		compared++
		if math.Signbit(measured) != math.Signbit(float64(derived)) {
			t.Fatalf("delta sign mismatch at sample %d distance %.3f: measured=%f derived=%f", index, samples[index].LapDistanceMeters, measured, derived)
		}
		threshold := float64(golden.SampleUncertaintyNS) / float64(time.Second)
		if math.Abs(measured) > threshold && math.Abs(float64(derived)) > threshold {
			significant++
		}
	}
	if compared == 0 {
		t.Fatal("real trace produced no non-zero comparable same-distance delta")
	}
	if significant == 0 {
		t.Fatalf("real trace produced no delta above the pinned %s sample uncertainty", time.Duration(golden.SampleUncertaintyNS))
	}
	if _, present := outputs[len(outputs)-1].Reference.Value(); !present {
		t.Fatal("real trace did not leave a completed player-lap reference")
	}
}

type realDeltaTraceSample struct {
	Version           int     `json:"version"`
	SampleIndex       int     `json:"sample_index"`
	ElapsedOffsetNS   int64   `json:"elapsed_offset_ns"`
	SourceTimeNS      int64   `json:"source_time_ns"`
	LapNumber         int64   `json:"lap_number"`
	LapDistanceMeters float64 `json:"lap_distance_m"`
	SpeedMPS          float64 `json:"speed_mps"`
	InPit             bool    `json:"in_pit"`
	Quality           string  `json:"quality"`
}

type realDeltaTraceGolden struct {
	Version                 int    `json:"version"`
	TraceSHA256             string `json:"trace_sha256"`
	SampleCount             int    `json:"sample_count"`
	SampleFrequencyHz       int    `json:"sample_frequency_hz"`
	WrapSampleIndices       []int  `json:"wrap_sample_indices"`
	CompletedComparableLaps int    `json:"completed_comparable_laps"`
	FirstLapDurationNS      int64  `json:"first_lap_duration_ns"`
	SecondLapDurationNS     int64  `json:"second_lap_duration_ns"`
	SecondLapExpectedSign   string `json:"second_lap_expected_sign"`
	SampleUncertaintyNS     int64  `json:"sample_uncertainty_ns"`
}

func interpolateRecordedTrace(samples []realDeltaTraceSample, distance float64) (int64, bool) {
	if len(samples) < 2 || distance < samples[0].LapDistanceMeters || distance > samples[len(samples)-1].LapDistanceMeters {
		return 0, false
	}
	for index := 0; index+1 < len(samples); index++ {
		left, right := samples[index], samples[index+1]
		if distance < left.LapDistanceMeters || distance > right.LapDistanceMeters {
			continue
		}
		span := right.LapDistanceMeters - left.LapDistanceMeters
		if span <= 0 {
			return 0, false
		}
		ratio := (distance - left.LapDistanceMeters) / span
		leftElapsed := left.SourceTimeNS - samples[0].SourceTimeNS
		rightElapsed := right.SourceTimeNS - samples[0].SourceTimeNS
		return leftElapsed + int64(ratio*float64(rightElapsed-leftElapsed)), true
	}
	return 0, false
}

func slicesSortStrings(values []string) {
	for index := 1; index < len(values); index++ {
		for current := index; current > 0 && values[current] < values[current-1]; current-- {
			values[current], values[current-1] = values[current-1], values[current]
		}
	}
}

func readyDeltaTracker(t testing.TB) *selfDeltaTracker {
	t.Helper()
	tracker := newSelfDeltaTracker(MaxSelfDeltaSamples)
	tracker.Apply(deltaHeader(1), deltaObserved(1, 100, 10*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(2), deltaObserved(2, 0, 20*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(3), deltaObserved(2, 100, 30*time.Second, false, schema.FreshnessFresh))
	tracker.Apply(deltaHeader(4), deltaObserved(2, 200, 40*time.Second, false, schema.FreshnessFresh))
	got := tracker.Apply(deltaHeader(5), deltaObserved(3, 0, 50*time.Second, false, schema.FreshnessFresh))
	if _, present := got.Reference.Value(); !present {
		t.Fatal("reference setup failed")
	}
	return tracker
}

func FuzzSelfDeltaStateMachine(f *testing.F) {
	f.Add(uint8(1), 10.0, int64(1_000_000_000), false)
	f.Add(uint8(2), math.NaN(), int64(-1), true)
	f.Fuzz(func(t *testing.T, lap uint8, distance float64, nanos int64, inPit bool) {
		tracker := newSelfDeltaTracker(32)
		for sequence := schema.Sequence(1); sequence <= 16; sequence++ {
			got := tracker.Apply(
				deltaHeader(sequence),
				deltaObserved(session.LapNumber(lap), standings.LapDistance(distance), time.Duration(nanos), inPit, schema.FreshnessFresh),
			)
			if len(got.History) > 32 {
				t.Fatalf("unbounded history %d", len(got.History))
			}
		}
	})
}

func deltaHeader(sequence schema.Sequence) envelope.Header {
	return envelope.Header{
		Cursor: schema.Cursor{Epoch: 1, Sequence: sequence},
		Clock: schema.NewClock(
			schema.MissingField[time.Duration](),
			schema.MissingField[time.Duration](),
			deltaCapturedAt(sequence),
		),
		Identity: identity.RunIdentity{
			Event: "event", Session: "session", Vehicle: "player",
		},
	}
}

func deltaCapturedAt(sequence schema.Sequence) time.Time {
	return time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC).
		Add(time.Duration(sequence) * 100 * time.Millisecond)
}

func deltaObserved(lap session.LapNumber, distance standings.LapDistance, at time.Duration, inPit bool, freshness schema.Freshness) core.ObservedState {
	return core.ObservedState{
		SourceTime:    derivedInput(at, freshness),
		PlayerPresent: derivedInput(true, freshness),
		Vehicles: []core.VehicleState{{
			Identity:    identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player"},
			Player:      derivedInput(true, freshness),
			LapNumber:   derivedInput(lap, freshness),
			LapDistance: derivedInput(distance, freshness),
			InPit:       derivedInput(pit.InPit(inPit), freshness),
		}},
	}
}

func assertDeltaSeconds(t testing.TB, delta SelfDelta, want session.DeltaSeconds) {
	t.Helper()
	got, present := delta.Seconds.Value()
	if !present || delta.Seconds.Freshness() != schema.FreshnessFresh || math.Abs(float64(got-want)) > 1e-9 {
		t.Fatalf("delta = (%v,%t,%v), want %v", got, present, delta.Seconds.Freshness(), want)
	}
	if delta.Seconds.Provenance() != schema.ProvenanceDerived {
		t.Fatalf("delta provenance = %v", delta.Seconds.Provenance())
	}
}

func BenchmarkSelfDeltaTracker(b *testing.B) {
	tracker := readyDeltaTracker(b)
	b.ReportAllocs()
	for index := 0; index < b.N; index++ {
		sequence := schema.Sequence(index + 6)
		distance := standings.LapDistance(1 + index%199)
		tracker.Apply(deltaHeader(sequence), deltaObserved(3, distance, 50*time.Second+time.Duration(index+1)*100*time.Millisecond, false, schema.FreshnessFresh))
		if distance == 199 {
			tracker = readyDeltaTracker(b)
		}
	}
}
