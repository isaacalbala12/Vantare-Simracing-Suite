package main

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/server"
)

func lastEmit(t *testing.T, emitter *spyMainEmitter) (string, any) {
	t.Helper()
	names := emitter.Events()
	if len(names) == 0 {
		t.Fatal("expected at least one emitted event")
	}
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	return names[len(names)-1], emitter.data[len(emitter.data)-1]
}

func TestEmitObsURLPublishesBoundAddress(t *testing.T) {
	srv := server.New(server.ServerConfig{Addr: "127.0.0.1:0"})
	srv.Start()
	t.Cleanup(func() {
		if err := srv.Stop(); err != nil {
			t.Errorf("server stop: %v", err)
		}
	})

	emitter := &spyMainEmitter{}
	emitObsURL(emitter, srv)

	name, data := lastEmit(t, emitter)
	if name != "obs:url" {
		t.Fatalf("event name = %q, want obs:url", name)
	}
	payload, ok := data.(map[string]any)
	if !ok {
		t.Fatalf("payload type = %T, want map[string]any", data)
	}
	base, ok := payload["baseUrl"].(string)
	if !ok || !strings.HasPrefix(base, "http://127.0.0.1:") {
		t.Fatalf("baseUrl = %#v, want http://127.0.0.1:<port>", payload["baseUrl"])
	}

	// La URL publicada debe ser la direccion real donde el servidor responde:
	// el Browser Source de OBS la usa tal cual.
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(base + "/health")
	if err != nil {
		t.Fatalf("GET %s/health: %v", base, err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Errorf("response close: %v", err)
		}
	}()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want 200", resp.StatusCode)
	}
}

func TestEmitObsURLSkipsMissingOrUnstartedServer(t *testing.T) {
	emitter := &spyMainEmitter{}

	emitObsURL(emitter, nil)
	emitObsURL(emitter, server.New(server.ServerConfig{Addr: ""}))
	emitObsURL(nil, server.New(server.ServerConfig{Addr: "127.0.0.1:0"}))

	if got := emitter.Events(); len(got) != 0 {
		t.Fatalf("emitted %v, want no events", got)
	}
}
