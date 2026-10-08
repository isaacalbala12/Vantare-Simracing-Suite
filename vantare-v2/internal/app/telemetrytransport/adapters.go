package telemetrytransport

import (
	"context"
	"crypto/rand"
	"fmt"
	"net"
	"net/http"
	"time"
)

func ProjectionRoute(product ProductID) string {
	return "/telemetry/" + string(product) + "/projection"
}

func PublisherProjectionRoute(product PublisherProduct) string {
	return "/telemetry/" + string(product) + "/projection"
}

// Deprecated: reserved route contract for the F7 Engineer facts port; F4
// removes the disconnected Wails/SSE fact transport.
func FactsRoute(product ProductID) string {
	return "/telemetry/" + string(product) + "/facts"
}

func EventName(product ProductID, kind EventKind) string {
	return "telemetry:" + string(product) + ":" + string(kind)
}

func PublisherEventName(product PublisherProduct, kind PublisherEventKind) string {
	return "telemetry:" + string(product) + ":" + string(kind)
}

type EventEmitter interface {
	Emit(name string, data any)
}

// ServeWails blocks until cancellation or closure. It starts no goroutine; the
// composition owner decides where it runs and owns its lifecycle.
func ServeWails(ctx context.Context, hub *Hub, emitter EventEmitter) error {
	if hub == nil || emitter == nil {
		return ErrInvalidEnvelope
	}
	subscription, err := hub.Subscribe(ctx)
	if err != nil {
		return err
	}
	defer subscription.Close()
	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			return err
		}
		emitter.Emit(EventName(event.Product, event.Kind), event.Data)
	}
}

// SSEHandler exposes the same event names and JSON as ServeWails. It accepts
// loopback requests only and inherits teardown from the HTTP request context.
func SSEHandler(hub *Hub) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if hub == nil {
			http.Error(w, "telemetry projection transport unavailable", http.StatusServiceUnavailable)
			return
		}
		if !knownProduct(hub.product) || request.URL.Path != ProjectionRoute(hub.product) {
			http.NotFound(w, request)
			return
		}
		if !isLoopback(request.RemoteAddr) {
			http.Error(w, "loopback only", http.StatusForbidden)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, ErrUnsupportedProtocol.Error(), http.StatusInternalServerError)
			return
		}
		subscription, err := hub.Subscribe(request.Context())
		if err != nil {
			http.Error(w, "telemetry projection subscription unavailable", http.StatusServiceUnavailable)
			return
		}
		defer subscription.Close()

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		for {
			event, nextErr := subscription.Next(request.Context())
			if nextErr != nil {
				return
			}
			if _, writeErr := fmt.Fprintf(
				w,
				"event: %s\ndata: %s\n\n",
				EventName(event.Product, event.Kind),
				event.Data,
			); writeErr != nil {
				return
			}
			flusher.Flush()
		}
	})
}

// PublisherSSEHandler activates the configured product only while a loopback
// browser source is connected. Wails and SSE therefore share one retained
// latest-wins publisher when both consumers are active.
func PublisherSSEHandler(registry *PublisherRegistry, product PublisherProduct) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if registry == nil || !knownPublisherProduct(product) {
			http.Error(w, "telemetry publisher unavailable", http.StatusServiceUnavailable)
			return
		}
		if request.URL.Path != PublisherProjectionRoute(product) {
			http.NotFound(w, request)
			return
		}
		if !isLoopback(request.RemoteAddr) {
			http.Error(w, "loopback only", http.StatusForbidden)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, ErrUnsupportedProtocol.Error(), http.StatusInternalServerError)
			return
		}
		publisher, release, err := registry.RegisterConsumer(product)
		if err != nil {
			http.Error(w, "telemetry publisher unavailable", http.StatusServiceUnavailable)
			return
		}
		defer release()
		subscription, err := publisher.Subscribe(request.Context())
		if err != nil {
			http.Error(w, "telemetry publisher subscription unavailable", http.StatusServiceUnavailable)
			return
		}
		defer subscription.Close()

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		for {
			event, nextErr := subscription.Next(request.Context())
			if nextErr != nil {
				return
			}
			if _, writeErr := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", PublisherEventName(event.Product, event.Kind), event.Data); writeErr != nil {
				return
			}
			flusher.Flush()
		}
	})
}

// OverlayPullSource is the already selected Overlay delivery owner. The SSE
// adapter retains only its own ACK cursor and sends Rust-selected event bytes.
type OverlayPullSource interface {
	Pull(string, OverlayPullRequest) (OverlayPullResponse, bool, error)
	Close(string, string)
}

func OverlayPullSSEHandler(source OverlayPullSource) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if source == nil {
			http.Error(w, "overlay telemetry unavailable", http.StatusServiceUnavailable)
			return
		}
		if request.URL.Path != PublisherProjectionRoute(ProductOverlayV2) {
			http.NotFound(w, request)
			return
		}
		if !isLoopback(request.RemoteAddr) {
			http.Error(w, "loopback only", http.StatusForbidden)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, ErrUnsupportedProtocol.Error(), http.StatusInternalServerError)
			return
		}
		sender, session := "obs:"+rand.Text(), rand.Text()
		defer source.Close(sender, session)
		ack := uint64(0)
		first, deliver, err := source.Pull(sender, OverlayPullRequest{SessionID: session})
		if err != nil {
			http.Error(w, "overlay telemetry unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		for {
			if deliver {
				for _, event := range first.Events {
					if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Name, event.Data); err != nil {
						return
					}
				}
				flusher.Flush()
				ack = first.Delivery
			}
			delay := 100 * time.Millisecond
			if deliver {
				delay = 16 * time.Millisecond
			}
			timer := time.NewTimer(delay)
			select {
			case <-request.Context().Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			first, deliver, err = source.Pull(sender, OverlayPullRequest{SessionID: session, Ack: ack})
			if err != nil {
				return
			}
		}
	})
}

func isLoopback(remoteAddress string) bool {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		host = remoteAddress
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
