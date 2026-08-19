package lmu

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

type batchGolden struct {
	SchemaVersion int                  `json:"schemaVersion"`
	Event         identity.EventID     `json:"event"`
	Session       identity.SessionID   `json:"session"`
	Player        identity.VehicleID   `json:"player"`
	Cursor        schema.Cursor        `json:"cursor"`
	VehicleIDs    []identity.VehicleID `json:"vehicleIds"`
}

func TestBatchMapperRealFixtureTraversesParseFusionMapperAndReducer(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	fused := new(Fusion).Merge(parsed.ReceivedUTC, 0, parsed)
	reducer := telemetrycore.NewReducer()
	mapper := NewBatchMapper()
	if err := mapper.WriteObservation(context.Background(), fused, telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		_, err := reducer.Apply(batch)
		return err
	})); err != nil {
		t.Fatal(err)
	}

	snapshot, ok := reducer.Current()
	if !ok {
		t.Fatal("reducer did not receive the mapped fixture")
	}
	state, _ := snapshot.Value()
	if len(state.Vehicles) != 44 {
		t.Fatalf("vehicles = %d, want 44", len(state.Vehicles))
	}
	seen := make(map[identity.VehicleID]struct{}, len(state.Vehicles))
	players := 0
	for _, current := range state.Vehicles {
		if current.Identity.Vehicle == "" {
			t.Fatal("mapped vehicle has empty identity")
		}
		if _, duplicate := seen[current.Identity.Vehicle]; duplicate {
			t.Fatalf("duplicate mapped identity %q", current.Identity.Vehicle)
		}
		seen[current.Identity.Vehicle] = struct{}{}
		if player, present := current.Player.Value(); present && player {
			players++
			if snapshot.Header().Identity.Vehicle != current.Identity.Vehicle {
				t.Fatalf("header player = %q, row player = %q", snapshot.Header().Identity.Vehicle, current.Identity.Vehicle)
			}
		}
	}
	if players != 1 {
		t.Fatalf("players = %d, want 1", players)
	}
}

func TestNativeDeltaBestTraversesLMUBufferToOverlayWithoutReferenceWarmup(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	scoringBase, _ := lmu13Layout.ScoringRows.rowBase(43)
	binary.LittleEndian.PutUint64(input[scoringBase+lmu13Layout.Scoring.BestLapTime.Offset:], math.Float64bits(90.5))
	telemetryBase := telemetryOffset + int(input[128465])*telemetryStride
	binary.LittleEndian.PutUint64(input[telemetryBase+lmu13Layout.Telemetry.DeltaBest.Offset:], math.Float64bits(-0.245))

	parsed, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	fused := new(Fusion).Merge(parsed.ReceivedUTC, 0, parsed)
	mapper, reducer := NewBatchMapper(), telemetrycore.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var projected overlayprojection.SnapshotV1
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		observed, err := reducer.Apply(batch)
		if err != nil {
			return err
		}
		final, err := pipeline.Apply(context.Background(), observed)
		if err != nil {
			return err
		}
		projected, err = overlayprojection.ProjectV1(final)
		return err
	})
	if err := mapper.WriteObservation(context.Background(), fused, sink); err != nil {
		t.Fatal(err)
	}
	if !projected.PlayerDelta.Present || projected.PlayerDelta.Value != session.DeltaSeconds(-0.245) ||
		projected.PlayerDelta.Provenance != telemetryprojection.ProvenanceObserved {
		t.Fatalf("projected native delta = %+v", projected.PlayerDelta)
	}
	if !projected.PlayerDeltaPersonalBest.Present || projected.PlayerDeltaPersonalBest.Value != session.DeltaSeconds(-0.245) ||
		projected.PlayerDeltaPersonalBest.Provenance != telemetryprojection.ProvenanceObserved {
		t.Fatalf("projected personal-best delta = %+v", projected.PlayerDeltaPersonalBest)
	}
	if projected.PlayerDeltaSessionBest.Present || projected.PlayerDeltaPreviousLap.Present {
		t.Fatalf("first frame invented derived references: session=%+v previous=%+v", projected.PlayerDeltaSessionBest, projected.PlayerDeltaPreviousLap)
	}
	if !projected.DeltaReference.Present || projected.DeltaReference.Value != "best-completed-player-lap" ||
		projected.DeltaReference.Provenance != telemetryprojection.ProvenanceObserved {
		t.Fatalf("projected native delta reference = %+v", projected.DeltaReference)
	}
}

func TestBatchMapperRealFixtureMatchesGoldenIdentityContract(t *testing.T) {
	input, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := parseSupported(input, time.Unix(100, 0).UTC())
	if err != nil {
		t.Fatal(err)
	}
	fused := new(Fusion).Merge(parsed.ReceivedUTC, 0, parsed)
	sink := new(batchCollector)
	writeMapped(t, NewBatchMapper(), fused, sink)
	batch := sink.last(t)
	document := batchGolden{
		SchemaVersion: 1,
		Event:         batch.Header.Identity.Event,
		Session:       batch.Header.Identity.Session,
		Player:        batch.Header.Identity.Vehicle,
		Cursor:        batch.Header.Cursor,
		VehicleIDs:    make([]identity.VehicleID, len(batch.State.Vehicles)),
	}
	for index, current := range batch.State.Vehicles {
		document.VehicleIDs[index] = current.Identity.Vehicle
	}
	got, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	want, err := os.ReadFile(filepath.Join("testdata", "driver_to_batch_v1.golden.json"))
	if err != nil {
		t.Fatalf("read golden: %v\n%s", err, got)
	}
	if string(got) != string(want) {
		t.Fatalf("mapped fixture changed\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestBatchMapperIdentitySessionAndEpochTransitionTable(t *testing.T) {
	tests := []struct {
		name string
		run  func(*testing.T)
	}{
		{name: "first compatible menu frame without player", run: testFirstMenuBatch},
		{name: "first compatible track frame", run: testFirstTrackBatch},
		{name: "continuous clock and reordered rows", run: testContinuousReorderedBatch},
		{name: "player first appears", run: testPlayerAppearance},
		{name: "player remains absent", run: testPlayerAbsence},
		{name: "vacated source slot reappears", run: testVacatedSlotGeneration},
		{name: "player source generation changes", run: testPlayerGenerationChange},
		{name: "track or session type changes", run: testSessionSignatureChange},
		{name: "clock reset", run: testClockReset},
		{name: "clock wrap", run: testClockWrap},
		{name: "driver reconnect without accepted observation", run: testReconnectPreservesState},
		{name: "reconnect followed by changed facts", run: testReconnectChangedFacts},
		{name: "reconnect followed by reset clock", run: testReconnectResetClock},
		{name: "ambiguous identity rejects atomically", run: testAmbiguousObservation},
		{name: "partial optional fields remain explicit", run: testPartialObservation},
	}
	for _, test := range tests {
		t.Run(test.name, test.run)
	}
}

func testFirstMenuBatch(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, menuObservation(), sink)
	batch := sink.last(t)
	assertCursor(t, batch, 1, 1)
	if batch.Header.Identity.Event != "lmu-event-1" || batch.Header.Identity.Session != "lmu-session-1" || batch.Header.Identity.Vehicle != "" {
		t.Fatalf("identity = %+v", batch.Header.Identity)
	}
	if len(batch.State.Vehicles) != 0 {
		t.Fatalf("menu vehicles = %d", len(batch.State.Vehicles))
	}
}

func testFirstTrackBatch(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(10, 20), sink)
	batch := sink.last(t)
	assertCursor(t, batch, 1, 1)
	assertVehicleID(t, batch, 10, "lmu-slot-10-generation-1")
	assertVehicleID(t, batch, 20, "lmu-slot-20-generation-1")
	for _, current := range batch.State.Vehicles {
		position, present := current.WorldPosition.Value()
		if !present || position.X != float64(sourceSlotFromVehicleID(current.Identity.Vehicle)) {
			t.Fatalf("vehicle %q spatial position = (%+v,%v)", current.Identity.Vehicle, position, present)
		}
	}
}

func testContinuousReorderedBatch(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(10, 20), sink)
	next := trackObservation(20, 10)
	next.Vehicles[0].Player = observed(false)
	next.Vehicles[1].Player = observed(true)
	next.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, next, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 1, 2)
	assertVehicleID(t, batch, 10, "lmu-slot-10-generation-1")
	assertVehicleID(t, batch, 20, "lmu-slot-20-generation-1")
}

func testPlayerAppearance(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, menuObservation(), sink)
	writeMapped(t, mapper, trackObservation(7), sink)
	batch := sink.last(t)
	assertCursor(t, batch, 2, 1)
	if batch.Header.Identity.Session != "lmu-session-1" || batch.Header.Identity.Vehicle != "lmu-slot-7-generation-1" {
		t.Fatalf("identity = %+v", batch.Header.Identity)
	}
}

func testPlayerAbsence(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7, 8), sink)
	withoutPlayer := trackObservation(8)
	withoutPlayer.PlayerPresent = observed(false)
	withoutPlayer.Vehicles[0].Player = observed(false)
	withoutPlayer.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, withoutPlayer, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 1, 2)
	if batch.Header.Identity.Vehicle != "" {
		t.Fatalf("absent player left stale header identity %q", batch.Header.Identity.Vehicle)
	}
}

func TestBatchMapperPlayerAbsenceClearsActivePlayerThroughProjection(t *testing.T) {
	mapper, reducer := NewBatchMapper(), telemetrycore.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var projected overlayprojection.SnapshotV1
	sink := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		observed, err := reducer.Apply(batch)
		if err != nil {
			return err
		}
		final, err := pipeline.Apply(context.Background(), observed)
		if err != nil {
			return err
		}
		projected, err = overlayprojection.ProjectV1(final)
		return err
	})

	first := trackObservation(7, 8)
	first.Vehicles[0].Throttle = observed(schema.Ratio(0.5))
	first.Vehicles[0].Brake = observed(schema.Ratio(0))
	first.Vehicles[0].Clutch = observed(schema.Ratio(0))
	writeMapped(t, mapper, first, sink)
	if projected.Player != "lmu-slot-7-generation-1" || len(projected.History.Samples) != 1 {
		t.Fatalf("initial projection player/history = %q/%d", projected.Player, len(projected.History.Samples))
	}

	absent := trackObservation(8)
	absent.PlayerPresent = observed(false)
	absent.Vehicles[0].Player = observed(false)
	absent.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, absent, sink)
	if projected.Player != "" {
		t.Fatalf("projection retained stale player %q", projected.Player)
	}
	if projected.History.Freshness != telemetryprojection.FreshnessMissing {
		t.Fatalf("history freshness = %q, want missing", projected.History.Freshness)
	}
	if len(projected.History.Samples) != 0 {
		t.Fatalf("player absence retained stale controls: samples = %d, want 0", len(projected.History.Samples))
	}
}

func testVacatedSlotGeneration(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	first := trackObservation(7, 8)
	first.Vehicles[0].Player = observed(false)
	first.Vehicles[1].Player = observed(true)
	writeMapped(t, mapper, first, sink)
	omitted := trackObservation(8)
	omitted.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, omitted, sink)
	reappeared := trackObservation(7, 8)
	reappeared.Vehicles[0].Player = observed(false)
	reappeared.Vehicles[1].Player = observed(true)
	reappeared.SourceTime = observed(3 * time.Second)
	writeMapped(t, mapper, reappeared, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 1, 3)
	// Este test fija el comportamiento actual. F3 lo sustituirá por una ventana
	// de gracia que conserve la identidad tras una única ausencia.
	assertVehicleID(t, batch, 7, "lmu-slot-7-generation-2")
}

func testPlayerGenerationChange(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	absent := trackObservation()
	absent.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, absent, sink)
	reappeared := trackObservation(7)
	reappeared.SourceTime = observed(3 * time.Second)
	writeMapped(t, mapper, reappeared, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 2, 1)
	if batch.Header.Identity.Vehicle != "lmu-slot-7-generation-2" {
		t.Fatalf("player identity = %q", batch.Header.Identity.Vehicle)
	}
}

func testSessionSignatureChange(t *testing.T) {
	for _, mutate := range []func(*Observation){
		func(observation *Observation) { observation.TrackName = observed("Track-02") },
		func(observation *Observation) { observation.SessionType = observed(session.TypeRace) },
	} {
		mapper, sink := NewBatchMapper(), new(batchCollector)
		writeMapped(t, mapper, trackObservation(7), sink)
		next := trackObservation(7)
		next.SourceTime = observed(2 * time.Second)
		mutate(&next)
		writeMapped(t, mapper, next, sink)
		batch := sink.last(t)
		assertCursor(t, batch, 2, 1)
		if batch.Header.Identity.Session != "lmu-session-2" {
			t.Fatalf("session = %q", batch.Header.Identity.Session)
		}
		assertVehicleID(t, batch, 7, "lmu-slot-7-generation-1")
	}
}

func testClockReset(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	next := trackObservation(7)
	next.ClockChange = ClockReset
	next.SourceTime = observed(100 * time.Millisecond)
	writeMapped(t, mapper, next, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 2, 1)
	if batch.Header.Identity.Session != "lmu-session-2" {
		t.Fatalf("session = %q", batch.Header.Identity.Session)
	}
}

func testClockWrap(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	next := trackObservation(7)
	next.ClockChange = ClockWrap
	next.SourceTime = observed(100 * time.Millisecond)
	writeMapped(t, mapper, next, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 2, 1)
	if batch.Header.Identity.Session != "lmu-session-1" {
		t.Fatalf("session = %q", batch.Header.Identity.Session)
	}
	assertVehicleID(t, batch, 7, "lmu-slot-7-generation-1")
}

func testReconnectPreservesState(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	next := trackObservation(7)
	next.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, next, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 1, 2)
	assertVehicleID(t, batch, 7, "lmu-slot-7-generation-1")
}

func testReconnectChangedFacts(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	next := trackObservation(7)
	next.TrackName = observed("Track-02")
	writeMapped(t, mapper, next, sink)
	assertCursor(t, sink.last(t), 2, 1)
}

func testReconnectResetClock(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	first := trackObservation(7)
	first.SourceTime = observed(1200 * time.Second)
	writeMapped(t, mapper, first, sink)

	next := trackObservation(7)
	next.SourceTime = observed(2 * time.Second)
	next.ClockChange = ClockContinuous
	writeMapped(t, mapper, next, sink)
	batch := sink.last(t)
	assertCursor(t, batch, 2, 1)
	if batch.Header.Identity.Session != "lmu-session-2" {
		t.Fatalf("session after reconnect clock reset = %q", batch.Header.Identity.Session)
	}
}

func testAmbiguousObservation(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7), sink)
	invalid := trackObservation(7, 7)
	if err := mapper.WriteObservation(context.Background(), invalid, sink); !errors.Is(err, ErrDuplicateSourceSlot) {
		t.Fatalf("error = %v, want %v", err, ErrDuplicateSourceSlot)
	}
	if len(sink.batches) != 1 {
		t.Fatalf("sink calls = %d, want 1", len(sink.batches))
	}
	next := trackObservation(7)
	next.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, next, sink)
	assertCursor(t, sink.last(t), 1, 2)
}

func testPartialObservation(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	partial := trackObservation(7)
	partial.Vehicles[0].Gear = schema.MissingField[vehicle.Gear]()
	writeMapped(t, mapper, partial, sink)
	if sink.last(t).State.Vehicles[0].Gear.Freshness() != schema.FreshnessMissing {
		t.Fatal("missing optional field was invented")
	}
}

func TestBatchMapperRejectsNegativeSlotsAndSinkFailureDoesNotAdvanceState(t *testing.T) {
	mapper, sink := NewBatchMapper(), new(batchCollector)
	invalid := trackObservation(-1)
	if err := mapper.WriteObservation(context.Background(), invalid, sink); !errors.Is(err, ErrInvalidSourceSlot) {
		t.Fatalf("negative slot error = %v", err)
	}

	failing := &batchCollector{err: telemetrycore.ErrBackpressure}
	if err := mapper.WriteObservation(context.Background(), trackObservation(7), failing); !errors.Is(err, telemetrycore.ErrBackpressure) {
		t.Fatalf("sink error = %v", err)
	}
	writeMapped(t, mapper, trackObservation(7), sink)
	batch := sink.last(t)
	assertCursor(t, batch, 1, 1)
	assertVehicleID(t, batch, 7, "lmu-slot-7-generation-1")
}

func TestNewObservationBatchSinkRequiresMapperAndDownstream(t *testing.T) {
	if _, err := NewObservationBatchSink(nil, new(batchCollector)); !errors.Is(err, ErrBatchMapperRequired) {
		t.Fatalf("nil mapper error = %v", err)
	}
	if _, err := NewObservationBatchSink(NewBatchMapper(), nil); !errors.Is(err, ErrBatchSinkRequired) {
		t.Fatalf("nil downstream error = %v", err)
	}
}

func TestBatchMapperSinkFailureRollsBackSessionVacancyCursorAndOwnership(t *testing.T) {
	mapper, accepted := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, trackObservation(7, 8), accepted)

	changed := trackObservation(8)
	changed.TrackName = observed("Track-02")
	changed.SourceTime = observed(2 * time.Second)
	failing := telemetrycore.BatchSinkFunc(func(_ context.Context, batch telemetrycore.Batch) error {
		batch.State.Vehicles[0].Identity.Vehicle = "sink-mutated"
		return telemetrycore.ErrBackpressure
	})
	if err := mapper.WriteObservation(context.Background(), changed, failing); !errors.Is(err, telemetrycore.ErrBackpressure) {
		t.Fatalf("boundary sink error = %v", err)
	}

	retry := trackObservation(7, 8)
	retry.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, retry, accepted)
	batch := accepted.last(t)
	assertCursor(t, batch, 1, 2)
	if batch.Header.Identity.Session != "lmu-session-1" {
		t.Fatalf("session advanced after rejected boundary: %q", batch.Header.Identity.Session)
	}
	assertVehicleID(t, batch, 7, "lmu-slot-7-generation-1")
	assertVehicleID(t, batch, 8, "lmu-slot-8-generation-1")
}

type checkedCancelContext struct {
	context.Context
	once    sync.Once
	checked chan struct{}
}

func (ctx *checkedCancelContext) Err() error {
	first := false
	ctx.once.Do(func() {
		first = true
		close(ctx.checked)
	})
	if first {
		return nil
	}
	return ctx.Context.Err()
}

type blockingBatchSink struct {
	entered chan struct{}
	release chan struct{}
}

func (sink *blockingBatchSink) WriteBatch(ctx context.Context, _ telemetrycore.Batch) error {
	close(sink.entered)
	select {
	case <-sink.release:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestBatchMapperRechecksCancellationAfterWaitingForOwnership(t *testing.T) {
	mapper := NewBatchMapper()
	blocking := &blockingBatchSink{entered: make(chan struct{}), release: make(chan struct{})}
	firstResult := make(chan error, 1)
	go func() {
		firstResult <- mapper.WriteObservation(context.Background(), trackObservation(7), blocking)
	}()
	<-blocking.entered

	base, cancel := context.WithCancel(context.Background())
	waitingContext := &checkedCancelContext{Context: base, checked: make(chan struct{})}
	cancelledSink := new(batchCollector)
	secondResult := make(chan error, 1)
	go func() {
		second := trackObservation(7)
		second.SourceTime = observed(2 * time.Second)
		secondResult <- mapper.WriteObservation(waitingContext, second, cancelledSink)
	}()
	<-waitingContext.checked
	cancel()
	close(blocking.release)
	if err := <-firstResult; err != nil {
		t.Fatalf("first write: %v", err)
	}
	if err := <-secondResult; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled waiting write error = %v", err)
	}
	if len(cancelledSink.batches) != 0 {
		t.Fatalf("cancelled write reached sink %d times", len(cancelledSink.batches))
	}

	accepted := new(batchCollector)
	next := trackObservation(7)
	next.SourceTime = observed(2 * time.Second)
	writeMapped(t, mapper, next, accepted)
	assertCursor(t, accepted.last(t), 1, 2)
}

func TestBatchMapperRejectsInvalidIdentityFactsAtomically(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Observation)
		wantErr error
	}{
		{name: "unknown compatibility", mutate: func(value *Observation) { value.Compatibility = CompatibilityUnknown }, wantErr: ErrIncompatibleObservation},
		{name: "non canonical source", mutate: func(value *Observation) { value.Source = SourceSharedMemory }, wantErr: ErrIncompatibleObservation},
		{name: "missing track", mutate: func(value *Observation) { value.TrackName = schema.MissingField[string]() }, wantErr: ErrInvalidSessionIdentity},
		{name: "blank track", mutate: func(value *Observation) { value.TrackName = observed("   ") }, wantErr: ErrInvalidSessionIdentity},
		{name: "count mismatch", mutate: func(value *Observation) { value.VehicleCount = observed(schema.Count(2)) }, wantErr: ErrInvalidVehicleCount},
		{name: "grid exceeds source maximum", mutate: func(value *Observation) {
			value.Vehicles = make([]VehicleObservation, lmu13Layout.ScoringRows.Maximum+1)
			for index := range value.Vehicles {
				value.Vehicles[index] = VehicleObservation{SourceID: VehicleSourceID(index), Player: observed(index == 0)}
			}
			value.VehicleCount = observed(schema.Count(len(value.Vehicles)))
		}, wantErr: ErrInvalidVehicleCount},
		{name: "multiple players", mutate: func(value *Observation) {
			value.Vehicles = append(value.Vehicles, VehicleObservation{SourceID: 8, Player: observed(true)})
			value.VehicleCount = observed(schema.Count(2))
		}, wantErr: ErrInvalidPlayerIdentity},
		{name: "player header disagrees with grid", mutate: func(value *Observation) { value.PlayerPresent = observed(false) }, wantErr: ErrInvalidPlayerIdentity},
		{name: "missing row player marker", mutate: func(value *Observation) { value.Vehicles[0].Player = schema.MissingField[bool]() }, wantErr: ErrInvalidPlayerIdentity},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			mapper, sink := NewBatchMapper(), new(batchCollector)
			value := trackObservation(7)
			test.mutate(&value)
			if err := mapper.WriteObservation(context.Background(), value, sink); !errors.Is(err, test.wantErr) {
				t.Fatalf("error = %v, want %v", err, test.wantErr)
			}
			if len(sink.batches) != 0 {
				t.Fatalf("rejected observation wrote %d batches", len(sink.batches))
			}
			writeMapped(t, mapper, trackObservation(7), sink)
			assertCursor(t, sink.last(t), 1, 1)
		})
	}
}

func TestBatchMapperPreservesObservedNativeDeltaBest(t *testing.T) {
	observation := trackObservation(7)
	observation.Vehicles[0].DeltaBest = observed(session.DeltaSeconds(-0.245))
	mapper, sink := NewBatchMapper(), new(batchCollector)
	writeMapped(t, mapper, observation, sink)

	field := sink.last(t).State.Vehicles[0].DeltaBest
	value, present := field.Value()
	if !present || value != session.DeltaSeconds(-0.245) || field.Provenance() != schema.ProvenanceObserved {
		t.Fatalf("mapped native delta = (%v,%t,%v)", value, present, field.Provenance())
	}
}

type batchCollector struct {
	batches []telemetrycore.Batch
	err     error
}

func (sink *batchCollector) WriteBatch(_ context.Context, batch telemetrycore.Batch) error {
	if sink.err != nil {
		return sink.err
	}
	batch.State.Vehicles = append([]telemetrycore.VehicleState(nil), batch.State.Vehicles...)
	sink.batches = append(sink.batches, batch)
	return nil
}

func (sink *batchCollector) last(t testing.TB) telemetrycore.Batch {
	t.Helper()
	if len(sink.batches) == 0 {
		t.Fatal("sink has no batches")
	}
	return sink.batches[len(sink.batches)-1]
}

func writeMapped(t testing.TB, mapper *BatchMapper, observation Observation, sink telemetrycore.BatchSink) {
	t.Helper()
	if err := mapper.WriteObservation(context.Background(), observation, sink); err != nil {
		t.Fatal(err)
	}
}

func menuObservation() Observation {
	return Observation{
		Source:        SourceCanonical,
		ReceivedUTC:   time.Unix(1, 0).UTC(),
		Compatibility: CompatibilityKnown,
		SourceTime:    observed(time.Second),
		TrackName:     observed("Track-01"),
		SessionType:   observed(session.TypePractice),
		VehicleCount:  observed(schema.Count(0)),
		PlayerPresent: observed(false),
	}
}

func trackObservation(slots ...VehicleSourceID) Observation {
	result := menuObservation()
	result.Vehicles = make([]VehicleObservation, len(slots))
	result.VehicleCount = observed(schema.Count(len(slots)))
	result.PlayerPresent = observed(len(slots) > 0)
	for index, slot := range slots {
		result.Vehicles[index] = VehicleObservation{
			SourceID:      slot,
			Player:        observed(index == 0),
			Position:      observed(standings.Position(index + 1)),
			CompletedLaps: observed(standings.CompletedLaps(0)),
			WorldPosition: observed(spatial.Position{X: float64(slot)}),
			LocalVelocity: observed(spatial.LocalVelocity{Z: -1}),
			Orientation: observed(spatial.Orientation{
				Row0: spatial.Vector3{X: 1},
				Row1: spatial.Vector3{Y: 1},
				Row2: spatial.Vector3{Z: 1},
			}),
		}
	}
	return result
}

func sourceSlotFromVehicleID(value identity.VehicleID) int {
	var slot, generation int
	_, _ = fmt.Sscanf(string(value), "lmu-slot-%d-generation-%d", &slot, &generation)
	return slot
}

func assertCursor(t testing.TB, batch telemetrycore.Batch, epoch, sequence uint64) {
	t.Helper()
	if batch.Header.Cursor != (schema.Cursor{Epoch: schema.Epoch(epoch), Sequence: schema.Sequence(sequence)}) {
		t.Fatalf("cursor = %+v, want %d/%d", batch.Header.Cursor, epoch, sequence)
	}
}

func assertVehicleID(t testing.TB, batch telemetrycore.Batch, slot VehicleSourceID, want identity.VehicleID) {
	t.Helper()
	for _, current := range batch.State.Vehicles {
		if current.Identity.Vehicle == want {
			return
		}
	}
	t.Fatalf("slot %d identity %q not found", slot, want)
}
