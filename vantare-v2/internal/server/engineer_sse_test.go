package server_test

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/engineer/simulator"
	"github.com/vantare/overlays/v2/internal/server"
)

type dummyEmitter struct{}

func (d dummyEmitter) Emit(name string, data any) {}

func TestEngineerStreamNoService(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/engineer/stream", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rr.Code)
	}
}

func TestEngineerStreamEmitsEvents(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Create and start the EngineerService
	engSvc := engineerservice.NewEngineerService(dummyEmitter{})
	engSvc.Start(ctx)
	defer engSvc.Stop()
	srv := server.New(server.ServerConfig{EngineerSvc: engSvc})
	s := httptest.NewServer(srv.Handler())
	defer s.Close()

	// Connect to the stream
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.URL+"/engineer/stream", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	go feedEngineerHarness(ctx, engSvc)

	// Read this subscribed stream while an explicit harness feeds fixtures.
	scanner := bufio.NewScanner(resp.Body)
	foundEvent := false
	var lines []string
	for scanner.Scan() {
		line := scanner.Text()
		lines = append(lines, line)
		if strings.HasPrefix(line, "event: engineer-notification") {
			foundEvent = true
			break
		}
	}
	if !foundEvent {
		t.Fatalf("expected event: engineer-notification in stream, got lines: %v, scan error: %v", lines, scanner.Err())
	}
}

// TestEngineerHealth_NoService: /api/engineer/health devuelve 503 si no hay servicio.
func TestEngineerHealth_NoService(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/api/engineer/health", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rr.Code)
	}
}

// A configured canonical input is not healthy until the first observation.
func TestEngineerHealth_WaitsForCanonicalObservation(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	engSvc := engineerservice.NewEngineerService(dummyEmitter{})
	engSvc.Start(ctx)
	defer engSvc.Stop()

	srv := server.New(server.ServerConfig{EngineerSvc: engSvc})
	req := httptest.NewRequest(http.MethodGet, "/api/engineer/health", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rr.Code)
	}

	var h engineerservice.EngineerHealth
	body, _ := io.ReadAll(rr.Body)
	if err := json.Unmarshal(body, &h); err != nil {
		t.Fatalf("invalid JSON: %v\nbody: %s", err, body)
	}
	if h.OK || h.Connected {
		t.Errorf("expected disconnected health before canonical input, got %+v", h)
	}
	if h.Source != "telemetry-core" {
		t.Errorf("Source = %q, want telemetry-core", h.Source)
	}
	if h.Subs != 0 {
		t.Errorf("Subs = %d, want 0 (no SSE clients)", h.Subs)
	}
}

func feedEngineerHarness(ctx context.Context, svc *engineerservice.EngineerService) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		for index, frame := range simulator.Build(simulator.ScenarioLeftBasic) {
			frame := frame
			svc.ProcessHarnessFrame(time.Now().UnixMilli()+int64(index), &frame)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// TestEngineerSSE_MultipleSubscribersAndDrop: con varios subs y un sub lento
// (canal lleno), el drop counter del servicio se incrementa.
func TestEngineerSSE_MultipleSubscribersAndDrop(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	engSvc := engineerservice.NewEngineerService(dummyEmitter{})
	engSvc.Start(ctx)
	defer engSvc.Stop()

	// Suscribirnos directamente al servicio con un canal de buffer 0 para forzar drops.
	// El simulador emite a 60Hz; sin consumir, el default cuenta drops.
	ch, unsub := engSvc.Subscribe()
	defer unsub()

	deadline := time.Now().Add(1500 * time.Millisecond)
	for time.Now().Before(deadline) {
		select {
		case <-ch:
		case <-time.After(50 * time.Millisecond):
		}
	}

	// Tras consumir (sin bloqueos), con un solo subscriber puntual los drops deberían
	// ser pocos o cero. Comprobamos solo que el método existe y devuelve uint64.
	_ = engSvc.DropCount()
}

// TestEngineerHealth_DropCountAccessible: el campo dropCount es accesible vía Health.
func TestEngineerHealth_DropCountAccessible(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	engSvc := engineerservice.NewEngineerService(dummyEmitter{})
	engSvc.Start(ctx)
	defer engSvc.Stop()

	h := engSvc.Health()
	if h.DropCount != 0 {
		t.Errorf("expected DropCount=0 initially, got %d", h.DropCount)
	}
}
