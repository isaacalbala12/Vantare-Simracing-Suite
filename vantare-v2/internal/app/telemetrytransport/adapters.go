package telemetrytransport

import (
	"context"
	"fmt"
	"net"
	"net/http"
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

// ServeWailsPublisher registers one active v2 consumer for this bridge and
// releases the lazily-created publisher when the bridge stops.
func ServeWailsPublisher(
	ctx context.Context,
	registry *PublisherRegistry,
	product PublisherProduct,
	emitter EventEmitter,
) error {
	if emitter == nil {
		return ErrInvalidEnvelope
	}
	publisher, release, err := registry.RegisterConsumer(product)
	if err != nil {
		return err
	}
	defer release()
	subscription, err := publisher.Subscribe(ctx)
	if err != nil {
		return err
	}
	defer subscription.Close()
	for {
		event, nextErr := subscription.Next(ctx)
		if nextErr != nil {
			return nextErr
		}
		emitter.Emit(PublisherEventName(event.Product, event.Kind), event.Data)
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

func isLoopback(remoteAddress string) bool {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		host = remoteAddress
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
