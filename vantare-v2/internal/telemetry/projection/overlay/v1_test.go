package overlay

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

func TestProjectV1GoldenAndOwnership(t *testing.T) {
	snapshot := overlayInput(t)

	projected, err := (ProjectorV1{}).Project(snapshot)
	if err != nil {
		t.Fatalf("ProjectorV1.Project() error = %v", err)
	}
	payload, ok := projected.Value()
	if !ok {
		t.Fatal("ProjectorV1.Project() returned empty snapshot")
	}
	payload.Vehicles[0].Name.Value = "mutated"
	payload.History.Samples[0].Brake = 0
	payload.DeltaHistory.Samples[0].DeltaSeconds = 99
	ownedAgain, ok := projected.Value()
	if !ok || ownedAgain.Vehicles[0].Name.Value != "Vantare GT" || ownedAgain.History.Samples[0].Brake != 1 || ownedAgain.DeltaHistory.Samples[0].DeltaSeconds != -0.25 {
		t.Fatalf("projector output shares mutable state: vehicles=%+v controls=%+v delta=%+v", ownedAgain.Vehicles, ownedAgain.History, ownedAgain.DeltaHistory)
	}

	got, err := ProjectV1(snapshot)
	if err != nil {
		t.Fatalf("ProjectV1() error = %v", err)
	}
	got.Vehicles[0].Name.Value = "mutated"
	again, err := ProjectV1(snapshot)
	if err != nil {
		t.Fatalf("ProjectV1() second error = %v", err)
	}
	if again.Vehicles[0].Name.Value != "Vantare GT" {
		t.Fatalf("projection shares mutable state: name = %q", again.Vehicles[0].Name.Value)
	}

	assertGoldenJSON(t, again, "overlay_v1.golden.json")
}

func TestProjectDeltaHistoryMissingUsesOwnedEmptyArray(t *testing.T) {
	snapshot := overlayInput(t)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("input snapshot is empty")
	}
	final.Derived.Delta = derive.SelfDelta{}
	withoutDelta, err := envelope.NewSnapshot(snapshot.Header(), final, func(value derive.FinalState) derive.FinalState {
		return value
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := ProjectV1(withoutDelta)
	if err != nil {
		t.Fatal(err)
	}
	if got.DeltaHistory.Present || got.DeltaHistory.Freshness != projection.FreshnessMissing || got.DeltaHistory.Samples == nil || len(got.DeltaHistory.Samples) != 0 {
		t.Fatalf("missing delta history = %+v, want explicit owned empty array", got.DeltaHistory)
	}
	encoded, err := json.Marshal(got.DeltaHistory)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"present":false,"provenance":"derived","freshness":"missing","samples":[]}` {
		t.Fatalf("missing delta history JSON = %s", encoded)
	}
}

func TestProjectDeltaHistoryRetainsOwnedSamplesWhenCurrentDeltaIsMissing(t *testing.T) {
	snapshot := overlayInput(t)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("input snapshot is empty")
	}
	first := final.Derived.Delta.History[0]
	second := first
	second.Cursor.Sequence++
	second.CapturedAt = second.CapturedAt.Add(100 * time.Millisecond)
	second.SourceTime += 100 * time.Millisecond
	second.LapDistance += 5
	second.Seconds -= 0.01
	final.Derived.Delta = derive.SelfDelta{
		Freshness: schema.FreshnessMissing,
		History:   []derive.DeltaSample{first, second},
	}
	retained, err := envelope.NewSnapshot(snapshot.Header(), final, func(value derive.FinalState) derive.FinalState {
		value.Derived.Delta.History = append([]derive.DeltaSample(nil), value.Derived.Delta.History...)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := ProjectV1(retained)
	if err != nil {
		t.Fatal(err)
	}
	if !got.DeltaHistory.Present || got.DeltaHistory.Freshness != projection.FreshnessMissing || len(got.DeltaHistory.Samples) != 2 {
		t.Fatalf("retained missing delta history = %+v", got.DeltaHistory)
	}
	if got.DeltaHistory.Samples[0].CapturedAtMillis == got.DeltaHistory.Samples[1].CapturedAtMillis {
		t.Fatalf("retained sample timestamps collapsed: %+v", got.DeltaHistory.Samples)
	}
}

func TestProjectV1RejectsUnknownDeltaReference(t *testing.T) {
	snapshot := overlayInput(t)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("input snapshot is empty")
	}
	final.Derived.Delta.Reference = testField(t, session.DeltaReference(99), schema.ProvenanceDerived, schema.FreshnessFresh)
	invalid, err := envelope.NewSnapshot(snapshot.Header(), final, func(value derive.FinalState) derive.FinalState {
		return value
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := (ProjectorV1{}).Project(invalid); err == nil {
		t.Fatal("ProjectorV1.Project() accepted an unknown delta reference")
	}
}

func TestProjectV1MissingQualityAndCapabilities(t *testing.T) {
	got, err := ProjectV1(overlayInput(t))
	if err != nil {
		t.Fatalf("ProjectV1() error = %v", err)
	}
	if got.TrackName.Present || got.TrackName.Freshness != "missing" {
		t.Fatalf("missing track = %+v", got.TrackName)
	}
	if !got.Vehicles[0].Throttle.Present || got.Vehicles[0].Throttle.Value != 0 {
		t.Fatalf("fresh zero throttle lost presence: %+v", got.Vehicles[0].Throttle)
	}
	if got.Vehicles[1].Speed.Freshness != "stale" {
		t.Fatalf("stale speed = %+v", got.Vehicles[1].Speed)
	}
	want := []Capability{CapabilitySession, CapabilityStandings, CapabilityControls, CapabilityPit, CapabilityHistory}
	if len(got.Capabilities) != len(want) {
		t.Fatalf("capabilities = %v, want %v", got.Capabilities, want)
	}
	for index := range want {
		if got.Capabilities[index] != want[index] {
			t.Fatalf("capabilities = %v, want %v", got.Capabilities, want)
		}
	}
}

func overlayInput(t *testing.T) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	observed := schema.ProvenanceObserved
	fresh := schema.FreshnessFresh
	stale := schema.FreshnessStale
	field := func(value float64, freshness schema.Freshness) schema.Field[float64] {
		result, err := schema.NewField(value, observed, freshness)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	ratio := func(value schema.Ratio) schema.Field[schema.Ratio] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	name := func(value vehicle.VehicleName) schema.Field[vehicle.VehicleName] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	position := func(value standings.Position) schema.Field[standings.Position] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	laps := func(value standings.CompletedLaps) schema.Field[standings.CompletedLaps] {
		result, err := schema.NewField(value, observed, fresh)
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	inPit, err := schema.NewField(pit.InPit(false), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	sessionType, err := schema.NewField(session.TypeRace, observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	header := envelope.Header{
		Cursor: schema.Cursor{Epoch: 2, Sequence: 8},
		Clock:  schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 9, 0, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{
			Event: "event-1", Session: "session-1", Vehicle: "car-7",
		},
	}
	state := core.ObservedState{
		SourceTime:    testField(t, 3600*time.Second, observed, fresh),
		EndTime:       testField(t, session.EndTime(7200), observed, fresh),
		MaximumLaps:   testField(t, session.MaximumLaps(0), observed, fresh),
		TrackName:     schema.MissingField[string](),
		SessionType:   sessionType,
		PlayerPresent: testField(t, true, observed, fresh),
		Vehicles: []core.VehicleState{
			{
				Identity:         header.Identity,
				DriverName:       testField(t, identity.DriverName("Player"), observed, fresh),
				Name:             name("Vantare GT"),
				VehicleClass:     testField(t, standings.VehicleClass("HYPERCAR"), observed, fresh),
				Player:           testField(t, true, observed, fresh),
				Sector:           testField(t, standings.SectorTwo, observed, fresh),
				LapDistance:      testField(t, standings.LapDistance(1234.5), observed, fresh),
				BestLapTime:      testField(t, standings.LapTime(90.5), observed, fresh),
				LastLapTime:      testField(t, standings.LapTime(91.25), observed, fresh),
				EstimatedLapTime: testField(t, standings.LapTime(90.75), observed, fresh),
				SpeedMPS:         field(0, fresh),
				Throttle:         ratio(0),
				Brake:            ratio(1),
				Clutch:           ratio(0),
				Position:         position(2),
				CompletedLaps:    laps(4),
				InPit:            inPit,
				PenaltyCount:     testField(t, standings.PenaltyCount(0), observed, fresh),
				TimeBehindLeader: testField(t, standings.TimeGap(10), observed, fresh),
				LapsBehindLeader: testField(t, standings.LapGap(0), observed, fresh),
				TimeBehindNext:   testField(t, standings.TimeGap(1.5), observed, fresh),
				LapsBehindNext:   testField(t, standings.LapGap(0), observed, fresh),
				Fuel:             testField(t, energy.Fuel{Amount: 40, Capacity: 100}, observed, fresh),
			},
			{
				Identity:         identity.RunIdentity{Event: "event-1", Session: "session-1", Vehicle: "car-9"},
				DriverName:       testField(t, identity.DriverName("Rival Driver"), observed, fresh),
				Name:             name("Rival"),
				VehicleClass:     testField(t, standings.VehicleClass("HYPERCAR"), observed, fresh),
				Player:           testField(t, false, observed, fresh),
				Sector:           testField(t, standings.SectorThree, observed, fresh),
				LapDistance:      testField(t, standings.LapDistance(1300), observed, fresh),
				BestLapTime:      testField(t, standings.LapTime(89.75), observed, fresh),
				LastLapTime:      testField(t, standings.LapTime(90.8), observed, fresh),
				EstimatedLapTime: testField(t, standings.LapTime(90.2), observed, fresh),
				SpeedMPS:         field(72.5, stale),
				Position:         position(1),
				CompletedLaps:    laps(4),
				InPit:            schema.MissingField[pit.InPit](),
				PenaltyCount:     testField(t, standings.PenaltyCount(0), observed, fresh),
				TimeBehindLeader: testField(t, standings.TimeGap(8), observed, fresh),
				LapsBehindLeader: testField(t, standings.LapGap(0), observed, fresh),
				TimeBehindNext:   testField(t, standings.TimeGap(2), observed, fresh),
				LapsBehindNext:   testField(t, standings.LapGap(0), observed, fresh),
			},
		},
	}
	final := derive.FinalState{
		Observed: state,
		Derived: derive.DerivedState{
			SessionRemaining: testField(t, session.RemainingTime(3600), schema.ProvenanceDerived, fresh),
			Gaps: derive.GapSet{Freshness: fresh, Vehicles: []derive.VehicleGap{
				{Vehicle: "car-7", Time: testField(t, standings.RelativeTime(0), schema.ProvenanceDerived, fresh), Laps: testField(t, standings.RelativeLaps(0), schema.ProvenanceDerived, fresh)},
				{Vehicle: "car-9", Time: testField(t, standings.RelativeTime(2), schema.ProvenanceDerived, fresh), Laps: testField(t, standings.RelativeLaps(0), schema.ProvenanceDerived, fresh)},
			}},
			Delta: derive.SelfDelta{
				Freshness: fresh,
				Seconds:   testField(t, session.DeltaSeconds(-0.25), schema.ProvenanceDerived, fresh),
				Reference: testField(t, session.DeltaReferenceBestCompletedPlayerLap, schema.ProvenanceDerived, fresh),
				History:   []derive.DeltaSample{{Cursor: header.Cursor, CapturedAt: header.Clock.ReceivedUTC, SourceTime: 3600 * time.Second, LapDistance: 1234.5, Seconds: -0.25}},
			},
			ControlsHistory: derive.ControlHistory{
				Freshness: schema.FreshnessFresh,
				Samples: []derive.ControlSample{{
					Cursor: header.Cursor, Vehicle: "car-7", Throttle: 0, Brake: 1, Clutch: 0,
				}},
			},
		},
	}
	result, err := envelope.NewSnapshot(header, final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
		value.Derived.ControlsHistory.Samples = append([]derive.ControlSample(nil), value.Derived.ControlsHistory.Samples...)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func testField[T comparable](t testing.TB, value T, provenance schema.Provenance, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	field, err := schema.NewField(value, provenance, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return field
}

func assertGoldenJSON(t *testing.T, value any, name string) {
	t.Helper()
	got, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if string(got)+"\n" != string(want) {
		t.Fatalf("golden mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}
