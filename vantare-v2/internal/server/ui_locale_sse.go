package server

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/vantare/overlays/v2/internal/app"
)

const UILocaleStreamRoute = "/api/ui-locale/stream"

type UILocaleSource interface {
	SubscribeUILocale() (app.UILocaleSnapshot, <-chan app.UILocaleSnapshot, func())
}

func uiLocaleStreamHandler(source UILocaleSource) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if !isLoopbackAddr(request.RemoteAddr) {
			http.Error(w, "loopback only", http.StatusForbidden)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		snapshot, updates, cancel := source.SubscribeUILocale()
		defer cancel()
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Accel-Buffering", "no")
		if !writeUILocaleEvent(w, flusher, "ui-locale:snapshot", snapshot) {
			return
		}
		for {
			select {
			case <-request.Context().Done():
				return
			case current := <-updates:
				if current.Revision > snapshot.Revision {
					if !writeUILocaleEvent(w, flusher, "ui-locale:changed", current) {
						return
					}
					snapshot = current
				}
			}
		}
	})
}

func writeUILocaleEvent(w http.ResponseWriter, flusher http.Flusher, name string, snapshot app.UILocaleSnapshot) bool {
	data, err := json.Marshal(snapshot)
	if err != nil {
		return false
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, data); err != nil {
		return false
	}
	flusher.Flush()
	return true
}
