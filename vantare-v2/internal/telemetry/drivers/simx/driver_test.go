package simx

import (
	"context"
	"errors"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

var testEpoch = time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)

func instantWait(context.Context, time.Duration) error { return nil }

type collectingSink struct{ observations []Observation }

func (sink *collectingSink) WriteObservation(_ context.Context, observation Observation) error {
	sink.observations = append(sink.observations, observation)
	return nil
}

func runDriver(t *testing.T, config Config) []Observation {
	t.Helper()
	config.Epoch = testEpoch
	config.Wait = instantWait
	sink := &collectingSink{}
	if err := New(config).Run(context.Background(), sink); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	return sink.observations
}

func TestSyntheticSourceIsDeterministic(t *testing.T) {
	t.Parallel()

	first := runDriver(t, Config{Frames: 25})
	second := runDriver(t, Config{Frames: 25})
	if len(first) != 25 || len(second) != 25 {
		t.Fatalf("frames = %d and %d, want 25", len(first), len(second))
	}
	for index := range first {
		left, _ := first[index].SourceTime.Value()
		right, _ := second[index].SourceTime.Value()
		if left != right {
			t.Fatalf("frame %d source time = %v vs %v", index, left, right)
		}
		if len(first[index].Vehicles) != VehicleCount {
			t.Fatalf("grid size = %d, want %d", len(first[index].Vehicles), VehicleCount)
		}
		if first[index].Vehicles[0] != second[index].Vehicles[0] {
			t.Fatalf("frame %d player row is not reproducible", index)
		}
	}
}

func TestSourceTimeAdvancesMonotonicallyAtFiftyHertz(t *testing.T) {
	t.Parallel()

	observations := runDriver(t, Config{Frames: 10})
	previous := time.Duration(-1)
	for index, observation := range observations {
		elapsed, present := observation.SourceTime.Value()
		if !present {
			t.Fatalf("frame %d has no source time", index)
		}
		if elapsed <= previous {
			t.Fatalf("frame %d source time %v does not advance past %v", index, elapsed, previous)
		}
		if elapsed != time.Duration(index+1)*TickInterval {
			t.Fatalf("frame %d source time = %v, want %v", index, elapsed, time.Duration(index+1)*TickInterval)
		}
		previous = elapsed
	}
}

// A driver must never fabricate a value for a signal its simulator does not
// publish. SimX has no rival world positions, no orientation and no native
// delta, and the mapped state must leave those fields missing.
func TestUnsupportedSignalsStayMissing(t *testing.T) {
	t.Parallel()

	batch := mapFirstBatch(t, Config{Frames: 1})
	for index, vehicle := range batch.State.Vehicles {
		if _, present := vehicle.WorldPosition.Value(); present {
			t.Fatalf("vehicle %d reports a world position SimX does not publish", index)
		}
		if _, present := vehicle.Orientation.Value(); present {
			t.Fatalf("vehicle %d reports an orientation SimX does not publish", index)
		}
		if _, present := vehicle.LocalVelocity.Value(); present {
			t.Fatalf("vehicle %d reports a local velocity SimX does not publish", index)
		}
		if _, present := vehicle.DeltaBest.Value(); present {
			t.Fatalf("vehicle %d reports a native delta SimX does not publish", index)
		}
		if vehicle.WorldPosition.Freshness() != schema.FreshnessMissing {
			t.Fatalf("vehicle %d world position freshness = %v", index, vehicle.WorldPosition.Freshness())
		}
	}
}

func TestIdentitiesAreStableAcrossFramesAndEpochResetsOnBoundary(t *testing.T) {
	t.Parallel()

	observations := runDriver(t, Config{Frames: 12, BoundaryEvery: 6})
	mapper := NewBatchMapper()
	var batches []telemetrycore.Batch
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		batches = append(batches, batch)
		return nil
	})
	for _, observation := range observations {
		if err := mapper.WriteObservation(context.Background(), observation, sink); err != nil {
			t.Fatalf("WriteObservation() error = %v", err)
		}
	}
	if len(batches) != 12 {
		t.Fatalf("batches = %d, want 12", len(batches))
	}
	first := batches[0]
	if first.Header.Cursor.Sequence != 1 || first.Header.Cursor.Epoch == 0 {
		t.Fatalf("first cursor = %#v", first.Header.Cursor)
	}
	if first.Header.Identity.Vehicle != vehicleID(PlayerSlot) {
		t.Fatalf("player identity = %q", first.Header.Identity.Vehicle)
	}
	for index := 1; index < 6; index++ {
		if batches[index].Header.Cursor.Epoch != first.Header.Cursor.Epoch {
			t.Fatalf("batch %d changed epoch without a boundary", index)
		}
		if batches[index].Header.Identity.Session != first.Header.Identity.Session {
			t.Fatalf("batch %d changed session without a boundary", index)
		}
		if batches[index].Header.Cursor.Sequence != schema.Sequence(index+1) {
			t.Fatalf("batch %d sequence = %d", index, batches[index].Header.Cursor.Sequence)
		}
	}
	boundary := batches[6]
	if boundary.Header.Cursor.Epoch == first.Header.Cursor.Epoch {
		t.Fatal("a session boundary must open a new epoch")
	}
	if boundary.Header.Cursor.Sequence != 1 {
		t.Fatalf("boundary sequence = %d, want 1", boundary.Header.Cursor.Sequence)
	}
	if boundary.Header.Identity.Session == first.Header.Identity.Session {
		t.Fatal("a session boundary must open a new session identity")
	}
	// Vehicle identities are derived from the grid slot, so they survive the
	// boundary and every frame inside a session.
	if boundary.State.Vehicles[3].Identity.Vehicle != vehicleID(3) {
		t.Fatalf("vehicle identity = %q", boundary.State.Vehicles[3].Identity.Vehicle)
	}
}

func TestUnmappableFramesAreClassifiedAndNotFatal(t *testing.T) {
	t.Parallel()

	mapper := NewBatchMapper()
	sink := telemetrycore.BatchSinkFunc(func(context.Context, telemetrycore.Batch) error { return nil })
	empty := Observation{Slot: slotSynthetic}
	err := mapper.WriteObservation(context.Background(), empty, sink)
	if !errors.Is(err, ErrInvalidSessionIdentity) || !IsUnmappableFrame(err) {
		t.Fatalf("empty frame error = %v", err)
	}

	mismatched := runDriver(t, Config{Frames: 1})[0]
	mismatched.Vehicles = mismatched.Vehicles[:3]
	if err := mapper.WriteObservation(context.Background(), mismatched, sink); !IsUnmappableFrame(err) {
		t.Fatalf("mismatched grid error = %v", err)
	}
	if IsUnmappableFrame(ErrBatchSinkRequired) {
		t.Fatal("a missing sink is a programming error, not an unmappable frame")
	}
}

func TestRuntimeSnapshotReportsTheSingleSyntheticChannel(t *testing.T) {
	t.Parallel()

	driver := New(Config{Frames: 2, Epoch: testEpoch, Wait: instantWait})
	if snapshot := driver.RuntimeSnapshot(); snapshot.State != drivercontract.StateStopped {
		t.Fatalf("initial state = %v", snapshot.State)
	}
	if err := driver.Run(context.Background(), &collectingSink{}); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	snapshot := driver.RuntimeSnapshot()
	if len(snapshot.Capabilities) != 1 || snapshot.Capabilities[0] != CapabilitySynthetic {
		t.Fatalf("capabilities = %v", snapshot.Capabilities)
	}
	if driver.Frames() != 2 {
		t.Fatalf("frames = %d, want 2", driver.Frames())
	}
}

func TestRunStopsOnContextCancellationWithoutError(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := New(Config{Epoch: testEpoch, Wait: instantWait}).Run(ctx, &collectingSink{}); err != nil {
		t.Fatalf("cancelled Run() error = %v", err)
	}
}

// The single-slot fusion must still produce one decision per declared signal:
// a one-source driver has nothing to arbitrate, but its authority matrix is as
// exhaustive as a multi-source one.
func TestSingleSlotFusionDecidesEveryDeclaredSignal(t *testing.T) {
	t.Parallel()

	state := &Fusion{}
	raw := runDriver(t, Config{Frames: 1})[0]
	_, decisions := state.Merge(TickInterval, raw)
	if len(decisions) != len(AuthorityMatrix()) {
		t.Fatalf("decisions = %d, want %d", len(decisions), len(AuthorityMatrix()))
	}
	for _, decision := range decisions {
		if decision.Slot != SlotSynthetic || decision.Freshness != schema.FreshnessFresh {
			t.Fatalf("decision = %#v", decision)
		}
	}
	// Past the TTL the same retained frame is reported stale, not fresh.
	_, aged := state.Merge(TickInterval+time.Second)
	for _, decision := range aged {
		if decision.Freshness != schema.FreshnessStale {
			t.Fatalf("aged decision = %#v", decision)
		}
	}
}

func mapFirstBatch(t *testing.T, config Config) telemetrycore.Batch {
	t.Helper()
	observations := runDriver(t, config)
	var batch telemetrycore.Batch
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, mapped telemetrycore.Batch) error {
		batch = mapped
		return nil
	})
	if err := NewBatchMapper().WriteObservation(context.Background(), observations[0], sink); err != nil {
		t.Fatalf("WriteObservation() error = %v", err)
	}
	return batch
}

func TestSessionIdentityIsComplete(t *testing.T) {
	t.Parallel()

	batch := mapFirstBatch(t, Config{Frames: 1})
	if !batch.Header.Identity.SessionKnown() {
		t.Fatalf("identity = %#v", batch.Header.Identity)
	}
	if batch.Header.Identity.Event != identity.EventID("simx") {
		t.Fatalf("event = %q", batch.Header.Identity.Event)
	}
	for index, vehicle := range batch.State.Vehicles {
		if !vehicle.Identity.SameSession(batch.Header.Identity) {
			t.Fatalf("vehicle %d identity = %#v", index, vehicle.Identity)
		}
	}
}
