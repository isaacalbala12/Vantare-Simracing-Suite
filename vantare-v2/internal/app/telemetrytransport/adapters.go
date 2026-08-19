package telemetrytransport

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
)

func ProjectionRoute(product ProductID) string {
	return "/telemetry/" + string(product) + "/projection"
}

func FactsRoute(product ProductID) string {
	return "/telemetry/" + string(product) + "/facts"
}

func EventName(product ProductID, kind EventKind) string {
	return "telemetry:" + string(product) + ":" + string(kind)
}

type EventEmitter interface {
	Emit(name string, data any)
}

// FactSubscription preserves ordered delivery. A gap is reported by the
// source; adapters never coalesce facts or derive their cursor from snapshots.
type FactSubscription interface {
	Next(ctx context.Context) (FactEnvelope, error)
	Close() error
}

type FactSource interface {
	SubscribeFacts(ctx context.Context, after uint64) (FactSubscription, error)
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

func ServeWailsFacts(
	ctx context.Context,
	product ProductID,
	source FactSource,
	after uint64,
	emitter EventEmitter,
) error {
	if !knownProduct(product) || source == nil || emitter == nil {
		return ErrInvalidEnvelope
	}
	subscription, err := source.SubscribeFacts(ctx, after)
	if err != nil {
		return err
	}
	defer subscription.Close()
	expected := after
	for {
		fact, nextErr := subscription.Next(ctx)
		if nextErr != nil {
			return nextErr
		}
		if err := validateFact(fact, DefaultMaxPayloadBytes); err != nil {
			return err
		}
		if fact.Product != product || !nextFactSequence(expected, fact.FactSequence) {
			return ErrSequenceGap
		}
		expected = fact.FactSequence
		emitter.Emit(EventName(product, EventFact), fact)
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

func SSEFactsHandler(product ProductID, source FactSource) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if !knownProduct(product) || source == nil {
			http.Error(w, "telemetry projection fact transport unavailable", http.StatusServiceUnavailable)
			return
		}
		if request.URL.Path != FactsRoute(product) {
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
		after, err := parseFactCursor(request)
		if err != nil {
			http.Error(w, "invalid fact cursor", http.StatusBadRequest)
			return
		}
		subscription, err := source.SubscribeFacts(request.Context(), after)
		if err != nil {
			http.Error(w, "full snapshot resync required", http.StatusConflict)
			return
		}
		defer subscription.Close()
		expected := after
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		emitted := false
		for {
			fact, nextErr := subscription.Next(request.Context())
			if nextErr != nil {
				return
			}
			if validateFact(fact, DefaultMaxPayloadBytes) != nil {
				return
			}
			if fact.Product != product || !nextFactSequence(expected, fact.FactSequence) {
				if !emitted {
					http.Error(w, ErrSequenceGap.Error(), http.StatusConflict)
				}
				return
			}
			expected = fact.FactSequence
			encoded, marshalErr := json.Marshal(fact)
			if marshalErr != nil {
				return
			}
			if _, writeErr := fmt.Fprintf(
				w,
				"event: %s\ndata: %s\n\n",
				EventName(product, EventFact),
				encoded,
			); writeErr != nil {
				return
			}
			emitted = true
			flusher.Flush()
		}
	})
}

func validateFact(fact FactEnvelope, maximum int) error {
	if !knownProduct(fact.Product) ||
		fact.ProjectionVersion == 0 || fact.Epoch == 0 ||
		fact.Sequence == 0 || fact.FactSequence == 0 || fact.StatusRevision == 0 {
		return ErrInvalidEnvelope
	}
	if err := validateTimestamp(fact.CapturedAt); err != nil {
		return err
	}
	return validatePayload(fact.Payload, maximum)
}

func nextFactSequence(after, next uint64) bool {
	return after < ^uint64(0) && next == after+1
}

func parseFactCursor(request *http.Request) (uint64, error) {
	value := request.URL.Query().Get("after")
	if value == "" {
		return 0, nil
	}
	return strconv.ParseUint(value, 10, 64)
}

func isLoopback(remoteAddress string) bool {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		host = remoteAddress
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
