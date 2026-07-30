package replay

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestCanonicalReplayPreservesOwnedSnapshotsFactsAndGoldenOrder(t *testing.T) {
	t.Parallel()
	metadata := testMetadata()
	metadata.SchemaID = "canonical-observation"
	first := canonicalFrame(t, metadata.StartedAtUTC, 1, 1, 1)
	second := canonicalFrame(t, metadata.StartedAtUTC.Add(time.Second), 1, 2, 2)
	source, err := NewCanonicalSource(metadata, []CanonicalFrame{first, second})
	if err != nil {
		t.Fatalf("NewCanonicalSource() error = %v", err)
	}
	player, err := NewPlayer(source, Options{Mode: ModeStep})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	var trace []canonicalGoldenFrame
	reducer := core.NewReducer()
	for range 2 {
		err := player.Step(context.Background(), func(_ context.Context, output Output[CanonicalFrame]) error {
			if output.Value.Batch == nil {
				t.Fatal("fixture lost canonical batch")
			}
			snapshot, err := reducer.Apply(*output.Value.Batch)
			if err != nil {
				t.Fatalf("Apply(replayed batch) error = %v", err)
			}
			header := snapshot.Header()
			state, present := snapshot.Value()
			if !present {
				t.Fatal("replayed snapshot lost ownership")
			}
			facts := output.Value.Facts
			trace = append(trace, canonicalGoldenFrame{
				OffsetNS:     output.Offset.Nanoseconds(),
				Epoch:        uint64(header.Cursor.Epoch),
				Sequence:     uint64(header.Cursor.Sequence),
				VehicleCount: len(state.Vehicles),
				FactSequence: uint64(facts[0].Value().Sequence),
				FactKind:     uint8(facts[0].Value().Kind),
			})
			// Mutating the caller-owned result must not affect the source.
			output.Value.Batch.State.Vehicles = nil
			facts[0] = envelope.Fact[core.SessionFact]{}
			return nil
		})
		if err != nil {
			t.Fatalf("Step() error = %v", err)
		}
	}
	data, err := os.ReadFile(filepath.Join("testdata", "canonical-v1.golden.json"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	var golden struct {
		FixtureVersion uint16                 `json:"fixtureVersion"`
		Frames         []canonicalGoldenFrame `json:"frames"`
	}
	if err := json.Unmarshal(data, &golden); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if golden.FixtureVersion != FixtureVersionV1 || !reflect.DeepEqual(trace, golden.Frames) {
		t.Fatalf("trace = %#v, golden = %#v", trace, golden)
	}
}

func TestCanonicalReplayPreservesSessionTransitionAndStandaloneFacts(t *testing.T) {
	t.Parallel()
	metadata := testMetadata()
	metadata.SchemaID = "canonical-observation"
	first := canonicalFrameForSession(
		metadata.StartedAtUTC,
		1,
		1,
		1,
		"session-a",
	)
	second := canonicalFrameForSession(
		metadata.StartedAtUTC.Add(time.Second),
		2,
		1,
		3,
		"session-b",
	)
	previousHeader := first.Batch.Header
	currentHeader := second.Batch.Header
	ended := core.SessionFact{
		Sequence:    2,
		Kind:        core.FactSessionEnded,
		OccurredUTC: metadata.StartedAtUTC.Add(time.Second),
		Identity:    previousHeader.Identity,
	}
	started := second.Facts[0].Value()
	started.PreviousIdentity = previousHeader.Identity
	second.Facts = []envelope.Fact[core.SessionFact]{
		envelope.NewFact(previousHeader, ended),
		envelope.NewFact(currentHeader, started),
	}
	connectionLost := core.SessionFact{
		Sequence:    4,
		Kind:        core.FactConnectionLost,
		OccurredUTC: metadata.StartedAtUTC.Add(2 * time.Second),
		Identity:    currentHeader.Identity,
	}
	standalone := CanonicalFrame{
		Facts: []envelope.Fact[core.SessionFact]{
			envelope.NewFact(currentHeader, connectionLost),
		},
	}
	source, err := NewCanonicalSource(
		metadata,
		[]CanonicalFrame{first, second, standalone},
	)
	if err != nil {
		t.Fatalf("NewCanonicalSource(transition) error = %v", err)
	}
	player, err := NewPlayer(source, Options{Mode: ModeStep})
	if err != nil {
		t.Fatalf("NewPlayer() error = %v", err)
	}
	var got []core.FactKind
	for range 3 {
		if err := player.Step(context.Background(), func(_ context.Context, output Output[CanonicalFrame]) error {
			for _, fact := range output.Value.Facts {
				got = append(got, fact.Value().Kind)
			}
			return nil
		}); err != nil {
			t.Fatalf("Step() error = %v", err)
		}
	}
	want := []core.FactKind{
		core.FactSessionStarted,
		core.FactSessionEnded,
		core.FactSessionStarted,
		core.FactConnectionLost,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("facts = %v, want %v", got, want)
	}
}

func TestCanonicalReplayRejectsCursorFactAndClockInconsistency(t *testing.T) {
	t.Parallel()
	metadata := testMetadata()
	valid := canonicalFrame(t, metadata.StartedAtUTC, 1, 1, 1)
	futureMetadata := metadata
	futureMetadata.SchemaVersion = 2
	if _, err := NewCanonicalSource(
		futureMetadata,
		[]CanonicalFrame{valid},
	); err == nil {
		t.Fatal("NewCanonicalSource(future schema) error = nil, want rejection")
	}
	if _, err := NewCanonicalSource(metadata, nil); err == nil {
		t.Fatal("NewCanonicalSource(empty) error = nil, want rejection")
	}
	tests := []struct {
		name  string
		frame CanonicalFrame
	}{
		{
			name: "fact cursor differs from snapshot",
			frame: func() CanonicalFrame {
				candidate := cloneCanonicalFrame(valid)
				fact := candidate.Facts[0]
				header := fact.Header()
				header.Cursor.Sequence = 2
				candidate.Facts[0] = envelope.NewFact(header, fact.Value())
				return candidate
			}(),
		},
		{
			name: "fact header identity differs from value",
			frame: func() CanonicalFrame {
				candidate := cloneCanonicalFrame(valid)
				fact := candidate.Facts[0]
				value := fact.Value()
				value.Identity.Vehicle = "another-vehicle"
				candidate.Facts[0] = envelope.NewFact(fact.Header(), value)
				return candidate
			}(),
		},
		{
			name: "fact sequence zero",
			frame: func() CanonicalFrame {
				candidate := cloneCanonicalFrame(valid)
				fact := candidate.Facts[0]
				value := fact.Value()
				value.Sequence = 0
				candidate.Facts[0] = envelope.NewFact(fact.Header(), value)
				return candidate
			}(),
		},
		{
			name:  "snapshot before fixture",
			frame: canonicalFrame(t, metadata.StartedAtUTC.Add(-time.Second), 1, 1, 1),
		},
		{
			name:  "first snapshot after fixture start",
			frame: canonicalFrame(t, metadata.StartedAtUTC.Add(time.Second), 1, 1, 1),
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if _, err := NewCanonicalSource(metadata, []CanonicalFrame{test.frame}); err == nil {
				t.Fatal("NewCanonicalSource() error = nil, want rejection")
			}
		})
	}
}

type canonicalGoldenFrame struct {
	OffsetNS     int64  `json:"offsetNS"`
	Epoch        uint64 `json:"epoch"`
	Sequence     uint64 `json:"sequence"`
	VehicleCount int    `json:"vehicleCount"`
	FactSequence uint64 `json:"factSequence"`
	FactKind     uint8  `json:"factKind"`
}

func canonicalFrame(
	t testing.TB,
	at time.Time,
	epoch schema.Epoch,
	sequence schema.Sequence,
	factSequence core.FactSequence,
) CanonicalFrame {
	t.Helper()
	return canonicalFrameForSession(at, epoch, sequence, factSequence, "session-local")
}

func canonicalFrameForSession(
	at time.Time,
	epoch schema.Epoch,
	sequence schema.Sequence,
	factSequence core.FactSequence,
	sessionID identity.SessionID,
) CanonicalFrame {
	run := identity.RunIdentity{
		Event:   identity.EventID("event-local"),
		Session: sessionID,
		Vehicle: identity.VehicleID("vehicle-local"),
	}
	header := envelope.Header{
		Source:   "replay-fixture",
		Cursor:   schema.Cursor{Epoch: epoch, Sequence: sequence},
		Clock:    schema.NewClock(schema.Field[time.Duration]{}, schema.Field[time.Duration]{}, at),
		Identity: run,
	}
	state := core.ObservedState{
		Vehicles: []core.VehicleState{{Identity: run}},
	}
	fact := core.SessionFact{
		Sequence:    factSequence,
		Kind:        core.FactSessionStarted,
		OccurredUTC: at,
		Identity:    run,
	}
	return CanonicalFrame{
		Batch: &core.Batch{
			Header: header,
			State:  state,
		},
		Facts: []envelope.Fact[core.SessionFact]{envelope.NewFact(header, fact)},
	}
}
