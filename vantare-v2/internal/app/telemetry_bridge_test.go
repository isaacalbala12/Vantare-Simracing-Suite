package app_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
	"github.com/vantare/overlays/v2/pkg/models"
)

type captureEmitter struct {
	names []string
	last  any
}

type channelEmitter struct {
	updates chan any
}

func (e *channelEmitter) Emit(name string, data any) {
	if name != "telemetry:update" {
		return
	}
	select {
	case e.updates <- data:
	default:
	}
}

func (f *captureEmitter) Emit(name string, data any) {
	f.names = append(f.names, name)
	f.last = data
}

func TestTelemetryBridgeEmits(t *testing.T) {
	buf := lmu.BuildSyntheticBuffer()
	src := service.FuncSource{ReadFunc: func() []byte { return buf }}
	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: src,
	})
	fe := &captureEmitter{}
	bridge := app.NewTelemetryBridge(svc, fe)

	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = svc.Run(ctx) }()
	bridge.Start()

	deadline := time.After(500 * time.Millisecond)
	for fe.last == nil {
		select {
		case <-deadline:
			t.Fatal("timeout waiting for bridge emit")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	cancel()
	bridge.Stop()

	if len(fe.names) == 0 || fe.names[0] != "telemetry:update" {
		t.Fatalf("events: %v", fe.names)
	}
}

func TestTelemetryBridgeWireJSONCamelCase(t *testing.T) {
	buf := lmu.BuildSyntheticBuffer()
	src := service.FuncSource{ReadFunc: func() []byte { return buf }}
	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: src,
	})
	fe := &captureEmitter{}
	bridge := app.NewTelemetryBridge(svc, fe)

	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = svc.Run(ctx) }()
	bridge.Start()

	deadline := time.After(500 * time.Millisecond)
	for fe.last == nil {
		select {
		case <-deadline:
			t.Fatal("timeout waiting for wire payload")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
	cancel()
	bridge.Stop()

	raw, err := json.Marshal(fe.last)
	if err != nil {
		t.Fatal(err)
	}

	var doc struct {
		Seq      uint64 `json:"seq"`
		Snapshot struct {
			Connected bool `json:"connected"`
			Player    *struct {
				Speed     float64 `json:"speed"`
				Gear      int32   `json:"gear"`
				EngineRPM float64 `json:"engineRPM"`
			} `json:"player"`
		} `json:"snapshot"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("unmarshal wire: %v\njson: %s", err, raw)
	}
	if !doc.Snapshot.Connected {
		t.Fatal("expected connected true")
	}
	if doc.Snapshot.Player == nil {
		t.Fatalf("expected player in snapshot, json: %s", raw)
	}
	if doc.Snapshot.Player.Gear != 4 {
		t.Fatalf("gear: got %d want 4", doc.Snapshot.Player.Gear)
	}
	if doc.Snapshot.Player.Speed < 14 || doc.Snapshot.Player.Speed > 16 {
		t.Fatalf("speed: got %v want ~15 m/s", doc.Snapshot.Player.Speed)
	}
	if doc.Snapshot.Player.EngineRPM < 7000 {
		t.Fatalf("rpm: got %v want ~7200", doc.Snapshot.Player.EngineRPM)
	}
}

func TestUpdateWireFromSyntheticService(t *testing.T) {
	buf := lmu.BuildSyntheticBuffer()
	svc := service.New(service.Config{
		ReadHz: 60,
		EmitHz: 30,
		Source: service.FuncSource{ReadFunc: func() []byte { return buf }},
	})

	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = svc.Run(ctx) }()

	ch, unsub := svc.Subscribe()
	defer unsub()

	var upd service.Update
	select {
	case upd = <-ch:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timeout")
	}
	cancel()

	wire := app.WireFromUpdate(upd)
	raw, err := json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !jsonContainsKeys(t, raw, `"connected"`, `"engineRPM"`, `"player"`) {
		t.Fatalf("missing camelCase keys in %s", raw)
	}
}

func TestTelemetryBridgeDisconnectedSourceNeverPublishesSyntheticData(t *testing.T) {
	application := app.New(false)
	svc := application.Telemetry
	emitter := &channelEmitter{updates: make(chan any, 1)}
	bridge := app.NewTelemetryBridge(svc, emitter)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = svc.Run(ctx) }()
	bridge.Start()
	defer bridge.Stop()

	var payload any
	select {
	case payload = <-emitter.updates:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timeout waiting for disconnected bridge payload")
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Snapshot struct {
			Connected bool                    `json:"connected"`
			Vehicles  []models.VehicleScoring `json:"vehicles"`
		} `json:"snapshot"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("unmarshal wire: %v", err)
	}
	if doc.Snapshot.Connected || len(doc.Snapshot.Vehicles) != 0 {
		t.Fatalf("snapshot=%s, want connected=false and zero scoring rows", raw)
	}
	for _, forbidden := range []string{"Spa", "TestDriver", "synthetic-account-id"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("disconnected bridge payload leaked synthetic canary %q: %s", forbidden, raw)
		}
	}
}

func jsonContainsKeys(t *testing.T, raw []byte, keys ...string) bool {
	t.Helper()
	s := string(raw)
	for _, k := range keys {
		if !strings.Contains(s, k) {
			t.Errorf("missing key %s in %s", k, s)
			return false
		}
	}
	return true
}
