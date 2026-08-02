package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

func (s *Server) handleEngineerSSE(w http.ResponseWriter, r *http.Request) {
	if s.engineerSvc == nil {
		http.Error(w, "engineer service not available", http.StatusServiceUnavailable)
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
	w.Header().Set("X-Accel-Buffering", "no")

	ch, unsubscribe := s.engineerSvc.Subscribe()
	defer unsubscribe()
	// Commit the stream immediately. Clients must not depend on a future
	// Engineer message merely to finish the HTTP handshake.
	flusher.Flush()

	keepAlive := time.NewTicker(15 * time.Second)
	defer keepAlive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepAlive.C:
			if _, err := fmt.Fprint(w, ":keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case notif, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(notif)
			if err != nil {
				log.Printf("Engineer SSE marshal error: %v", err)
				continue
			}
			if _, err := fmt.Fprintf(w, "event: engineer-notification\ndata: %s\n\n", data); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
