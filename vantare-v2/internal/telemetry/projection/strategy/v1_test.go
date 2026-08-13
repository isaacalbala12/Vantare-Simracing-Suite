package strategy

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
)

func TestProjectV1GoldenKeepsUnsupportedStrategyInputsOut(t *testing.T) {
	observed := schema.ProvenanceObserved
	fresh := schema.FreshnessFresh
	sessionType, err := schema.NewField(session.TypeRace, observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	lap, err := schema.NewField(session.LapNumber(8), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	inPit, err := schema.NewField(pit.InPit(false), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	sourceTime := strategyTestField(t, 12500*time.Millisecond, observed, fresh)
	endTime := strategyTestField(t, session.EndTime(7200), observed, fresh)
	remaining := strategyTestField(t, session.RemainingTime(7187.5), schema.ProvenanceDerived, fresh)
	maximumLaps := strategyTestField(t, session.MaximumLaps(0), observed, fresh)
	sector := strategyTestField(t, standings.SectorTwo, observed, fresh)
	lapDistance := strategyTestField(t, standings.LapDistance(0), observed, fresh)
	fuel := strategyTestField(t, energy.Fuel{Amount: 0, Capacity: 115}, observed, fresh)
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: 2},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 11, 0, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
	}
	input, err := envelope.NewSnapshot(header, derive.FinalState{Observed: core.ObservedState{
		SourceTime:  sourceTime,
		EndTime:     endTime,
		MaximumLaps: maximumLaps,
		SessionType: sessionType,
		Vehicles: []core.VehicleState{{
			Identity: header.Identity, LapNumber: lap, InPit: inPit,
			Sector: sector, LapDistance: lapDistance, Fuel: fuel,
		}},
	}, Derived: derive.DerivedState{
		SessionRemaining: remaining,
	}}, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := ProjectV1(input)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(filepath.Join("testdata", "strategy_v1.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded)+"\n" != string(want) {
		t.Fatalf("golden mismatch\n got: %s\nwant: %s", encoded, want)
	}
	for _, unsupported := range []string{"virtualEnergy", "tyres", "compound", "wear", "weather"} {
		if strings.Contains(string(encoded), unsupported) {
			t.Fatalf("Strategy v1 golden leaks unsupported family %q", unsupported)
		}
	}
}

func TestProjectV1WithoutActiveVehicleEmitsExplicitMissingPlayer(t *testing.T) {
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: 3},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 11, 1, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
	}
	input, err := envelope.NewSnapshot(header, derive.FinalState{Observed: core.ObservedState{}}, func(value derive.FinalState) derive.FinalState {
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := ProjectV1(input)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(got.Player)
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"id":"v","lapNumber":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"completedLaps":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"sector":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"lapDistanceMeters":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"inPit":{"present":false,"value":false,"provenance":"unknown","freshness":"missing"},"pitStopCount":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"fuelLiters":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"fuelCapacityLiters":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"}}`
	if string(encoded) != want {
		t.Fatalf("player JSON = %s\nwant: %s", encoded, want)
	}
}

func TestProjectV1PreservesFreshStaleInvalidAndMissingWithoutFallbacks(t *testing.T) {
	tests := []struct {
		name       string
		freshness  schema.Freshness
		missing    bool
		available  bool
		provenance projection.Provenance
	}{
		{name: "fresh fields are available", freshness: schema.FreshnessFresh, available: true, provenance: projection.ProvenanceObserved},
		{name: "stale fields preserve quality and remain available", freshness: schema.FreshnessStale, available: true, provenance: projection.ProvenanceObserved},
		{name: "invalid fields preserve quality and are unavailable", freshness: schema.FreshnessInvalid, provenance: projection.ProvenanceObserved},
		{name: "missing fields remain explicit and unavailable", freshness: schema.FreshnessMissing, missing: true, provenance: projection.ProvenanceUnknown},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			final := derive.FinalState{}
			if !test.missing {
				final.Observed.SourceTime = strategyTestField(t, 2500*time.Millisecond, schema.ProvenanceObserved, test.freshness)
				final.Observed.EndTime = strategyTestField(t, session.EndTime(60), schema.ProvenanceObserved, test.freshness)
				final.Observed.MaximumLaps = strategyTestField(t, session.MaximumLaps(42), schema.ProvenanceObserved, test.freshness)
				final.Derived.SessionRemaining = strategyTestField(t, session.RemainingTime(57.5), schema.ProvenanceDerived, test.freshness)
				final.Observed.Vehicles = []core.VehicleState{{
					Identity:    identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
					Sector:      strategyTestField(t, standings.SectorTwo, schema.ProvenanceObserved, test.freshness),
					LapDistance: strategyTestField(t, standings.LapDistance(1200.5), schema.ProvenanceObserved, test.freshness),
					Fuel:        strategyTestField(t, energy.Fuel{Amount: 25.5, Capacity: 100}, schema.ProvenanceObserved, test.freshness),
				}}
			}

			got := projectStrategyTestState(t, final)
			wantFreshness := projection.FromFreshness(test.freshness)
			for name, metadata := range map[string]struct {
				present    bool
				provenance projection.Provenance
				freshness  projection.Freshness
			}{
				"source time":  {got.SourceTime.Present, got.SourceTime.Provenance, got.SourceTime.Freshness},
				"end time":     {got.EndTime.Present, got.EndTime.Provenance, got.EndTime.Freshness},
				"remaining":    {got.Remaining.Present, got.Remaining.Provenance, got.Remaining.Freshness},
				"maximum laps": {got.MaximumLaps.Present, got.MaximumLaps.Provenance, got.MaximumLaps.Freshness},
				"sector":       {got.Player.Sector.Present, got.Player.Sector.Provenance, got.Player.Sector.Freshness},
				"lap distance": {got.Player.LapDistance.Present, got.Player.LapDistance.Provenance, got.Player.LapDistance.Freshness},
			} {
				wantPresent := !test.missing
				wantProvenance := test.provenance
				if name == "remaining" && !test.missing {
					wantProvenance = projection.ProvenanceDerived
				}
				if metadata.present != wantPresent || metadata.provenance != wantProvenance || metadata.freshness != wantFreshness {
					t.Fatalf("%s metadata = %+v, want present:%t provenance:%s freshness:%s", name, metadata, wantPresent, wantProvenance, wantFreshness)
				}
			}
			if !test.missing && got.SourceTime.Value != 2.5 {
				t.Fatalf("sourceTimeSeconds = %v, want 2.5", got.SourceTime.Value)
			}
			if !test.missing && (got.EndTime.Value != 60 || got.Remaining.Value != 57.5 || got.MaximumLaps.Value != 42 ||
				got.Player.Sector.Value != standings.SectorTwo || got.Player.LapDistance.Value != 1200.5) {
				t.Fatalf(
					"projected values = end:%v remaining:%v maximumLaps:%v sector:%v lapDistance:%v",
					got.EndTime.Value, got.Remaining.Value, got.MaximumLaps.Value, got.Player.Sector.Value, got.Player.LapDistance.Value,
				)
			}
			if got.Player.FuelLiters.Present != got.Player.FuelCapacity.Present ||
				got.Player.FuelLiters.Provenance != got.Player.FuelCapacity.Provenance ||
				got.Player.FuelLiters.Freshness != got.Player.FuelCapacity.Freshness {
				t.Fatalf("fuel amount/capacity lost atomic quality: amount=%+v capacity=%+v", got.Player.FuelLiters, got.Player.FuelCapacity)
			}
			if got.Player.FuelLiters.Present != !test.missing || got.Player.FuelLiters.Provenance != test.provenance || got.Player.FuelLiters.Freshness != wantFreshness {
				t.Fatalf("fuel quality = %+v, want present:%t provenance:%s freshness:%s", got.Player.FuelLiters, !test.missing, test.provenance, wantFreshness)
			}
			if !test.missing && (got.Player.FuelLiters.Value != 25.5 || got.Player.FuelCapacity.Value != 100) {
				t.Fatalf("fuel values = %v/%v, want 25.5/100", got.Player.FuelLiters.Value, got.Player.FuelCapacity.Value)
			}
			var wantCapabilities []Capability
			if test.available {
				wantCapabilities = []Capability{CapabilitySession, CapabilityProgress, CapabilityFuel}
			}
			if !reflect.DeepEqual(got.Capabilities, wantCapabilities) {
				t.Fatalf("capabilities = %v, want %v", got.Capabilities, wantCapabilities)
			}
		})
	}
}

func TestProjectV1DerivesCapabilitiesFromEachAvailableAdditiveField(t *testing.T) {
	observed, fresh := schema.ProvenanceObserved, schema.FreshnessFresh
	tests := []struct {
		name string
		want Capability
		set  func(testing.TB, *derive.FinalState)
	}{
		{name: "source time contributes session", want: CapabilitySession, set: func(t testing.TB, final *derive.FinalState) {
			final.Observed.SourceTime = strategyTestField(t, time.Second, observed, fresh)
		}},
		{name: "end time contributes session", want: CapabilitySession, set: func(t testing.TB, final *derive.FinalState) {
			final.Observed.EndTime = strategyTestField(t, session.EndTime(60), observed, fresh)
		}},
		{name: "remaining contributes session", want: CapabilitySession, set: func(t testing.TB, final *derive.FinalState) {
			final.Derived.SessionRemaining = strategyTestField(t, session.RemainingTime(30), schema.ProvenanceDerived, fresh)
		}},
		{name: "maximum laps contributes session", want: CapabilitySession, set: func(t testing.TB, final *derive.FinalState) {
			final.Observed.MaximumLaps = strategyTestField(t, session.MaximumLaps(42), observed, fresh)
		}},
		{name: "sector contributes progress", want: CapabilityProgress, set: func(t testing.TB, final *derive.FinalState) {
			final.Observed.Vehicles[0].Sector = strategyTestField(t, standings.SectorOne, observed, fresh)
		}},
		{name: "lap distance contributes progress", want: CapabilityProgress, set: func(t testing.TB, final *derive.FinalState) {
			final.Observed.Vehicles[0].LapDistance = strategyTestField(t, standings.LapDistance(1), observed, fresh)
		}},
		{name: "atomic fuel contributes fuel", want: CapabilityFuel, set: func(t testing.TB, final *derive.FinalState) {
			final.Observed.Vehicles[0].Fuel = strategyTestField(t, energy.Fuel{Amount: 1, Capacity: 2}, observed, fresh)
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			final := derive.FinalState{Observed: core.ObservedState{Vehicles: []core.VehicleState{{
				Identity: identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
			}}}}
			test.set(t, &final)
			got := projectStrategyTestState(t, final)
			if want := []Capability{test.want}; !reflect.DeepEqual(got.Capabilities, want) {
				t.Fatalf("capabilities = %v, want %v", got.Capabilities, want)
			}
		})
	}
}

func TestProjectV1KeepsPresentZeroValuesAvailable(t *testing.T) {
	observed, fresh := schema.ProvenanceObserved, schema.FreshnessFresh
	got := projectStrategyTestState(t, derive.FinalState{
		Observed: core.ObservedState{
			SourceTime:  strategyTestField(t, time.Duration(0), observed, fresh),
			EndTime:     strategyTestField(t, session.EndTime(0), observed, fresh),
			MaximumLaps: strategyTestField(t, session.MaximumLaps(0), observed, fresh),
			Vehicles: []core.VehicleState{{
				Identity:    identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
				Sector:      strategyTestField(t, standings.Sector(0), observed, fresh),
				LapDistance: strategyTestField(t, standings.LapDistance(0), observed, fresh),
				Fuel:        strategyTestField(t, energy.Fuel{Amount: 0, Capacity: 0}, observed, fresh),
			}},
		},
		Derived: derive.DerivedState{SessionRemaining: strategyTestField(t, session.RemainingTime(0), schema.ProvenanceDerived, fresh)},
	})
	if !got.SourceTime.Present || got.SourceTime.Value != 0 || !got.EndTime.Present || !got.Remaining.Present || !got.MaximumLaps.Present ||
		!got.Player.Sector.Present || !got.Player.LapDistance.Present || !got.Player.FuelLiters.Present || !got.Player.FuelCapacity.Present {
		t.Fatalf("present zero was converted to absence: %+v", got)
	}
	if want := []Capability{CapabilitySession, CapabilityProgress, CapabilityFuel}; !reflect.DeepEqual(got.Capabilities, want) {
		t.Fatalf("capabilities = %v, want %v", got.Capabilities, want)
	}
}

func TestStrategyV1JSONCompatibilityMatrixIsAdditive(t *testing.T) {
	oldProducer := readStrategyGolden(t, "strategy_v1_pre_tc10b.golden.json")
	newProducer := readStrategyGolden(t, "strategy_v1.golden.json")
	wantLegacy := expectedLegacyStrategySnapshotV1()

	tests := []struct {
		name     string
		producer []byte
		consumer string
		check    func(testing.TB, []byte)
	}{
		{name: "old producer old consumer", producer: oldProducer, consumer: "old", check: func(t testing.TB, raw []byte) {
			if got := decodeLegacyStrategyV1(t, raw); !reflect.DeepEqual(got, wantLegacy) {
				t.Fatalf("old/old changed legacy contract: got %+v want %+v", got, wantLegacy)
			}
		}},
		{name: "old producer new consumer", producer: oldProducer, consumer: "new", check: func(t testing.TB, raw []byte) {
			got := decodeCurrentStrategyV1(t, raw)
			if legacy := legacyStrategySubset(got); !reflect.DeepEqual(legacy, wantLegacy) {
				t.Fatalf("old/new changed legacy fields: got %+v want %+v", legacy, wantLegacy)
			}
			assertStrategyAdditionsMissing(t, got)
		}},
		{name: "new producer old consumer", producer: newProducer, consumer: "old", check: func(t testing.TB, raw []byte) {
			assertStrategyWireCapabilities(t, raw, []Capability{CapabilitySession, CapabilityProgress, CapabilityPit, CapabilityFuel})
			if got := decodeLegacyStrategyV1(t, raw); !reflect.DeepEqual(got, wantLegacy) {
				t.Fatalf("new/old did not preserve the legacy subset: got %+v want %+v", got, wantLegacy)
			}
		}},
		{name: "new producer new consumer", producer: newProducer, consumer: "new", check: func(t testing.TB, raw []byte) {
			got := decodeCurrentStrategyV1(t, raw)
			if want := expectedCurrentStrategySnapshotV1(); !reflect.DeepEqual(got, want) {
				t.Fatalf("new/new contract mismatch: got %+v want %+v", got, want)
			}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if test.consumer == "" {
				t.Fatal("compatibility matrix requires an explicit consumer")
			}
			test.check(t, test.producer)
		})
	}
}

type legacyStrategySnapshotV1 struct {
	projection.Metadata
	Capabilities []Capability             `json:"capabilities"`
	TrackName    projection.Field[string] `json:"trackName"`
	SessionType  projection.Field[string] `json:"sessionType"`
	Player       legacyStrategyPlayerV1   `json:"player"`
}

type legacyStrategyPlayerV1 struct {
	ID            identity.VehicleID                        `json:"id"`
	LapNumber     projection.Field[session.LapNumber]       `json:"lapNumber"`
	CompletedLaps projection.Field[standings.CompletedLaps] `json:"completedLaps"`
	InPit         projection.Field[pit.InPit]               `json:"inPit"`
	PitStopCount  projection.Field[pit.StopCount]           `json:"pitStopCount"`
}

func expectedLegacyStrategySnapshotV1() legacyStrategySnapshotV1 {
	return legacyStrategySnapshotV1{
		Metadata: projection.Metadata{
			CanonicalVersion: 1, ProjectionVersion: 1, Epoch: 1, Sequence: 2,
			CapturedAt: "2026-07-28T11:00:00Z",
		},
		Capabilities: []Capability{CapabilitySession, CapabilityProgress, CapabilityPit},
		TrackName:    projection.MissingField[string](),
		SessionType: projection.Field[string]{
			Present: true, Value: "race", Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
		},
		Player: legacyStrategyPlayerV1{
			ID: "v",
			LapNumber: projection.Field[session.LapNumber]{
				Present: true, Value: 8, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
			},
			CompletedLaps: projection.MissingField[standings.CompletedLaps](),
			InPit: projection.Field[pit.InPit]{
				Present: true, Value: false, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
			},
			PitStopCount: projection.MissingField[pit.StopCount](),
		},
	}
}

func expectedCurrentStrategySnapshotV1() SnapshotV1 {
	return SnapshotV1{
		Metadata: projection.Metadata{
			CanonicalVersion: 1, ProjectionVersion: 1, Epoch: 1, Sequence: 2,
			CapturedAt: "2026-07-28T11:00:00Z",
		},
		PayloadV1: PayloadV1{
			Capabilities: []Capability{CapabilitySession, CapabilityProgress, CapabilityPit, CapabilityFuel},
			TrackName:    projection.MissingField[string](),
			SessionType: projection.Field[string]{
				Present: true, Value: "race", Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
			},
			SourceTime: projection.Field[float64]{
				Present: true, Value: 12.5, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
			},
			EndTime: projection.Field[session.EndTime]{
				Present: true, Value: 7200, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
			},
			Remaining: projection.Field[session.RemainingTime]{
				Present: true, Value: 7187.5, Provenance: projection.ProvenanceDerived, Freshness: projection.FreshnessFresh,
			},
			MaximumLaps: projection.Field[session.MaximumLaps]{
				Present: true, Value: 0, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
			},
			Player: PlayerV1{
				ID: "v",
				LapNumber: projection.Field[session.LapNumber]{
					Present: true, Value: 8, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
				},
				CompletedLaps: projection.MissingField[standings.CompletedLaps](),
				Sector: projection.Field[standings.Sector]{
					Present: true, Value: standings.SectorTwo, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
				},
				LapDistance: projection.Field[standings.LapDistance]{
					Present: true, Value: 0, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
				},
				InPit: projection.Field[pit.InPit]{
					Present: true, Value: false, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
				},
				PitStopCount: projection.MissingField[pit.StopCount](),
				FuelLiters: projection.Field[energy.FuelAmount]{
					Present: true, Value: 0, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
				},
				FuelCapacity: projection.Field[energy.FuelCapacity]{
					Present: true, Value: 115, Provenance: projection.ProvenanceObserved, Freshness: projection.FreshnessFresh,
				},
			},
		},
	}
}

func legacyStrategySubset(current SnapshotV1) legacyStrategySnapshotV1 {
	return legacyStrategySnapshotV1{
		Metadata:     current.Metadata,
		Capabilities: append([]Capability(nil), current.Capabilities...),
		TrackName:    current.TrackName,
		SessionType:  current.SessionType,
		Player: legacyStrategyPlayerV1{
			ID: current.Player.ID, LapNumber: current.Player.LapNumber, CompletedLaps: current.Player.CompletedLaps,
			InPit: current.Player.InPit, PitStopCount: current.Player.PitStopCount,
		},
	}
}

func assertStrategyWireCapabilities(t testing.TB, raw []byte, want []Capability) {
	t.Helper()
	var wire struct {
		Capabilities []Capability `json:"capabilities"`
	}
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(wire.Capabilities, want) {
		t.Fatalf("wire capabilities = %v, want %v", wire.Capabilities, want)
	}
}

func decodeLegacyStrategyV1(t testing.TB, raw []byte) legacyStrategySnapshotV1 {
	t.Helper()
	var result legacyStrategySnapshotV1
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	known := result.Capabilities[:0]
	for _, capability := range result.Capabilities {
		if capability == CapabilitySession || capability == CapabilityProgress || capability == CapabilityPit {
			known = append(known, capability)
		}
	}
	result.Capabilities = known
	return result
}

// decodeCurrentStrategyV1 is test-only compatibility behavior for STR-17: it
// normalizes fields absent from an old producer without creating a product consumer.
func decodeCurrentStrategyV1(t testing.TB, raw []byte) SnapshotV1 {
	t.Helper()
	var result SnapshotV1
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	if _, present := payload["sourceTimeSeconds"]; !present {
		result.SourceTime = projection.MissingField[float64]()
	}
	if _, present := payload["endTimeSeconds"]; !present {
		result.EndTime = projection.MissingField[session.EndTime]()
	}
	if _, present := payload["remainingSeconds"]; !present {
		result.Remaining = projection.MissingField[session.RemainingTime]()
	}
	if _, present := payload["maximumLaps"]; !present {
		result.MaximumLaps = projection.MissingField[session.MaximumLaps]()
	}
	var player map[string]json.RawMessage
	if err := json.Unmarshal(payload["player"], &player); err != nil {
		t.Fatal(err)
	}
	if _, present := player["sector"]; !present {
		result.Player.Sector = projection.MissingField[standings.Sector]()
	}
	if _, present := player["lapDistanceMeters"]; !present {
		result.Player.LapDistance = projection.MissingField[standings.LapDistance]()
	}
	if _, present := player["fuelLiters"]; !present {
		result.Player.FuelLiters = projection.MissingField[energy.FuelAmount]()
	}
	if _, present := player["fuelCapacityLiters"]; !present {
		result.Player.FuelCapacity = projection.MissingField[energy.FuelCapacity]()
	}
	return result
}

func assertStrategyAdditionsMissing(t testing.TB, got SnapshotV1) {
	t.Helper()
	for name, field := range map[string]any{
		"source time": got.SourceTime, "end time": got.EndTime, "remaining": got.Remaining, "maximum laps": got.MaximumLaps,
		"sector": got.Player.Sector, "lap distance": got.Player.LapDistance,
		"fuel liters": got.Player.FuelLiters, "fuel capacity": got.Player.FuelCapacity,
	} {
		encoded, err := json.Marshal(field)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(encoded), `"present":false`) || !strings.Contains(string(encoded), `"provenance":"unknown"`) || !strings.Contains(string(encoded), `"freshness":"missing"`) {
			t.Fatalf("%s was not normalized to explicit missing: %s", name, encoded)
		}
	}
}

func projectStrategyTestState(t testing.TB, final derive.FinalState) SnapshotV1 {
	t.Helper()
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: 1},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 8, 11, 10, 0, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
	}
	input, err := envelope.NewSnapshot(header, final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := ProjectV1(input)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func strategyTestField[T comparable](t testing.TB, value T, provenance schema.Provenance, freshness schema.Freshness) schema.Field[T] {
	t.Helper()
	field, err := schema.NewField(value, provenance, freshness)
	if err != nil {
		t.Fatal(err)
	}
	return field
}

func readStrategyGolden(t testing.TB, name string) []byte {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return payload
}
