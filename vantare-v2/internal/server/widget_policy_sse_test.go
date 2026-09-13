package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/license"
)

func ResultForPolicyStream() license.Result {
	return license.Result{
		State:        license.StateActive,
		Entitlements: []license.Entitlement{license.EntitlementBundle},
	}
}

type policyStreamEvent struct {
	name string
	data []byte
}

type policyStreamRecorder struct {
	header http.Header
	mu     sync.Mutex
	buffer bytes.Buffer
	notify chan struct{}
}

func newPolicyStreamRecorder() *policyStreamRecorder {
	return &policyStreamRecorder{
		header: make(http.Header),
		notify: make(chan struct{}, 64),
	}
}

func (w *policyStreamRecorder) Header() http.Header { return w.header }
func (w *policyStreamRecorder) WriteHeader(int)     {}
func (w *policyStreamRecorder) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	count, err := w.buffer.Write(data)
	select {
	case w.notify <- struct{}{}:
	default:
	}
	return count, err
}
func (w *policyStreamRecorder) Flush() {}

func (w *policyStreamRecorder) policyEvents(t *testing.T) []policyStreamEvent {
	t.Helper()
	w.mu.Lock()
	defer w.mu.Unlock()
	lines := bytes.Split(w.buffer.Bytes(), []byte("\n"))
	var result []policyStreamEvent
	var current policyStreamEvent
	for _, line := range lines {
		switch {
		case bytes.HasPrefix(line, []byte("event: ")):
			current.name = string(bytes.TrimPrefix(line, []byte("event: ")))
		case bytes.HasPrefix(line, []byte("data: ")):
			current.data = append([]byte(nil), bytes.TrimPrefix(line, []byte("data: "))...)
		case len(line) == 0 && current.name != "":
			result = append(result, current)
			current = policyStreamEvent{}
		}
	}
	return result
}

func (w *policyStreamRecorder) waitPolicyEvents(t *testing.T, count int) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		if len(w.policyEvents(t)) >= count {
			return
		}
		select {
		case <-w.notify:
		case <-deadline:
			t.Fatalf("got %d policy SSE events, want %d", len(w.policyEvents(t)), count)
		}
	}
}

func fastPolicyPoll(t *testing.T) {
	t.Helper()
	previous := widgetPolicySSEPollInterval
	widgetPolicySSEPollInterval = 20 * time.Millisecond
	t.Cleanup(func() { widgetPolicySSEPollInterval = previous })
}

func TestWidgetPolicyStreamRequiresSource(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, WidgetPolicyStreamRoute, nil)
	request.RemoteAddr = "127.0.0.1:45678"
	recorder := httptest.NewRecorder()
	widgetPolicyStreamHandler(nil).ServeHTTP(recorder, request)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
}

func TestWidgetPolicyStreamLoopbackOnly(t *testing.T) {
	svc := license.NewService(license.Config{}, nil, nil)
	request := httptest.NewRequest(http.MethodGet, WidgetPolicyStreamRoute, nil)
	request.RemoteAddr = "192.0.2.1:45678"
	recorder := httptest.NewRecorder()
	widgetPolicyStreamHandler(svc).ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", recorder.Code)
	}
}

func TestWidgetPolicyStreamSnapshotThenChange(t *testing.T) {
	fastPolicyPoll(t)
	svc := license.NewService(license.Config{}, nil, nil)
	requestCtx, cancelRequest := context.WithCancel(context.Background())
	request := httptest.NewRequest(http.MethodGet, WidgetPolicyStreamRoute, nil).WithContext(requestCtx)
	request.RemoteAddr = "127.0.0.1:45678"
	writer := newPolicyStreamRecorder()
	done := make(chan struct{})
	go func() {
		widgetPolicyStreamHandler(svc).ServeHTTP(writer, request)
		close(done)
	}()
	writer.waitPolicyEvents(t, 1)
	first := writer.policyEvents(t)[0]
	if first.name != "widget-policy:snapshot" {
		t.Fatalf("first event = %q, want widget-policy:snapshot", first.name)
	}
	var snapshot license.WidgetPolicyWire
	if err := json.Unmarshal(first.data, &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.OverlaysAdvanced || snapshot.EngineerAI {
		t.Fatalf("initial snapshot = %+v, want free", snapshot)
	}

	result := ResultForPolicyStream()
	svc.EmitChanged(&result)
	writer.waitPolicyEvents(t, 2)
	events := writer.policyEvents(t)
	last := events[len(events)-1]
	if last.name != "widget-policy:changed" {
		t.Fatalf("second event = %q, want widget-policy:changed", last.name)
	}
	var changed license.WidgetPolicyWire
	if err := json.Unmarshal(last.data, &changed); err != nil {
		t.Fatal(err)
	}
	if !changed.OverlaysAdvanced || !changed.EngineerAI {
		t.Fatalf("changed event = %+v, want premium", changed)
	}
	if changed.Revision <= snapshot.Revision {
		t.Fatalf("revision must advance: %d -> %d", snapshot.Revision, changed.Revision)
	}
	for i := 1; i < len(events); i++ {
		var prev, next license.WidgetPolicyWire
		if err := json.Unmarshal(events[i-1].data, &prev); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(events[i].data, &next); err != nil {
			t.Fatal(err)
		}
		if next.Revision < prev.Revision {
			t.Fatalf("revisions went backwards: %d -> %d", prev.Revision, next.Revision)
		}
	}

	cancelRequest()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("stream handler did not stop after request cancellation")
	}
}

func TestWidgetPolicyStreamReconnectGetsFreshSnapshot(t *testing.T) {
	fastPolicyPoll(t)
	svc := license.NewService(license.Config{}, nil, nil)
	result := ResultForPolicyStream()
	svc.EmitChanged(&result)
	request := httptest.NewRequest(http.MethodGet, WidgetPolicyStreamRoute, nil)
	request.RemoteAddr = "127.0.0.1:45678"
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer := newPolicyStreamRecorder()
	done := make(chan struct{})
	go func() {
		widgetPolicyStreamHandler(svc).ServeHTTP(writer, request.WithContext(ctx))
		close(done)
	}()
	writer.waitPolicyEvents(t, 1)
	first := writer.policyEvents(t)[0]
	var snapshot license.WidgetPolicyWire
	if err := json.Unmarshal(first.data, &snapshot); err != nil {
		t.Fatal(err)
	}
	if !snapshot.OverlaysAdvanced {
		t.Fatalf("reconnect snapshot = %+v, want current premium rights", snapshot)
	}
	if snapshot.Revision != svc.CurrentWidgetPolicy().Revision {
		t.Fatalf("reconnect revision = %d, want %d", snapshot.Revision, svc.CurrentWidgetPolicy().Revision)
	}
}

func TestWidgetPolicyStreamWireHasNoPII(t *testing.T) {
	fastPolicyPoll(t)
	svc := license.NewService(license.Config{}, nil, nil)
	result := ResultForPolicyStream()
	svc.EmitChanged(&result)
	request := httptest.NewRequest(http.MethodGet, WidgetPolicyStreamRoute, nil)
	request.RemoteAddr = "127.0.0.1:45678"
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer := newPolicyStreamRecorder()
	done := make(chan struct{})
	go func() {
		widgetPolicyStreamHandler(svc).ServeHTTP(writer, request.WithContext(ctx))
		close(done)
	}()
	writer.waitPolicyEvents(t, 1)
	raw := string(writer.policyEvents(t)[0].data)
	for _, forbidden := range []string{"userId", "email", "entitlements", "capabilities", "operationalRoles", "token"} {
		if strings.Contains(raw, `"`+forbidden+`"`) {
			t.Fatalf("stream leaks %q: %s", forbidden, raw)
		}
	}
}

func TestWidgetPolicyStreamRestartSnapshotIsAuthoritative(t *testing.T) {
	fastPolicyPoll(t)
	// Old process: two effective publications, sequence at 2.
	oldSvc := license.NewService(license.Config{}, nil, nil)
	oldFirst := ResultForPolicyStream()
	oldSvc.EmitChanged(&oldFirst)
	oldSecond := ResultForPolicyStream()
	oldSecond.State = license.StateAuthenticatedNoEntitlement
	oldSvc.EmitChanged(&oldSecond)
	oldRevision := oldSvc.CurrentWidgetPolicy().Revision
	if oldRevision < 2 {
		t.Fatalf("old authority revision = %d, want >= 2", oldRevision)
	}
	// Authority restart: a fresh process restarts the numeric sequence.
	newSvc := license.NewService(license.Config{}, nil, nil)
	fresh := ResultForPolicyStream()
	newSvc.EmitChanged(&fresh)
	freshRevision := newSvc.CurrentWidgetPolicy().Revision
	if freshRevision >= oldRevision {
		t.Fatalf("restarted revision = %d, want smaller than %d", freshRevision, oldRevision)
	}
	request := httptest.NewRequest(http.MethodGet, WidgetPolicyStreamRoute, nil)
	request.RemoteAddr = "127.0.0.1:45678"
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer := newPolicyStreamRecorder()
	done := make(chan struct{})
	go func() {
		widgetPolicyStreamHandler(newSvc).ServeHTTP(writer, request.WithContext(ctx))
		close(done)
	}()
	writer.waitPolicyEvents(t, 1)
	event := writer.policyEvents(t)[0]
	// The reconnect snapshot is authoritative even though its revision is
	// smaller than anything the previous process published; only later
	// changed events on this connection are revision-gated.
	if event.name != "widget-policy:snapshot" {
		t.Fatalf("first event after restart = %q, want authoritative widget-policy:snapshot", event.name)
	}
	var snapshot license.WidgetPolicyWire
	if err := json.Unmarshal(event.data, &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Revision != freshRevision || !snapshot.OverlaysAdvanced {
		t.Fatalf("restart snapshot = %+v, want the fresh authoritative rights", snapshot)
	}
}
