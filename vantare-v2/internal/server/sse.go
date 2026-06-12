package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/vantare/overlays/v2/internal/app"
)

func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	if s.svc == nil {
		http.Error(w, "telemetry service not available", http.StatusServiceUnavailable)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch, unsubscribe := s.svc.Subscribe()
	defer unsubscribe()

	for {
		select {
		case <-r.Context().Done():
			return
		case upd, ok := <-ch:
			if !ok {
				return
			}
			wire := app.WireFromUpdate(upd)
			data, err := json.Marshal(wire)
			if err != nil {
				log.Printf("SSE marshal error: %v", err)
				continue
			}
			_, err = fmt.Fprintf(w, "event: telemetry\ndata: %s\n\n", data)
			if err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
