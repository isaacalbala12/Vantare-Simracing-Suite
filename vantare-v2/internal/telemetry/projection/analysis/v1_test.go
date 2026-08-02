package analysis

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
)

func TestProjectV1GoldenKeepsZeroAndMissingDistinct(t *testing.T) {
	observed := schema.ProvenanceObserved
	fresh := schema.FreshnessFresh
	lap, err := schema.NewField(session.LapNumber(2), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	speed, err := schema.NewField(0.0, observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	brake, err := schema.NewField(schema.Ratio(0), observed, fresh)
	if err != nil {
		t.Fatal(err)
	}
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 4, Sequence: 9},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
	}
	input, err := envelope.NewSnapshot(header, derive.FinalState{Observed: core.ObservedState{
		TrackName: schema.MissingField[string](),
		Vehicles:  []core.VehicleState{{Identity: header.Identity, LapNumber: lap, SpeedMPS: speed, Brake: brake}},
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
	if !got.Player.Speed.Present || got.Player.Speed.Value != 0 || got.Player.Throttle.Present {
		t.Fatalf("zero/missing distinction lost: speed=%+v throttle=%+v", got.Player.Speed, got.Player.Throttle)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(filepath.Join("testdata", "analysis_v1.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded)+"\n" != string(want) {
		t.Fatalf("golden mismatch\n got: %s\nwant: %s", encoded, want)
	}
}

func TestProjectV1WithoutActiveVehicleEmitsExplicitMissingPlayer(t *testing.T) {
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 4, Sequence: 10},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 12, 1, 0, 0, time.UTC)),
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
	const want = `{"id":"v","lapNumber":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"gear":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"engineRpm":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"speedMps":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"throttle":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"brake":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"clutch":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"}}`
	if string(encoded) != want {
		t.Fatalf("player JSON = %s\nwant: %s", encoded, want)
	}
}
