package derive

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestReducerCoordinatorAndDerivationPipelineComposeWithoutProductWiring(t *testing.T) {
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: 1, Sequence: 1},
		Identity: identity.RunIdentity{
			Event: "event", Session: "session", Vehicle: "vehicle",
		},
	}
	controls, err := schema.NewField(schema.Ratio(.5), schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	batch := core.Batch{
		Header: header,
		State: core.ObservedState{Vehicles: []core.VehicleState{{
			Identity: header.Identity,
			Throttle: controls,
			Brake:    controls,
			Clutch:   controls,
		}}},
	}
	observed, err := core.NewReducer().Apply(batch)
	if err != nil {
		t.Fatalf("reducer: %v", err)
	}
	sink := &factCollector{}
	coordinator := core.NewSessionCoordinator(core.SessionCoordinatorConfig{
		Now: func() time.Time { return time.Unix(1, 0).UTC() },
	})
	if err := coordinator.Apply(context.Background(), observed, sink); err != nil {
		t.Fatalf("coordinator: %v", err)
	}
	if len(sink.facts) != 1 || sink.facts[0].Value().Kind != core.FactSessionStarted {
		t.Fatalf("coordinator facts = %+v", sink.facts)
	}
	final, err := NewPipeline(Config{}).Apply(context.Background(), observed)
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	state, _ := final.Value()
	if len(state.Derived.ControlsHistory.Samples) != 1 {
		t.Fatalf("derived history = %+v", state.Derived.ControlsHistory.Samples)
	}
}

func TestPipelineDerivesSessionRemainingAndRelativeGaps(t *testing.T) {
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: 1},
		Identity: identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player"},
	}
	state := core.ObservedState{
		SourceTime:    derivedInput(25*time.Second, schema.FreshnessFresh),
		EndTime:       derivedInput(session.EndTime(100), schema.FreshnessFresh),
		PlayerPresent: derivedInput(true, schema.FreshnessFresh),
		Vehicles: []core.VehicleState{
			gapVehicle("player", 10, 0, schema.FreshnessFresh),
			gapVehicle("other", 15, 0, schema.FreshnessFresh),
		},
	}
	snapshot, err := envelope.NewSnapshot(header, state, cloneObservedForTest)
	if err != nil {
		t.Fatal(err)
	}
	output, err := NewPipeline(Config{}).Apply(context.Background(), snapshot)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := output.Value()
	remaining, present := got.Derived.SessionRemaining.Value()
	if !present || remaining != 75 || got.Derived.SessionRemaining.Provenance() != schema.ProvenanceDerived {
		t.Fatalf("remaining = (%v,%t,%v)", remaining, present, got.Derived.SessionRemaining.Provenance())
	}
	assertGap(t, got.Derived.Gaps, "other", -5, true, 0)
}

func TestPipelineLapLimitedSessionPreservesMaximumLapsWithoutInventingRemainingTime(t *testing.T) {
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: 1},
		Identity: identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player"},
	}
	state := core.ObservedState{
		SourceTime:  derivedInput(25*time.Second, schema.FreshnessFresh),
		EndTime:     schema.MissingField[session.EndTime](),
		MaximumLaps: derivedInput(session.MaximumLaps(100), schema.FreshnessFresh),
	}
	snapshot, err := envelope.NewSnapshot(header, state, cloneObservedForTest)
	if err != nil {
		t.Fatal(err)
	}
	output, err := NewPipeline(Config{}).Apply(context.Background(), snapshot)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := output.Value()
	maximum, present := got.Observed.MaximumLaps.Value()
	if !present || maximum != 100 {
		t.Fatalf("maximum laps = (%v,%t)", maximum, present)
	}
	if _, present := got.Derived.SessionRemaining.Value(); present || got.Derived.SessionRemaining.Freshness() != schema.FreshnessMissing {
		t.Fatalf("lap-limited session invented remaining time: %+v", got.Derived.SessionRemaining)
	}
}

func TestPipelineSelfDeltaStateSurvivesContinuousSnapshots(t *testing.T) {
	pipeline := NewPipeline(Config{})
	inputs := []struct {
		lap      session.LapNumber
		distance standings.LapDistance
		at       time.Duration
	}{
		{1, 100, 10 * time.Second},
		{2, 0, 20 * time.Second},
		{2, 100, 30 * time.Second},
		{2, 200, 40 * time.Second},
		{3, 0, 50 * time.Second},
		{3, 100, 59 * time.Second},
	}
	var got FinalState
	for index, input := range inputs {
		header := deltaHeader(schema.Sequence(index + 1))
		snapshot, err := envelope.NewSnapshot(header, deltaObserved(input.lap, input.distance, input.at, false, schema.FreshnessFresh), cloneObservedForTest)
		if err != nil {
			t.Fatal(err)
		}
		output, err := pipeline.Apply(context.Background(), snapshot)
		if err != nil {
			t.Fatal(err)
		}
		got, _ = output.Value()
	}
	assertDeltaSeconds(t, got.Derived.Delta, -1)
}

func TestPipelineOverlayTimingMatchesGolden(t *testing.T) {
	pipeline := NewPipeline(Config{})
	inputs := []struct {
		lap      session.LapNumber
		distance standings.LapDistance
		at       time.Duration
	}{
		{1, 100, 10 * time.Second},
		{2, 0, 20 * time.Second},
		{2, 100, 30 * time.Second},
		{2, 200, 40 * time.Second},
		{3, 0, 50 * time.Second},
		{3, 100, 59 * time.Second},
	}
	var final FinalState
	for index, input := range inputs {
		state := deltaObserved(input.lap, input.distance, input.at, false, schema.FreshnessFresh)
		state.EndTime = derivedInput(session.EndTime(1000), schema.FreshnessFresh)
		state.Vehicles[0].TimeBehindLeader = derivedInput(standings.TimeGap(10), schema.FreshnessFresh)
		state.Vehicles[0].LapsBehindLeader = derivedInput(standings.LapGap(0), schema.FreshnessFresh)
		state.Vehicles[0].LapProgressTime = derivedInput(standings.LapProgressTime(-10), schema.FreshnessFresh)
		state.Vehicles[0].EstimatedLapTime = derivedInput(standings.LapTime(90), schema.FreshnessFresh)
		state.Vehicles = append(state.Vehicles, gapVehicle("other", 15, 0, schema.FreshnessFresh))
		snapshot, err := envelope.NewSnapshot(deltaHeader(schema.Sequence(index+1)), state, cloneObservedForTest)
		if err != nil {
			t.Fatal(err)
		}
		output, err := pipeline.Apply(context.Background(), snapshot)
		if err != nil {
			t.Fatal(err)
		}
		final, _ = output.Value()
	}

	remaining, _ := final.Derived.SessionRemaining.Value()
	delta, _ := final.Derived.Delta.Seconds.Value()
	reference, _ := final.Derived.Delta.Reference.Value()
	other := final.Derived.Gaps.Vehicles[1]
	gapSeconds, _ := other.Time.Value()
	gapLaps, _ := other.Laps.Value()
	history := make([]overlayDeltaSampleGolden, len(final.Derived.Delta.History))
	for index, sample := range final.Derived.Delta.History {
		history[index] = overlayDeltaSampleGolden{
			Epoch: uint64(sample.Cursor.Epoch), Sequence: uint64(sample.Cursor.Sequence),
			SourceTimeNS: int64(sample.SourceTime), LapDistanceMeters: float64(sample.LapDistance),
			Seconds: float64(sample.Seconds),
		}
	}
	algorithms := make([]string, len(final.Derived.Algorithms))
	for index, algorithm := range final.Derived.Algorithms {
		algorithms[index] = fmt.Sprintf("%s@%d", algorithm.ID, algorithm.Version)
	}
	view := overlayTimingGolden{
		SessionRemainingSeconds: float64(remaining),
		Gap:                     overlayGapGolden{Vehicle: string(other.Vehicle), Seconds: float64(gapSeconds), Laps: int32(gapLaps)},
		Delta: overlayDeltaGolden{
			Seconds: float64(delta), Reference: uint8(reference), History: history,
		},
		Algorithms: algorithms,
	}
	got, err := json.MarshalIndent(view, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	want, err := os.ReadFile("testdata/overlay_timing_v1.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("overlay timing golden mismatch:\n%s", got)
	}
}

type overlayTimingGolden struct {
	SessionRemainingSeconds float64            `json:"sessionRemainingSeconds"`
	Gap                     overlayGapGolden   `json:"gap"`
	Delta                   overlayDeltaGolden `json:"delta"`
	Algorithms              []string           `json:"algorithms"`
}

type overlayGapGolden struct {
	Vehicle string  `json:"vehicle"`
	Seconds float64 `json:"seconds"`
	Laps    int32   `json:"laps"`
}

type overlayDeltaGolden struct {
	Seconds   float64                    `json:"seconds"`
	Reference uint8                      `json:"reference"`
	History   []overlayDeltaSampleGolden `json:"history"`
}

type overlayDeltaSampleGolden struct {
	Epoch             uint64  `json:"epoch"`
	Sequence          uint64  `json:"sequence"`
	SourceTimeNS      int64   `json:"sourceTimeNs"`
	LapDistanceMeters float64 `json:"lapDistanceMeters"`
	Seconds           float64 `json:"seconds"`
}

func TestPipelineCancellationAfterDerivationDoesNotAdvanceDeltaTracker(t *testing.T) {
	baseline := NewPipeline(Config{})
	retried := NewPipeline(Config{})
	inputs := []struct {
		lap      session.LapNumber
		distance standings.LapDistance
		at       time.Duration
	}{
		{1, 100, 10 * time.Second},
		{2, 0, 20 * time.Second},
		{2, 100, 30 * time.Second},
		{2, 200, 40 * time.Second},
		{3, 0, 50 * time.Second},
		{3, 100, 59 * time.Second},
	}
	for index, input := range inputs {
		sequence := schema.Sequence(index + 1)
		snapshot, err := envelope.NewSnapshot(
			deltaHeader(sequence),
			deltaObserved(input.lap, input.distance, input.at, false, schema.FreshnessFresh),
			cloneObservedForTest,
		)
		if err != nil {
			t.Fatal(err)
		}
		if index == 3 {
			if _, err := retried.Apply(&cancelOnErrCall{cancelAt: 3}, snapshot); !errors.Is(err, context.Canceled) {
				t.Fatalf("cancelled apply error = %v", err)
			}
		}
		if _, err := baseline.Apply(context.Background(), snapshot); err != nil {
			t.Fatalf("baseline sequence %d: %v", sequence, err)
		}
		if _, err := retried.Apply(context.Background(), snapshot); err != nil {
			t.Fatalf("retry sequence %d: %v", sequence, err)
		}
	}
	baselineSnapshot, _ := baseline.Current()
	retriedSnapshot, _ := retried.Current()
	baselineState, _ := baselineSnapshot.Value()
	retriedState, _ := retriedSnapshot.Value()
	if !reflect.DeepEqual(baselineState.Derived.Delta, retriedState.Derived.Delta) {
		t.Fatalf("cancelled tracker diverged\nbaseline=%+v\nretried=%+v", baselineState.Derived.Delta, retriedState.Derived.Delta)
	}
}

type cancelOnErrCall struct {
	calls    int
	cancelAt int
}

func (ctx *cancelOnErrCall) Deadline() (time.Time, bool) { return time.Time{}, false }
func (ctx *cancelOnErrCall) Done() <-chan struct{}       { return nil }
func (ctx *cancelOnErrCall) Value(any) any               { return nil }
func (ctx *cancelOnErrCall) Err() error {
	ctx.calls++
	if ctx.calls >= ctx.cancelAt {
		return context.Canceled
	}
	return nil
}

type factCollector struct {
	facts []envelope.Fact[core.SessionFact]
}

func (collector *factCollector) WriteFacts(_ context.Context, facts []envelope.Fact[core.SessionFact]) error {
	collector.facts = append(collector.facts, facts...)
	return nil
}

func TestPipelineReplayMatchesGolden(t *testing.T) {
	pipeline := NewPipeline(Config{MaxControlsHistory: 2})
	var views []goldenView
	for sequence, freshness := range []schema.Freshness{
		schema.FreshnessFresh,
		schema.FreshnessStale,
		schema.FreshnessFresh,
	} {
		snapshot, err := pipeline.Apply(
			context.Background(),
			observedSnapshot(
				t, 1, schema.Sequence(sequence+1), "event", "session", "vehicle",
				freshness,
				schema.Ratio(sequence+1)/10,
				schema.Ratio(sequence+2)/10,
				schema.Ratio(sequence+3)/10,
			),
		)
		if err != nil {
			t.Fatal(err)
		}
		state, _ := snapshot.Value()
		views = append(views, goldenView{
			Epoch:       uint64(snapshot.Header().Cursor.Epoch),
			Sequence:    uint64(snapshot.Header().Cursor.Sequence),
			Freshness:   freshnessName(state.Derived.ControlsHistory.Freshness),
			History:     state.Derived.ControlsHistory.Samples,
			GapsStatus:  freshnessName(state.Derived.Gaps.Freshness),
			DeltaStatus: freshnessName(state.Derived.Delta.Freshness),
		})
	}
	got, err := json.MarshalIndent(views, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	want, err := os.ReadFile("testdata/controls_history_v1.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("golden mismatch:\n%s", got)
	}
}

type goldenView struct {
	Epoch       uint64          `json:"epoch"`
	Sequence    uint64          `json:"sequence"`
	Freshness   string          `json:"freshness"`
	History     []ControlSample `json:"history"`
	GapsStatus  string          `json:"gapsStatus"`
	DeltaStatus string          `json:"deltaStatus"`
}

func freshnessName(value schema.Freshness) string {
	switch value {
	case schema.FreshnessFresh:
		return "fresh"
	case schema.FreshnessStale:
		return "stale"
	case schema.FreshnessInvalid:
		return "invalid"
	default:
		return "missing"
	}
}

func TestPipelineReplayIsDeterministicAndDriverTeamChangesPreserveHistory(t *testing.T) {
	first := NewPipeline(Config{MaxControlsHistory: 4})
	second := NewPipeline(Config{MaxControlsHistory: 4})
	inputs := []envelope.Snapshot[core.ObservedState]{
		observedSnapshot(t, 1, 1, "event", "session", "vehicle", schema.FreshnessFresh, .1, .2, .3),
		observedSnapshot(t, 1, 2, "event", "session", "vehicle", schema.FreshnessFresh, .4, .5, .6),
		observedSnapshot(t, 1, 3, "event", "session", "vehicle", schema.FreshnessInvalid, .7, .8, .9),
	}
	var firstOutputs, secondOutputs []FinalState
	for _, input := range inputs {
		left, err := first.Apply(context.Background(), input)
		if err != nil {
			t.Fatal(err)
		}
		right, err := second.Apply(context.Background(), input)
		if err != nil {
			t.Fatal(err)
		}
		leftState, _ := left.Value()
		rightState, _ := right.Value()
		firstOutputs = append(firstOutputs, leftState)
		secondOutputs = append(secondOutputs, rightState)
	}
	if !reflect.DeepEqual(firstOutputs, secondOutputs) {
		t.Fatal("identical replay produced different snapshots")
	}

	input := observedSnapshot(t, 1, 4, "event", "session", "vehicle", schema.FreshnessFresh, .7, .8, .9)
	state, _ := input.Value()
	header := input.Header()
	header.Identity.Team = "new-team"
	header.Identity.Driver = "new-driver"
	state.Vehicles[0].Identity = header.Identity
	changed, err := envelope.NewSnapshot(header, state, cloneObservedForTest)
	if err != nil {
		t.Fatal(err)
	}
	output, err := first.Apply(context.Background(), changed)
	if err != nil {
		t.Fatalf("driver/team change: %v", err)
	}
	got, _ := output.Value()
	if len(got.Derived.ControlsHistory.Samples) != 3 {
		t.Fatalf("driver/team change reset history: %+v", got.Derived.ControlsHistory.Samples)
	}
}

func TestPipelineConcurrentCurrentOnlyPublishesCompleteSnapshots(t *testing.T) {
	pipeline := NewPipeline(Config{MaxControlsHistory: 8})
	if _, err := pipeline.Apply(context.Background(), observedSnapshot(t, 1, 1, "event", "session", "vehicle", schema.FreshnessFresh, 0, 0, 0)); err != nil {
		t.Fatal(err)
	}

	var readers sync.WaitGroup
	for range 8 {
		readers.Add(1)
		go func() {
			defer readers.Done()
			for range 100 {
				snapshot, ok := pipeline.Current()
				if !ok {
					t.Error("Current unexpectedly empty")
					return
				}
				state, _ := snapshot.Value()
				if len(state.Derived.ControlsHistory.Samples) == 0 ||
					len(state.Derived.ControlsHistory.Samples) > 8 {
					t.Errorf("observed partial history length %d", len(state.Derived.ControlsHistory.Samples))
					return
				}
			}
		}()
	}
	for sequence := schema.Sequence(2); sequence <= 100; sequence++ {
		if _, err := pipeline.Apply(context.Background(), observedSnapshot(t, 1, sequence, "event", "session", "vehicle", schema.FreshnessFresh, .1, .2, .3)); err != nil {
			t.Fatal(err)
		}
	}
	readers.Wait()
}

func FuzzPipelineAgainstHistoryOracle(f *testing.F) {
	f.Add([]byte{0, 1, 2, 3, 4, 5})
	f.Add([]byte{3, 3, 0, 2, 1})
	f.Fuzz(func(t *testing.T, data []byte) {
		const limit = 7
		pipeline := NewPipeline(Config{MaxControlsHistory: limit})
		var oracle []ControlSample
		epoch := schema.Epoch(1)
		sequence := schema.Sequence(0)
		for index, value := range data {
			if index >= 256 {
				break
			}
			if value&0x10 != 0 && sequence != 0 {
				epoch++
				sequence = 0
				oracle = nil
			}
			sequence++
			freshness := []schema.Freshness{
				schema.FreshnessFresh,
				schema.FreshnessMissing,
				schema.FreshnessStale,
				schema.FreshnessInvalid,
			}[value&0x03]
			input := observedSnapshot(
				t, epoch, sequence, "event", "session", "vehicle", freshness,
				schema.Ratio(value%11)/10, 0, 1,
			)
			output, err := pipeline.Apply(context.Background(), input)
			if err != nil {
				t.Fatalf("Apply: %v", err)
			}
			if freshness == schema.FreshnessFresh {
				oracle = append(oracle, ControlSample{
					Cursor: schema.Cursor{Epoch: epoch, Sequence: sequence}, CapturedAt: observedCapturedAt(sequence),
					Vehicle: "vehicle", Throttle: schema.Ratio(value%11) / 10, Brake: 0, Clutch: 1,
				})
				if len(oracle) > limit {
					oracle = append([]ControlSample(nil), oracle[len(oracle)-limit:]...)
				}
			}
			state, _ := output.Value()
			if !reflect.DeepEqual(state.Derived.ControlsHistory.Samples, oracle) {
				t.Fatalf("history differs at byte %d: got %+v want %+v", index, state.Derived.ControlsHistory.Samples, oracle)
			}
		}
	})
}

func BenchmarkPipelineApply64Vehicles(b *testing.B) {
	pipeline := NewPipeline(Config{})
	epoch := schema.Epoch(1)
	sequence := schema.Sequence(0)
	state := core.ObservedState{Vehicles: make([]core.VehicleState, 64)}
	for index := range state.Vehicles {
		vehicleID := identity.VehicleID(fmt.Sprintf("vehicle-%02d", index))
		controls, err := schema.NewField(schema.Ratio(index%10)/10, schema.ProvenanceObserved, schema.FreshnessFresh)
		if err != nil {
			b.Fatal(err)
		}
		state.Vehicles[index] = core.VehicleState{
			Identity: identity.RunIdentity{Event: "event", Session: "session", Vehicle: vehicleID},
			Throttle: controls, Brake: controls, Clutch: controls,
		}
	}
	b.ReportAllocs()
	for b.Loop() {
		sequence++
		header := envelope.Header{
			Cursor: schema.Cursor{Epoch: epoch, Sequence: sequence},
			Identity: identity.RunIdentity{
				Event: "event", Session: "session", Vehicle: "vehicle-00",
			},
		}
		input, err := envelope.NewSnapshot(header, state, cloneObservedForTest)
		if err != nil {
			b.Fatal(err)
		}
		if _, err := pipeline.Apply(context.Background(), input); err != nil {
			b.Fatal(err)
		}
	}
}
