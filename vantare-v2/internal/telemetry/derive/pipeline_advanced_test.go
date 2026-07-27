package derive

import (
	"context"
	"encoding/json"
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
					Cursor:  schema.Cursor{Epoch: epoch, Sequence: sequence},
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
