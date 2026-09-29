package telemetryprocess

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestDecodeRustObservationSnapshotsRealStatic44(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "overlay-core-slices-go-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var oracle struct {
		Engineer json.RawMessage `json:"engineer"`
		Strategy json.RawMessage `json:"strategy"`
	}
	if err := json.Unmarshal(data, &oracle); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		file    string
		product string
		want    json.RawMessage
	}{
		{"engineer-snapshot-frame-rust-v1.bin", ProductEngineerV1, oracle.Engineer},
		{"strategy-snapshot-frame-rust-v1.bin", ProductStrategyV1, oracle.Strategy},
	} {
		t.Run(test.product, func(t *testing.T) {
			wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", test.file))
			if err != nil {
				t.Fatal(err)
			}
			frame, err := DecodeFrame(wire)
			if err != nil {
				t.Fatal(err)
			}
			var got any
			switch test.product {
			case ProductEngineerV1:
				observation, err := DecodeEngineerSnapshot(frame)
				if err != nil {
					t.Fatal(err)
				}
				if len(observation.Vehicles) != 44 {
					t.Fatalf("vehicles = %d, want 44", len(observation.Vehicles))
				}
				got = observation.PayloadV1
			case ProductStrategyV1:
				observation, err := DecodeStrategySnapshot(frame)
				if err != nil {
					t.Fatal(err)
				}
				got = observation.PayloadV1
			}
			encoded, err := json.Marshal(got)
			if err != nil {
				t.Fatal(err)
			}
			var decoded, expected any
			if err := json.Unmarshal(encoded, &decoded); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(test.want, &expected); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(decoded, expected) {
				t.Fatal("Rust snapshot differs from Go observation oracle")
			}
		})
	}
}

func TestDecodeObservationSnapshotsRejectWrongProductSchemaAndCursor(t *testing.T) {
	for _, frame := range []Frame{
		{Kind: KindStatus, Payload: []byte(`{}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"other","snapshot":{}}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"strategy-v1","snapshot":{},"unexpected":1}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"strategy-v1","snapshot":{"canonicalVersion":1,"projectionVersion":1,"epoch":1,"sequence":1,"capturedAt":"2026-09-28T00:00:00Z","capabilities":[],"unexpected":1}}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"strategy-v1","snapshot":{"canonicalVersion":1,"projectionVersion":1,"epoch":0,"sequence":1,"capturedAt":"2026-09-28T00:00:00Z","capabilities":[]}}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"strategy-v1","snapshot":{"canonicalVersion":2,"projectionVersion":1,"epoch":1,"sequence":1,"capturedAt":"2026-09-28T00:00:00Z","capabilities":[]}}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"strategy-v1","snapshot":{"canonicalVersion":1,"projectionVersion":1,"epoch":1,"sequence":1,"capturedAt":"bad","capabilities":[]}}`)},
	} {
		if _, err := DecodeStrategySnapshot(frame); !errors.Is(err, ErrInvalidObservationSnapshot) {
			t.Fatalf("malformed strategy snapshot error = %v", err)
		}
	}
}

func TestDecodeEngineerSnapshotIdentity(t *testing.T) {
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "engineer-snapshot-frame-rust-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(frame.Payload, &envelope); err != nil {
		t.Fatal(err)
	}
	snapshot, err := DecodeEngineerSnapshot(frame)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name     string
		vehicle  string
		driver   string
		wantFail bool
	}{
		{"complete", string(snapshot.Player.ID), "driver-1", false},
		{"missing driver", string(snapshot.Player.ID), "", true},
		{"wrong player", "other-vehicle", "driver-1", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			identity, err := json.Marshal(map[string]string{"event": "lmu-event-1", "session": "lmu-session-1", "vehicle": test.vehicle, "driver": test.driver})
			if err != nil {
				t.Fatal(err)
			}
			envelope["identity"] = identity
			payload, err := json.Marshal(envelope)
			if err != nil {
				t.Fatal(err)
			}
			frame.Payload = payload
			_, got, err := DecodeEngineerSnapshotWithIdentity(frame)
			if test.wantFail {
				if !errors.Is(err, ErrInvalidObservationSnapshot) {
					t.Fatalf("incomplete identity error = %v", err)
				}
			} else if err != nil || got == nil || got.Driver != "driver-1" {
				t.Fatalf("complete identity = %+v, %v", got, err)
			}
		})
	}
}
