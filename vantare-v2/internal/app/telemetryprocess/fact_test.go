package telemetryprocess

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestDecodeRustEngineerFactFrame(t *testing.T) {
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "engineer-fact-frame-rust-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeEngineerFact(frame)
	if err != nil {
		t.Fatal(err)
	}
	if got.CanonicalVersion != 1 || got.ProjectionVersion != 1 || got.Epoch != 3 || got.Sequence != 5 ||
		got.CapturedAt != "2026-07-28T09:00:00Z" || got.Fact.Sequence != 12 ||
		got.Fact.Kind != engineer.FactLapCompleted || got.Fact.OccurredAt != "2026-07-28T09:01:00Z" ||
		got.Fact.VehicleID != "car-4" || got.Fact.Lap != 7 {
		t.Fatalf("decoded Rust fact = %+v", got)
	}
	header := envelope.Header{
		Cursor:   schema.Cursor{Epoch: 3, Sequence: 5},
		Clock:    schema.NewClock(schema.MissingField[time.Duration](), schema.MissingField[time.Duration](), time.Date(2026, 7, 28, 9, 0, 0, 0, time.UTC)),
		Identity: identity.RunIdentity{Event: "event-2", Session: "session-2", Vehicle: "car-4", Team: "team-2", Driver: "driver-2"},
	}
	want, err := engineer.ProjectFactV1(envelope.NewFact(header, core.SessionFact{
		Sequence: 12, Kind: core.FactLapCompleted,
		OccurredUTC: time.Date(2026, 7, 28, 9, 1, 0, 0, time.UTC),
		Identity:    header.Identity, Lap: 7,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Rust fact differs from Go projector: got %+v, want %+v", got, want)
	}
}

func TestDecodeEngineerFactRejectsWrongKindSchemaAndCursor(t *testing.T) {
	for _, frame := range []Frame{
		{Kind: KindSnapshot, Payload: []byte(`{}`)},
		{Kind: KindFact, Payload: []byte(`{"product":"other","fact":{}}`)},
		{Kind: KindFact, Payload: []byte(`{"product":"engineer-v1","fact":{},"extra":1}`)},
		{Kind: KindFact, Payload: []byte(`{"product":"engineer-v1","fact":{"canonicalVersion":1,"projectionVersion":1,"epoch":1,"sequence":1,"capturedAt":"2026-07-28T09:00:00Z","fact":{"sequence":0,"kind":"lap.completed","occurredAt":"2026-07-28T09:01:00Z"}}}`)},
		{Kind: KindFact, Payload: []byte(`{"product":"engineer-v1","fact":{"canonicalVersion":1,"projectionVersion":1,"epoch":1,"sequence":1,"capturedAt":"2026-07-28T09:00:00Z","fact":{"sequence":1,"kind":"unknown","occurredAt":"2026-07-28T09:01:00Z"}}}`)},
	} {
		if _, err := DecodeEngineerFact(frame); !errors.Is(err, ErrInvalidEngineerFact) {
			t.Fatalf("malformed fact error = %v", err)
		}
	}
}
