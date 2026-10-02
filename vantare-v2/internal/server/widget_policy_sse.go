package server

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/vantare/overlays/v2/internal/license"
)

// WidgetPolicyStreamRoute is the OBS browser-source endpoint for the
// sanitized widget policy. OBS never receives the license itself: the DTO
// carries only the effective decision, without identity, roles, tokens or
// entitlements.
const WidgetPolicyStreamRoute = "/api/widget-policy/stream"

// WidgetPolicySource is the native authority snapshot. *license.Service
// implements it through CurrentWidgetPolicy.
type WidgetPolicySource interface {
	CurrentWidgetPolicy() license.WidgetPolicy
}

// widgetPolicySSEPollInterval re-reads the effective snapshot. Policy changes
// are rare (login, logout, real expiry); polling keeps the handler free of a
// snapshot/subscription race: every read is already a snapshot, and the
// monotonic revision decides what goes out. The queue is bounded to the
// latest state: a slow consumer skips straight to it on the next tick.
//
// Consumer rule (also the authority-restart rule): the first
// widget-policy:snapshot of a connection is authoritative and applies even
// when its numeric revision is smaller than one seen before a process
// restart -- revisions restart with the process. Later widget-policy:changed
// events on the same connection apply only when their revision is newer than
// the snapshot. Per-connection TCP order guarantees the snapshot arrives
// before any later changed, so a delayed snapshot from the same stream can
// never overwrite them; Wails snapshot answers (separate messages with no
// order guarantee against changed) apply only when unset or not older than
// the applied revision.
var widgetPolicySSEPollInterval = time.Second

func widgetPolicyStreamHandler(src WidgetPolicySource) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if src == nil {
			http.Error(w, "widget policy unavailable", http.StatusServiceUnavailable)
			return
		}
		if !isLoopbackAddr(request.RemoteAddr) {
			http.Error(w, "loopback only", http.StatusForbidden)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")

		snapshot := src.CurrentWidgetPolicy().ToWire()
		if !writePolicyEvent(w, flusher, "widget-policy:snapshot", snapshot) {
			return
		}
		lastRevision := snapshot.Revision
		ticker := time.NewTicker(widgetPolicySSEPollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-request.Context().Done():
				return
			case <-ticker.C:
				current := src.CurrentWidgetPolicy().ToWire()
				if current.Revision <= lastRevision {
					continue
				}
				if !writePolicyEvent(w, flusher, "widget-policy:changed", current) {
					return
				}
				lastRevision = current.Revision
			}
		}
	})
}

func writePolicyEvent(w http.ResponseWriter, flusher http.Flusher, name string, wire license.WidgetPolicyWire) bool {
	raw, err := json.Marshal(wire)
	if err != nil {
		// An unrepresentable DTO must not kill the stream; the next tick
		// retries with the latest state.
		return true
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, raw); err != nil {
		return false
	}
	flusher.Flush()
	return true
}

func isLoopbackAddr(remoteAddress string) bool {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		host = remoteAddress
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
