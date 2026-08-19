package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/server"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

func TestServerExposesCanonicalOverlayProjectionSSE(t *testing.T) {
	hub := telemetrytransport.NewHub(telemetrytransport.HubConfig{
		Product: telemetrytransport.ProductOverlay,
	})
	status, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductOverlay,
		1,
		time.Date(2026, 7, 19, 20, 21, 22, 0, time.UTC),
		telemetrytransport.StatusPayload{State: "detecting"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishStatus(status); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	request := httptest.NewRequest(
		http.MethodGet,
		telemetrytransport.ProjectionRoute(telemetrytransport.ProductOverlay),
		nil,
	).WithContext(ctx)
	request.RemoteAddr = "127.0.0.1:45678"
	writer := &cancelAfterFlushWriter{header: make(http.Header), cancel: cancel, cancelAfter: 1}
	srv := server.New(server.ServerConfig{OverlayProjection: hub})
	srv.Handler().ServeHTTP(writer, request)

	if got := writer.header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("content type = %q", got)
	}
	body := writer.body.String()
	if !strings.Contains(body, "event: telemetry:overlay:status") ||
		!strings.Contains(body, `"state":"detecting"`) {
		t.Fatalf("canonical SSE body = %q", body)
	}
}

func TestServerExposesCanonicalStrategyProjectionSSE(t *testing.T) {
	snapshot := readStrategyGolden(t)
	hub := telemetrytransport.NewHub(telemetrytransport.HubConfig{
		Product: telemetrytransport.ProductStrategy,
	})
	status, err := telemetrytransport.NewStatus(
		telemetrytransport.ProductStrategy,
		1,
		time.Date(2026, 8, 11, 20, 21, 22, 0, time.UTC),
		telemetrytransport.StatusPayload{State: "live"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishStatus(status); err != nil {
		t.Fatal(err)
	}
	full, err := telemetrytransport.NewStrategyFull(snapshot.Metadata, 1, snapshot.PayloadV1)
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.PublishSnapshot(full, nil); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	request := httptest.NewRequest(
		http.MethodGet,
		telemetrytransport.ProjectionRoute(telemetrytransport.ProductStrategy),
		nil,
	).WithContext(ctx)
	request.RemoteAddr = "127.0.0.1:45678"
	writer := &cancelAfterFlushWriter{header: make(http.Header), cancel: cancel, cancelAfter: 2}
	srv := server.New(server.ServerConfig{StrategyProjection: hub})
	srv.Handler().ServeHTTP(writer, request)

	if got := writer.header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("content type = %q", got)
	}
	body := writer.body.String()
	for _, expected := range []string{
		"event: telemetry:strategy:status",
		"event: telemetry:strategy:projection",
		`"product":"strategy"`,
		`"state":"live"`,
		`"fuelCapacityLiters":{"present":true,"value":115`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("canonical Strategy SSE body lacks %q: %q", expected, body)
		}
	}
	if strings.Contains(body, "telemetry:overlay:") {
		t.Fatalf("Strategy route emitted Overlay channel: %q", body)
	}
}

func TestServerExposesOverlayV2PublisherSSE(t *testing.T) {
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{
		Product: telemetrytransport.ProductOverlayV2,
	})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := registry.RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if err := publisher.PublishSnapshot(3, map[string]any{"revision": 3, "frame": map[string]any{"contract": 2}}); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	request := httptest.NewRequest(http.MethodGet, telemetrytransport.PublisherProjectionRoute(telemetrytransport.ProductOverlayV2), nil).WithContext(ctx)
	request.RemoteAddr = "127.0.0.1:45678"
	writer := &cancelAfterFlushWriter{header: make(http.Header), cancel: cancel, cancelAfter: 1}
	srv := server.New(server.ServerConfig{OverlayV2Publishers: registry})
	srv.Handler().ServeHTTP(writer, request)

	body := writer.body.String()
	if !strings.Contains(body, "event: telemetry:overlay-v2:snapshot") || !strings.Contains(body, `"contract":2`) {
		t.Fatalf("Overlay v2 SSE body = %q", body)
	}
}

func TestServerStrategyProjectionRouteIsolation(t *testing.T) {
	strategyHub := telemetrytransport.NewHub(telemetrytransport.HubConfig{
		Product: telemetrytransport.ProductStrategy,
	})
	overlayHub := telemetrytransport.NewHub(telemetrytransport.HubConfig{
		Product: telemetrytransport.ProductOverlay,
	})
	strategyRoute := telemetrytransport.ProjectionRoute(telemetrytransport.ProductStrategy)
	overlayRoute := telemetrytransport.ProjectionRoute(telemetrytransport.ProductOverlay)

	tests := []struct {
		name       string
		server     *server.Server
		route      string
		remoteAddr string
		wantStatus int
	}{
		{
			name:       "disabled",
			server:     server.New(server.ServerConfig{}),
			route:      strategyRoute,
			remoteAddr: "127.0.0.1:45678",
			wantStatus: http.StatusNotFound,
		},
		{
			name: "overlay does not enable strategy",
			server: server.New(server.ServerConfig{
				OverlayProjection: overlayHub,
			}),
			route:      strategyRoute,
			remoteAddr: "127.0.0.1:45678",
			wantStatus: http.StatusNotFound,
		},
		{
			name: "strategy does not enable overlay",
			server: server.New(server.ServerConfig{
				StrategyProjection: strategyHub,
			}),
			route:      overlayRoute,
			remoteAddr: "127.0.0.1:45678",
			wantStatus: http.StatusNotFound,
		},
		{
			name: "cross product hub",
			server: server.New(server.ServerConfig{
				StrategyProjection: overlayHub,
			}),
			route:      strategyRoute,
			remoteAddr: "127.0.0.1:45678",
			wantStatus: http.StatusNotFound,
		},
		{
			name: "non loopback",
			server: server.New(server.ServerConfig{
				StrategyProjection: strategyHub,
			}),
			route:      strategyRoute,
			remoteAddr: "203.0.113.10:45678",
			wantStatus: http.StatusForbidden,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.route, nil)
			request.RemoteAddr = test.remoteAddr
			response := httptest.NewRecorder()
			test.server.Handler().ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%q", response.Code, test.wantStatus, response.Body.String())
			}
		})
	}
}

func readStrategyGolden(t *testing.T) strategyprojection.SnapshotV1 {
	t.Helper()
	path := filepath.Join("..", "telemetry", "projection", "strategy", "testdata", "strategy_v1.golden.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read Strategy golden: %v", err)
	}
	var snapshot strategyprojection.SnapshotV1
	if err := json.Unmarshal(data, &snapshot); err != nil {
		t.Fatalf("decode Strategy golden: %v", err)
	}
	return snapshot
}

type cancelAfterFlushWriter struct {
	header      http.Header
	body        bytes.Buffer
	cancel      context.CancelFunc
	once        sync.Once
	cancelAfter int
	flushes     int
}

func (writer *cancelAfterFlushWriter) Header() http.Header { return writer.header }
func (writer *cancelAfterFlushWriter) WriteHeader(int)     {}
func (writer *cancelAfterFlushWriter) Write(data []byte) (int, error) {
	return writer.body.Write(data)
}
func (writer *cancelAfterFlushWriter) Flush() {
	writer.flushes++
	if writer.flushes >= writer.cancelAfter {
		writer.once.Do(writer.cancel)
	}
}
