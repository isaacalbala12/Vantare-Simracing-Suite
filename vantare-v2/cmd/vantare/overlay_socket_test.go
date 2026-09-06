package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

func TestOverlaySocketPreservesACKAndWindowRevocation(t *testing.T) {
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{Product: telemetrytransport.ProductOverlayV2})
	if err != nil {
		t.Fatal(err)
	}
	if err := registry.PublishStatus(telemetrytransport.ProductOverlayV2, 1, map[string]any{"revision": 1}); err != nil {
		t.Fatal(err)
	}
	target := newCaptureOverlayPullTarget()
	service := newOverlayPullHTTPService(target, telemetrytransport.NewOverlayPullTransport(registry))
	if err := service.startSocket(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(service.shutdown)
	request := httptest.NewRequest(http.MethodPost, "/socket-endpoint", strings.NewReader(`{"sessionId":"s","ack":0}`))
	request.Header.Set(overlayPullWindowNameHeader, "overlay")
	response := httptest.NewRecorder()
	service.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("bootstrap status %d", response.Code)
	}
	var endpoint struct {
		URL   string `json:"url"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &endpoint); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(endpoint.URL, "ws://127.0.0.1:") || len(endpoint.Token) < 32 {
		t.Fatal("unbounded socket")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, invalid := range []struct{ origin, token string }{{"https://evil.invalid", endpoint.Token}, {"", endpoint.Token}, {"http://wails.localhost", "bad"}} {
		conn, _, err := websocket.Dial(ctx, endpoint.URL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {invalid.origin}}, Subprotocols: []string{invalid.token}})
		if err == nil {
			conn.CloseNow()
			t.Fatal("invalid boundary accepted")
		}
	}
	conn, _, err := websocket.Dial(ctx, endpoint.URL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"http://wails.localhost"}}, Subprotocols: []string{endpoint.Token}})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	post := func(body string) []byte {
		t.Helper()
		if err := conn.Write(ctx, websocket.MessageText, []byte(body)); err != nil {
			t.Fatal(err)
		}
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	first := post(`{"route":"pull","sessionId":"s","ack":0}`)
	var delivery telemetrytransport.OverlayPullResponse
	if err := json.Unmarshal(first, &delivery); err != nil {
		t.Fatal(err)
	}
	if delivery.Delivery != 1 || delivery.SessionID != "s" || len(delivery.Events) != 1 || string(delivery.Events[0].Data) != `{"revision":1}` {
		t.Fatal("wire changed")
	}
	if replay := post(`{"route":"pull","sessionId":"s","ack":0}`); string(replay) != string(first) {
		t.Fatal("ACK replay changed")
	}
	// Reconnect does not acknowledge or drop the pending delivery.
	conn, _, err = websocket.Dial(ctx, endpoint.URL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"http://wails.localhost"}}, Subprotocols: []string{endpoint.Token}})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if replay := post(`{"route":"pull","sessionId":"s","ack":0}`); string(replay) != string(first) {
		t.Fatal("reconnect lost pending delivery")
	}
	if empty := post(`{"route":"pull","sessionId":"s","ack":1}`); string(empty) != "null" {
		t.Fatal("idle response changed")
	}
	for _, malformed := range []string{
		`{"route":"pull","sessionId":"s","ack":1,"sender":"forged"}`,
		`{"route":"unrelated","sessionId":"s","ack":1}`,
		`{"route":"pull","sessionId":"s","ack":-1}`,
		strings.Repeat(" ", maxOverlayPullRequestBytes+1),
	} {
		if err := conn.Write(ctx, websocket.MessageText, []byte(malformed)); err != nil {
			t.Fatal(err)
		}
		if _, _, err := conn.Read(ctx); err == nil {
			t.Fatal("invalid message accepted")
		}
		conn, _, err = websocket.Dial(ctx, endpoint.URL, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"http://wails.localhost"}}, Subprotocols: []string{endpoint.Token}})
		if err != nil {
			t.Fatal(err)
		}
		defer conn.CloseNow()
	}
	if empty := post(`{"route":"pull","sessionId":"s","ack":1}`); string(empty) != "null" {
		t.Fatal("invalid sender changed transport state")
	}
	target.close("overlay")
	if _, _, err := conn.Read(ctx); err == nil {
		t.Fatal("socket survived window close")
	}
	if _, active := registry.Lookup(telemetrytransport.ProductOverlayV2); active {
		t.Fatal("window retained consumer")
	}
	service.shutdown()
	service.shutdown()
}
