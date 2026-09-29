package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

func TestLiveSinkPublishesPinnedLMUObservation(t *testing.T) {
	fixture := filepath.Join("..", "..", "..", "testdata", "lmu-fixture.bin")
	input, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	observed, err := lmu.ParseWithBuild(input, time.Now().UTC(), lmu.BuildEvidence{FileVersion: "1.3.0"})
	if err != nil {
		t.Fatal(err)
	}
	observation := new(lmu.Fusion).Merge(observed.ReceivedUTC, 0, observed)
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{Product: telemetrytransport.ProductOverlayV2})
	if err != nil {
		t.Fatal(err)
	}
	publisher, release, err := registry.RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if err := newLiveSink(lmu.New(), publisher).WriteObservation(t.Context(), observation); err != nil {
		t.Fatal(err)
	}
	event, ok := publisher.ReplaySnapshot()
	if !ok {
		t.Fatal("live sink published no Overlay V2 snapshot")
	}
	var update overlayv2.UpdateV2
	if err := json.Unmarshal(event.Data, &update); err != nil {
		t.Fatal(err)
	}
	if update.Frame == nil {
		t.Fatal("live sink snapshot has no frame")
	}
	if len(update.Frame.Standings) != 44 {
		t.Fatalf("live sink standings = %d", len(update.Frame.Standings))
	}
}

func TestSanitizedLMUFrameReachesNativeSSEContract(t *testing.T) {
	fixture := filepath.Join("..", "..", "..", "testdata", "lmu-fixture.bin")
	update, err := buildUpdate(context.Background(), fixture)
	if err != nil {
		t.Fatal(err)
	}
	if update.Frame == nil {
		t.Fatal("projection has no frame")
	}
	if update.Frame.ContractVersion != overlayv2.ContractVersionV2 || len(update.Frame.Standings) != 44 {
		t.Fatalf("projected frame: contract=%d standings=%d", update.Frame.ContractVersion, len(update.Frame.Standings))
	}
	handler, release, err := newHandler(update)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	endpoint := httptest.NewServer(handler)
	defer endpoint.Close()
	client := &http.Client{Timeout: 5 * time.Second}
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, endpoint.URL+"/telemetry/overlay-v2/projection", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("SSE response = %d %q", response.StatusCode, response.Header.Get("Content-Type"))
	}
	reader := bufio.NewReader(response.Body)
	name, err := reader.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	data, err := reader.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	if name != "event: telemetry:overlay-v2:snapshot\n" || !strings.HasPrefix(data, "data: ") {
		t.Fatalf("unexpected SSE event %q %q", name, data)
	}
	var received overlayv2.UpdateV2
	if err := json.Unmarshal([]byte(strings.TrimPrefix(data, "data: ")), &received); err != nil {
		t.Fatal(err)
	}
	if received.Frame == nil || len(received.Frame.Standings) != 44 || received.Frame.SessionID != update.Frame.SessionID {
		t.Fatalf("native SSE lost the Go projection: %+v", received.Frame)
	}
}

func TestHostRejectsTamperedCapture(t *testing.T) {
	fixture := filepath.Join("..", "..", "..", "testdata", "lmu-fixture.bin")
	input, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	input[0] ^= 1
	path := filepath.Join(t.TempDir(), "tampered.bin")
	if err := os.WriteFile(path, input, 0600); err != nil {
		t.Fatal(err)
	}
	_, err = buildUpdate(context.Background(), path)
	if err == nil || !strings.Contains(err.Error(), "digest") {
		t.Fatalf("tampered capture = %v, want digest rejection", err)
	}
}

func TestHostRejectsMissingCapture(t *testing.T) {
	_, err := buildUpdate(context.Background(), filepath.Join(t.TempDir(), "missing.bin"))
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing capture = %v, want os.ErrNotExist", err)
	}
}

func TestStopHostWithOpenSSEClient(t *testing.T) {
	server := &http.Server{Handler: http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/event-stream")
		writer.WriteHeader(http.StatusOK)
		writer.(http.Flusher).Flush()
		<-request.Context().Done()
	})}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := server.Close(); err != nil {
			t.Errorf("close test host: %v", err)
		}
	})
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	client := &http.Client{Timeout: time.Second}
	response, err := client.Get("http://" + listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("SSE response: %d", response.StatusCode)
	}
	if err := stopHTTPServer(server, 50*time.Millisecond); err != nil {
		t.Fatalf("stop host with connected SSE client: %v", err)
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		t.Fatalf("test host Serve returned %v", err)
	}
}
