//go:build windows

package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

func TestOverlayStudioHTTPPullUsesRealRustChildWithoutLMU(t *testing.T) {
	executable := os.Getenv("VANTARE_TELEMETRY_RUST_TEST_HELPER")
	if executable == "" {
		t.Skip("requires built Rust helper")
	}
	runtime, err := app.NewRustTelemetryCandidateRuntime(app.RustTelemetryCandidateConfig{Enabled: true, Executable: executable})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	service := newOverlayPullHTTPService(newCaptureOverlayPullTarget(), runtime)
	defer service.shutdown()
	defer func() {
		stop, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stopCancel()
		if err := runtime.Stop(stop); err != nil {
			t.Errorf("stop Rust telemetry: %v", err)
		}
	}()
	post := func(route, body string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, route, strings.NewReader(body))
		request.Header.Set(overlayPullWindowNameHeader, "studio")
		response := httptest.NewRecorder()
		service.ServeHTTP(response, request)
		return response
	}
	first := post("/pull", `{"sessionId":"studio-1","ack":0}`)
	if first.Code != http.StatusOK {
		t.Fatalf("Rust HTTP pull status=%d body=%q", first.Code, first.Body.String())
	}
	var delivery telemetrytransport.OverlayPullResponse
	if err := json.Unmarshal(first.Body.Bytes(), &delivery); err != nil || delivery.Delivery != 1 || len(delivery.Events) != 1 || delivery.Events[0].Name != "telemetry:overlay-v2:status" {
		t.Fatalf("Rust HTTP delivery=%+v err=%v", delivery, err)
	}
	replay := post("/pull", `{"sessionId":"studio-1","ack":0}`)
	if replay.Code != http.StatusOK || replay.Body.String() != first.Body.String() {
		t.Fatalf("Rust HTTP replay status=%d body=%q", replay.Code, replay.Body.String())
	}
	closed := post("/close", `{"sessionId":"studio-1","ack":1}`)
	if closed.Code != http.StatusNoContent {
		t.Fatalf("Rust HTTP close status=%d", closed.Code)
	}
}
