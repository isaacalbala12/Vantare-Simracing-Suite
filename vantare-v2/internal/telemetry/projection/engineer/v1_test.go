package engineer

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestProjectV1GoldenMissingAndCapabilities(t *testing.T) {
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
	assertGolden(t, got, "engineer_v1.golden.json")
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
	encoded, err := json.Marshal(got.Player)
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"id":"car-4","lapNumber":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"gear":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"engineRpm":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"speedMps":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"throttle":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"brake":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"clutch":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"position":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"completedLaps":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"inPit":{"present":false,"value":false,"provenance":"unknown","freshness":"missing"},"pitStopCount":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"}}`
	if string(encoded) != want {
		t.Fatalf("player JSON = %s\nwant: %s", encoded, want)
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
	return identity.RunIdentity{Event: "event-2", Session: "session-2", Vehicle: "car-4"}
}

func assertGolden(t *testing.T, value any, name string) {
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
		t.Fatalf("golden mismatch\n got: %s\nwant: %s", got, want)
	}
}
