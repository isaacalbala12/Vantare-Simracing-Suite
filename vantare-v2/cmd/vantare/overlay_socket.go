package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

// Reversible E9 adapter. ACK, replay and state still belong to OverlayPullTransport.
// One authenticated socket per live Wails window; nothing is exposed on the LAN.
type overlaySocket struct {
	mu      sync.Mutex
	windows map[string]*overlaySocketWindow
	closed  bool
	url     string
	server  *http.Server
	done    chan struct{}
}

type overlaySocketWindow struct {
	token string
	conn  *websocket.Conn
}

func (service *overlayPullHTTPService) startSocket() error {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("listen overlay socket: %w", err)
	}
	local := &overlaySocket{windows: make(map[string]*overlaySocketWindow), url: "ws://" + listener.Addr().String(), done: make(chan struct{})}
	local.server = &http.Server{ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 5 * time.Second, MaxHeaderBytes: 4096}
	local.server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { local.serve(w, r, service.transport) })
	service.socket = local
	go func() {
		defer close(local.done)
		if err := local.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("overlay socket server stopped: %v", err)
		}
	}()
	return nil
}

func (local *overlaySocket) bootstrap(w http.ResponseWriter, sender string) {
	local.mu.Lock()
	defer local.mu.Unlock()
	if local.closed {
		http.Error(w, "overlay unavailable", http.StatusServiceUnavailable)
		return
	}
	window := local.windows[sender]
	if window == nil {
		window = &overlaySocketWindow{token: rand.Text() + rand.Text()}
		local.windows[sender] = window
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(struct {
		URL      string `json:"url"`
		Token    string `json:"token"`
		Sections uint8  `json:"sections,omitempty"`
	}{local.url, window.token, overlaySectionVersion()}); err != nil {
		log.Printf("overlay socket bootstrap response: %v", err)
	}
}

func overlaySectionVersion() uint8 {
	if os.Getenv("VANTARE_OVERLAY_SECTIONS") == "1" {
		return 1
	}
	return 0
}

func (local *overlaySocket) serve(w http.ResponseWriter, r *http.Request, transport *telemetrytransport.OverlayPullTransport) {
	// Exact origin AND host checks precede the WebSocket upgrade. The ephemeral
	// credential travels as a subprotocol, never in URLs, logs or persisted data.
	if r.Method != http.MethodGet || r.URL.Path != "/" || r.URL.RawQuery != "" || r.Header.Get("Origin") != "http://wails.localhost" || "ws://"+r.Host != local.url {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	token := r.Header.Get("Sec-WebSocket-Protocol")
	local.mu.Lock()
	sender := ""
	if !local.closed {
		for name, window := range local.windows {
			if subtle.ConstantTimeCompare([]byte(token), []byte(window.token)) == 1 {
				sender = name
				break
			}
		}
	}
	local.mu.Unlock()
	if sender == "" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{"http://wails.localhost"}, Subprotocols: []string{token}})
	if err != nil {
		return
	} // Accept already writes the failure response.
	defer closeOverlaySocket(conn) // Always close our hijacked socket, including shutdown.
	conn.SetReadLimit(maxOverlayPullRequestBytes)
	local.mu.Lock()
	window := local.windows[sender]
	if local.closed || window == nil || window.token != token {
		local.mu.Unlock()
		return
	}
	old := window.conn
	window.conn = conn
	local.mu.Unlock()
	if old != nil {
		closeOverlaySocket(old)
	} // A reconnect replaces only this window's socket.
	defer func() {
		local.mu.Lock()
		if current := local.windows[sender]; current != nil && current.conn == conn {
			current.conn = nil
		}
		local.mu.Unlock()
	}()
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		kind, data, err := conn.Read(ctx)
		cancel()
		if err != nil || kind != websocket.MessageText {
			return
		}
		var request struct {
			Route string `json:"route"`
			telemetrytransport.OverlayPullRequest
		}
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil || decoder.Decode(&struct{}{}) != io.EOF || request.SessionID == "" || len(request.SessionID) > 128 || (request.Route != "pull" && request.Route != "close") {
			return
		}
		local.mu.Lock()
		current := local.windows[sender]
		if local.closed || current == nil || current.conn != conn {
			local.mu.Unlock()
			return
		}
		var response *telemetrytransport.OverlayPullResponse
		if request.Route == "close" {
			transport.Close(sender, request.SessionID)
		} else {
			var result telemetrytransport.OverlayPullResponse
			var deliver bool
			result, deliver, err = transport.Pull(sender, request.OverlayPullRequest)
			if deliver {
				response = &result
			}
		}
		local.mu.Unlock()
		if err != nil {
			return
		}
		payload, err := json.Marshal(response)
		if err != nil {
			return
		}
		ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
		err = conn.Write(ctx, websocket.MessageText, payload)
		cancel()
		if err != nil || request.Route == "close" {
			return
		}
	}
}

func (local *overlaySocket) revoke(sender string) {
	if local == nil {
		return
	}
	local.mu.Lock()
	window := local.windows[sender]
	delete(local.windows, sender)
	local.mu.Unlock()
	if window != nil && window.conn != nil {
		closeOverlaySocket(window.conn)
	}
}

func (local *overlaySocket) close() {
	if local == nil {
		return
	}
	local.mu.Lock()
	local.closed = true
	connections := make([]*websocket.Conn, 0, len(local.windows))
	for _, window := range local.windows {
		if window.conn != nil {
			connections = append(connections, window.conn)
		}
	}
	clear(local.windows)
	local.mu.Unlock()
	for _, conn := range connections {
		closeOverlaySocket(conn)
	}
	if err := local.server.Close(); err != nil {
		log.Printf("close overlay socket: %v", err)
	}
	<-local.done
}

func closeOverlaySocket(conn *websocket.Conn) {
	if err := conn.CloseNow(); err != nil && !errors.Is(err, net.ErrClosed) {
		log.Printf("close overlay socket connection: %v", err)
	}
}
