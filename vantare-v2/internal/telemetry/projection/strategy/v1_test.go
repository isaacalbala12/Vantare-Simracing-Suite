package strategy

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
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
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
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 1, Sequence: 2},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 11, 0, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{Event: "e", Session: "s", Vehicle: "v"},
	}
	input, err := envelope.NewSnapshot(header, derive.FinalState{Observed: core.ObservedState{
		SessionType: sessionType,
		Vehicles:    []core.VehicleState{{Identity: header.Identity, LapNumber: lap, InPit: inPit}},
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
	const want = `{"id":"v","lapNumber":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"completedLaps":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"},"inPit":{"present":false,"value":false,"provenance":"unknown","freshness":"missing"},"pitStopCount":{"present":false,"value":0,"provenance":"unknown","freshness":"missing"}}`
	if string(encoded) != want {
		t.Fatalf("player JSON = %s\nwant: %s", encoded, want)
	}
}
