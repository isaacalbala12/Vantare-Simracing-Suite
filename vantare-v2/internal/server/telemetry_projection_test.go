package server_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/server"
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
	writer := &cancelAfterFlushWriter{header: make(http.Header), cancel: cancel}
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

type cancelAfterFlushWriter struct {
	header http.Header
	body   bytes.Buffer
	cancel context.CancelFunc
	once   sync.Once
}

func (writer *cancelAfterFlushWriter) Header() http.Header { return writer.header }
func (writer *cancelAfterFlushWriter) WriteHeader(int)     {}
func (writer *cancelAfterFlushWriter) Write(data []byte) (int, error) {
	return writer.body.Write(data)
}
func (writer *cancelAfterFlushWriter) Flush() {
	writer.once.Do(writer.cancel)
}
