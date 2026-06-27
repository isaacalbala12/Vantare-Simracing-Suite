package service

import (
	"testing"

	engineertelemetry "github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// fakeBufferProvider implementa BufferProvider para tests.
type fakeBufferProvider struct {
	buf []byte
}

func (f fakeBufferProvider) Read() []byte { return f.buf }

func TestOverlaysLiveAdapter_ReadFrame_DelegatesToBufferProvider(t *testing.T) {
	buf := buildEngineerAdapterBuffer()
	a := NewOverlaysLiveAdapter(fakeBufferProvider{buf: buf}, true)
	frame := a.ReadFrame()
	if frame == nil || frame.Player == nil {
		t.Fatalf("expected non-nil frame with player, got %+v", frame)
	}
	if frame.Player.Position.X != 100 {
		t.Errorf("player Position.X = %v, want 100", frame.Player.Position.X)
	}
}

func TestOverlaysLiveAdapter_Info_LiveAvailable(t *testing.T) {
	a := NewOverlaysLiveAdapter(fakeBufferProvider{buf: nil}, true)
	info := a.Info()
	if info.Kind != engineertelemetry.KindLMU {
		t.Errorf("Kind = %v, want lmu", info.Kind)
	}
	if !info.Live || !info.Available {
		t.Errorf("expected Live=true Available=true, got %+v", info)
	}
}

func TestOverlaysLiveAdapter_Info_NotAvailableWhenBufferNil(t *testing.T) {
	a := NewOverlaysLiveAdapter(nil, false)
	if a.ReadFrame() != nil {
		t.Error("expected nil frame when buffer provider is nil")
	}
	info := a.Info()
	if info.Available {
		t.Errorf("expected Available=false, got %+v", info)
	}
}

func TestOverlaysLiveAdapter_Close_NoOp(t *testing.T) {
	a := NewOverlaysLiveAdapter(fakeBufferProvider{buf: nil}, true)
	if err := a.Close(); err != nil {
		t.Errorf("Close() = %v, want nil (no-op, mmap gestionado por TelemetrySourceManager)", err)
	}
}

// buildEngineerAdapterBuffer construye un buffer válido mínimo con geometría
// para tests del adapter (player en X=100). Se apoya en el parser interno.
func buildEngineerAdapterBuffer() []byte {
	// Reusar el constructor del paquete lmu via un buffer sintético del parser
	// público y escribir geometría known-value. Para evitar dependencia cruzada
	// de tests, construimos aquí un buffer mínimo de tamaño ObjectOutSize.
	return buildSyntheticEngineerFrameBuffer()
}
