package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

func TestDecodeOverlaySnapshotRealStatic44Oracle(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "overlay-core-slices-go-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var oracle struct {
		Full json.RawMessage `json:"full"`
	}
	if err := json.Unmarshal(data, &oracle); err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(struct {
		Product string          `json:"product"`
		Update  json.RawMessage `json:"update"`
	}{ProductOverlayV2, oracle.Full})
	if err != nil {
		t.Fatal(err)
	}
	update, err := DecodeOverlaySnapshot(Frame{Kind: KindSnapshot, Payload: payload})
	if err != nil {
		t.Fatal(err)
	}
	if update.DeliveryRevision != 1 || update.Frame == nil || len(update.Frame.Standings) != 44 || len(update.Frame.Relative) == 0 {
		t.Fatalf("decoded snapshot lost real 44-car projection: revision=%d frame=%v", update.DeliveryRevision, update.Frame != nil)
	}
	encoded, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "overlay-snapshot-frame-rust-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	rustFrame, err := DecodeFrame(encoded)
	if err != nil {
		t.Fatal(err)
	}
	rustUpdate, err := DecodeOverlaySnapshot(rustFrame)
	if err != nil {
		t.Fatal(err)
	}
	var want overlayv2.UpdateV2
	if err := json.Unmarshal(oracle.Full, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(rustUpdate, want) {
		t.Fatal("Rust snapshot bytes differ from Go full update")
	}
	nestedUnknown := bytes.Replace(payload, []byte(`"source":{`), []byte(`"source":{"unexpected":1,`), 1)
	if bytes.Equal(nestedUnknown, payload) {
		t.Fatal("oracle did not contain a source object")
	}
	for _, malformed := range []Frame{
		{Kind: KindStatus, Payload: payload},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"unknown","update":{}}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"overlay-v2","update":{},"unexpected":1}`)},
		{Kind: KindSnapshot, Payload: nestedUnknown},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"overlay-v2","update":{"source":{"state":"unknown"},"frame":{"contract":2,"algorithm":2}}}`)},
		{Kind: KindSnapshot, Payload: []byte(`{"product":"overlay-v2","update":{}} trailing`)},
	} {
		if _, err := DecodeOverlaySnapshot(malformed); !errors.Is(err, ErrInvalidOverlaySnapshot) {
			t.Fatalf("malformed snapshot error = %v", err)
		}
	}
}
