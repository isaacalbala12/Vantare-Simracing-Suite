package engineer

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestProjectV1PreservesMissingZeroAndCapabilities(t *testing.T) {
	snapshot := engineerInput(t)
	got, err := ProjectV1(snapshot)
	if err != nil {
		t.Fatalf("ProjectV1() error = %v", err)
	}
	if got.Player.Throttle.Value != 0 || !got.Player.Throttle.Present {
		t.Fatalf("fresh zero throttle lost presence: %+v", got.Player.Throttle)
	}
	if got.Player.Speed.Freshness != "stale" {
		t.Fatalf("stale speed = %+v", got.Player.Speed)
	}
	if got.TrackName.Present || got.TrackName.Freshness != "missing" {
		t.Fatalf("missing track = %+v", got.TrackName)
	}
	if len(got.Capabilities) != 3 {
		t.Fatalf("capabilities = %v, want 3 explicit capabilities", got.Capabilities)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"previousIdentity", "raw", "memoryMapped", "restPayload"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("projection leaked internal field %q: %s", forbidden, encoded)
		}
	}
}

func TestProjectObservationV1AcceptsLapNumberAsOnlyStandingsSignal(t *testing.T) {
	observed := schema.ProvenanceObserved
	fresh := schema.FreshnessFresh
	lapNumber, err := schema.NewField(session.LapNumber(7), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	input, err := envelope.NewSnapshot(
		engineerHeader(),
		derive.FinalState{Observed: core.ObservedState{
			Vehicles: []core.VehicleState{{
				Identity:  headerIdentity(),
				LapNumber: lapNumber,
			}},
		}},
		func(value derive.FinalState) derive.FinalState {
			value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
			return value
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	projected, err := ProjectV1(input)
	if err != nil {
		t.Fatalf("ProjectV1() error = %v", err)
	}
	if len(projected.Capabilities) != 1 || projected.Capabilities[0] != GroupStandings {
		t.Fatalf("capabilities = %v, want [%s]", projected.Capabilities, GroupStandings)
	}

	observation, err := ProjectObservationV1(input, mustManifest(t,
		Capability{ID: CapabilityStandings, State: CapabilitySupported},
	))
	if err != nil {
		t.Fatalf("ProjectObservationV1() error = %v", err)
	}
	if value, present := observation.Player.LapNumber.Value(); !present || value != 7 ||
		observation.Player.LapNumber.State() != ValueFresh ||
		!observation.Player.LapNumber.Usable() {
		t.Fatalf(
			"lap number = value:%d present:%t state:%v usable:%t",
			value,
			present,
			observation.Player.LapNumber.State(),
			observation.Player.LapNumber.Usable(),
		)
	}
}

func TestProjectFactV1MapsOrderedFactWithoutCanonicalLeakage(t *testing.T) {
	header := engineerHeader()
	fact := envelope.NewFact(header, core.SessionFact{
		Sequence:    12,
		Kind:        core.FactLapCompleted,
		OccurredUTC: time.Date(2026, 7, 28, 9, 1, 0, 0, time.UTC),
		Identity:    header.Identity,
		Lap:         7,
	})
	got, err := ProjectFactV1(fact)
	if err != nil {
		t.Fatalf("ProjectFactV1() error = %v", err)
	}
	if got.Fact.Sequence != 12 || got.Fact.Kind != FactLapCompleted || got.Fact.Lap != 7 {
		t.Fatalf("fact = %+v", got.Fact)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) == "" || strings.Contains(string(encoded), "previousIdentity") ||
		strings.Contains(string(encoded), "source") || strings.Contains(string(encoded), "clock") {
		t.Fatalf("fact envelope leaked canonical internals: %s", encoded)
	}
}

func TestProjectFactV1RejectsUnknownFact(t *testing.T) {
	_, err := ProjectFactV1(envelope.NewFact(engineerHeader(), core.SessionFact{Kind: core.FactKind(255)}))
	if !errors.Is(err, ErrUnknownFactKind) {
		t.Fatalf("ProjectFactV1() error = %v, want ErrUnknownFactKind", err)
	}
}

func TestProjectV1WithoutActiveVehicleEmitsExplicitMissingPlayer(t *testing.T) {
	input, err := envelope.NewSnapshot(engineerHeader(), derive.FinalState{Observed: core.ObservedState{}}, func(value derive.FinalState) derive.FinalState {
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := ProjectV1(input)
	if err != nil {
		t.Fatal(err)
	}
	if got.Player.ID != "car-4" || len(got.Vehicles) != 0 {
		t.Fatalf("missing player identity/grid = id:%q vehicles:%d", got.Player.ID, len(got.Vehicles))
	}
	for name, field := range map[string]projection.Freshness{
		"lap":      got.Player.LapNumber.Freshness,
		"fuel":     got.Player.FuelLiters.Freshness,
		"position": got.Player.WorldPosition.Freshness,
	} {
		if field != projection.FreshnessMissing {
			t.Fatalf("%s freshness = %s, want missing", name, field)
		}
	}
}

func engineerInput(t *testing.T) envelope.Snapshot[derive.FinalState] {
	t.Helper()
	observed := schema.ProvenanceObserved
	fresh := schema.FreshnessFresh
	sessionType, err := schema.NewField(session.TypeEndurance, observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	position, err := schema.NewField(standings.Position(3), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	speed, err := schema.NewField(64.25, observed, schema.FreshnessStale)
	if err != nil {
		t.Fatal(err)
	}
	throttle, err := schema.NewField(schema.Ratio(0), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	state := core.ObservedState{
		TrackName:   schema.MissingField[string](),
		SessionType: sessionType,
		Vehicles: []core.VehicleState{{
			Identity: headerIdentity(),
			SpeedMPS: speed,
			Throttle: throttle,
			Position: position,
		}},
	}
	final := derive.FinalState{Observed: state}
	result, err := envelope.NewSnapshot(engineerHeader(), final, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = append([]core.VehicleState(nil), value.Observed.Vehicles...)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func engineerHeader() envelope.Header {
	return envelope.Header{
		Cursor:   schema.Cursor{Epoch: 3, Sequence: 5},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 9, 0, 0, 0, time.UTC)),
		Identity: headerIdentity(),
	}
}

func headerIdentity() identity.RunIdentity {
	return identity.RunIdentity{
		Event:   "event-2",
		Session: "session-2",
		Vehicle: "car-4",
		Team:    "team-2",
		Driver:  "driver-2",
	}
}
