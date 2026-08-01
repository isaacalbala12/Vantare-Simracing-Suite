package app

import (
	"errors"
	"sync/atomic"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/service"
	"github.com/vantare/overlays/v2/pkg/models"
)

type retryingLiveSource struct {
	available    atomic.Bool
	attachOnRead atomic.Bool
	readCalls    atomic.Int32
}

func (s *retryingLiveSource) Read() []byte {
	s.readCalls.Add(1)
	if s.attachOnRead.Load() {
		s.available.Store(true)
	}
	return nil
}

func (s *retryingLiveSource) ReadTelemetry() *models.Telemetry {
	return &models.Telemetry{Connected: s.available.Load()}
}

func (s *retryingLiveSource) Info() service.SourceInfo {
	return service.SourceInfo{
		Kind:      service.SimulatorLMU,
		Name:      "Le Mans Ultimate",
		Live:      true,
		Available: s.available.Load(),
	}
}

func assertDisconnectedTelemetry(t *testing.T, telemetry *models.Telemetry) {
	t.Helper()
	if telemetry == nil {
		t.Fatal("ReadTelemetry()=nil, want explicit disconnected telemetry")
	}
	if telemetry.Connected || telemetry.Player != nil || telemetry.Session != nil || len(telemetry.Vehicles) != 0 {
		t.Fatalf("ReadTelemetry()=%#v, want disconnected telemetry without synthetic data", telemetry)
	}
}

func TestTelemetrySourceManagerStartsUnavailableWithoutLMU(t *testing.T) {
	var calls atomic.Int32
	src := &retryingLiveSource{}
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive: true,
		OpenLive: func() (service.Source, error) {
			calls.Add(1)
			return src, nil
		},
	})

	if got := calls.Load(); got != 1 {
		t.Fatalf("startup open calls=%d, want 1", got)
	}
	info := mgr.Info()
	if info.Kind != service.SimulatorLMU || !info.Live || info.Available {
		t.Fatalf("Info()=%+v, want unavailable real LMU source", info)
	}
	assertDisconnectedTelemetry(t, mgr.ReadTelemetry())
}

func TestTelemetrySourceManagerOpenFailureNeverCreatesMock(t *testing.T) {
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive: true,
		OpenLive: func() (service.Source, error) {
			return nil, errors.New("LMU unavailable")
		},
	})

	info := mgr.Info()
	if info.Kind == service.SimulatorMock || info.Live || info.Available {
		t.Fatalf("Info()=%+v, want unavailable non-mock source", info)
	}
	assertDisconnectedTelemetry(t, mgr.ReadTelemetry())
}

func TestTelemetrySourceManagerLateLMUConnectionBecomesReal(t *testing.T) {
	var calls atomic.Int32
	src := &retryingLiveSource{}
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive: true,
		OpenLive: func() (service.Source, error) {
			calls.Add(1)
			return src, nil
		},
	})
	src.attachOnRead.Store(true)

	if err := mgr.EnsureLive(); err != nil {
		t.Fatalf("EnsureLive() error=%v", err)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("open calls=%d, want retained live source without reopen", got)
	}
	if got := src.readCalls.Load(); got != 1 {
		t.Fatalf("live retry reads=%d, want 1", got)
	}
	info := mgr.Info()
	if info.Kind != service.SimulatorLMU || !info.Live || !info.Available {
		t.Fatalf("Info()=%+v, want available real LMU source", info)
	}
	if telemetry := mgr.ReadTelemetry(); telemetry == nil || !telemetry.Connected {
		t.Fatalf("ReadTelemetry()=%#v, want connected real source", telemetry)
	}
}

func TestTelemetrySourceManagerDisconnectNeverRestoresMock(t *testing.T) {
	src := &retryingLiveSource{}
	src.available.Store(true)
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{
		UseLive:  true,
		OpenLive: func() (service.Source, error) { return src, nil },
	})
	src.available.Store(false)

	assertDisconnectedTelemetry(t, mgr.ReadTelemetry())
	if err := mgr.EnsureLive(); err == nil {
		t.Fatal("EnsureLive() error=nil, want unavailable live error")
	}
	info := mgr.Info()
	if info.Kind == service.SimulatorMock || !info.Live || info.Available {
		t.Fatalf("Info()=%+v, want unavailable retained LMU source", info)
	}
}

func TestTelemetrySourceManagerWithoutSourceReturnsDisconnectedTelemetry(t *testing.T) {
	mgr := NewTelemetrySourceManager(TelemetrySourceManagerConfig{UseLive: false})

	info := mgr.Info()
	if info.Kind == service.SimulatorMock || info.Live || info.Available {
		t.Fatalf("Info()=%+v, want unavailable non-mock source", info)
	}
	assertDisconnectedTelemetry(t, mgr.ReadTelemetry())
}
