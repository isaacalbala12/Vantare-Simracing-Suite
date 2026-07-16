package app

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/lmuapi"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

func TestEnrichedLMUSourceReadTelemetryDoesNotBlockOnREST(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/rest/watch/standings":
			_, _ = w.Write([]byte(`[]`))
		case "/rest/watch/sessionInfo":
			_, _ = w.Write([]byte(`{}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cache := newLMURESTCache(lmuapi.NewClient(srv.URL, 750*time.Millisecond), time.Hour, time.Second)
	defer cache.Close()
	src := &EnrichedLMUSource{
		mmap:  service.FuncSource{ReadFunc: func() []byte { return lmu.BuildSyntheticBuffer() }},
		cache: cache,
	}

	start := time.Now()
	tele := src.ReadTelemetry()
	elapsed := time.Since(start)
	if tele == nil || !tele.Connected {
		t.Fatalf("expected connected telemetry, got %#v", tele)
	}
	if elapsed > 50*time.Millisecond {
		t.Fatalf("ReadTelemetry blocked on REST for %s", elapsed)
	}
}

func TestEnrichedLMUSourcePrioritizesNativeDelta(t *testing.T) {
	tests := []struct {
		name          string
		nativeDelta   float64
		expectedDelta float64
	}{
		{
			name:          "valid negative delta is prioritized",
			nativeDelta:   -0.250,
			expectedDelta: -0.250,
		},
		{
			name:          "valid positive delta is prioritized",
			nativeDelta:   0.350,
			expectedDelta: 0.350,
		},
		{
			name:          "zero delta falls back to engine/REST (which returns 0 in this mock)",
			nativeDelta:   0.0,
			expectedDelta: 0.0,
		},
		{
			name:          "NaN delta is not prioritized (falls back to 0)",
			nativeDelta:   math.NaN(),
			expectedDelta: 0.0,
		},
		{
			name:          "positive infinity delta is not prioritized (falls back to 0)",
			nativeDelta:   math.Inf(1),
			expectedDelta: 0.0,
		},
		{
			name:          "negative infinity delta is not prioritized (falls back to 0)",
			nativeDelta:   math.Inf(-1),
			expectedDelta: 0.0,
		},
		{
			name:          "absurdly large delta is not prioritized (falls back to 0)",
			nativeDelta:   15000.0,
			expectedDelta: 0.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := lmu.BuildSyntheticBuffer()
			lmu.SetPlayerDeltaBest(buf, tt.nativeDelta)

			src := &EnrichedLMUSource{
				mmap: service.FuncSource{ReadFunc: func() []byte { return buf }},
			}

			tele := src.ReadTelemetry()
			if tele.Player == nil {
				t.Fatal("expected player telemetry")
			}

			// For NaN, we can't directly compare using ==
			if math.IsNaN(tt.expectedDelta) {
				if !math.IsNaN(tele.Player.DeltaBest) {
					t.Fatalf("expected DeltaBest to be NaN, got %v", tele.Player.DeltaBest)
				}
			} else {
				if tele.Player.DeltaBest != tt.expectedDelta {
					t.Fatalf("expected DeltaBest to be %v, got %v", tt.expectedDelta, tele.Player.DeltaBest)
				}
			}
		})
	}
}

// buildEngineerSyntheticBuffer construye un buffer con geometría conocida para
// tests de ReadEngineerFrame (player en 100,0,200; oponente en 103,0,200).
func buildEngineerSyntheticBuffer() []byte {
	buf := lmu.BuildSyntheticBuffer()
	// Asegurar player has vehicle e idx 0.
	if len(buf) < 128468 {
		return buf
	}
	// Marcar 2 vehículos y escribir geometría via el parser interno de engineer.
	binary.LittleEndian.PutUint32(buf[1736:], 2)
	// Player slot geom.
	po := 128468
	binary.LittleEndian.PutUint32(buf[po:], 11)
	binary.LittleEndian.PutUint64(buf[po+160:], math.Float64bits(100))
	binary.LittleEndian.PutUint64(buf[po+168:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[po+176:], math.Float64bits(200))
	// Opponent slot 1 geom.
	off := 2192 + 584
	binary.LittleEndian.PutUint32(buf[off:], 22)
	copy(buf[off+4:], "Opponent")
	binary.LittleEndian.PutUint64(buf[off+264:], math.Float64bits(103))
	binary.LittleEndian.PutUint64(buf[off+272:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[off+280:], math.Float64bits(200))
	binary.LittleEndian.PutUint64(buf[off+104:], math.Float64bits(5050))
	return buf
}

func TestEnrichedLMUSource_ReadEngineerFrame_ReturnsFrame(t *testing.T) {
	buf := buildEngineerSyntheticBuffer()
	src := &EnrichedLMUSource{
		mmap: service.FuncSource{ReadFunc: func() []byte { return buf }},
	}
	frame := src.ReadEngineerFrame()
	if frame == nil {
		t.Fatal("expected non-nil engineer frame")
	}
	if frame.Player == nil || frame.Player.Position.X != 100 {
		t.Fatalf("player Position.X = %v, want 100", frame.Player.Position.X)
	}
	if len(frame.Vehicles) == 0 || frame.Vehicles[len(frame.Vehicles)-1].Position.X != 103 {
		t.Fatalf("expected opponent at X=103, got %+v", frame.Vehicles)
	}
}

func TestEnrichedLMUSource_ReadEngineerFrame_NilBuffer(t *testing.T) {
	src := &EnrichedLMUSource{
		mmap: service.FuncSource{ReadFunc: func() []byte { return nil }},
	}
	if frame := src.ReadEngineerFrame(); frame != nil {
		t.Errorf("expected nil frame for nil buffer, got %+v", frame)
	}
}

func TestEnrichedLMUSource_ReadEngineerFrame_DoesNotAffectReadTelemetry(t *testing.T) {
	buf := buildEngineerSyntheticBuffer()
	src := &EnrichedLMUSource{
		mmap: service.FuncSource{ReadFunc: func() []byte { return buf }},
	}
	before := src.ReadTelemetry()
	_ = src.ReadEngineerFrame()
	after := src.ReadTelemetry()
	if before == nil || after == nil {
		t.Fatal("expected non-nil telemetry")
	}
	if before.Player.DeltaBest != after.Player.DeltaBest ||
		before.Player.Speed != after.Player.Speed ||
		len(before.Vehicles) != len(after.Vehicles) {
		t.Errorf("ReadTelemetry changed after ReadEngineerFrame: before=%+v after=%+v", before, after)
	}
}

// TestWidgetJSON_UnchangedAfterEngineerAdapter (T17): el JSON público de widgets
// no cambia tras llamar a ReadEngineerFrame sobre el mismo buffer.
func TestWidgetJSON_UnchangedAfterEngineerAdapter(t *testing.T) {
	buf := buildEngineerSyntheticBuffer()
	src := &EnrichedLMUSource{
		mmap: service.FuncSource{ReadFunc: func() []byte { return buf }},
	}
	before := src.ReadTelemetry()
	beforeJSON, _ := json.Marshal(before)
	_ = src.ReadEngineerFrame()
	after := src.ReadTelemetry()
	afterJSON, _ := json.Marshal(after)
	if string(beforeJSON) != string(afterJSON) {
		t.Errorf("widget JSON changed after ReadEngineerFrame\nbefore: %s\nafter:  %s", beforeJSON, afterJSON)
	}
}
