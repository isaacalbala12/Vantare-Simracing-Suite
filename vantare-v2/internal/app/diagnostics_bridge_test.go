package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/diagnostics"
	"github.com/vantare/overlays/v2/internal/telemetry/recording"
	recordingsqlite "github.com/vantare/overlays/v2/internal/telemetry/recording/sqlite"
)

type diagnosticsEvent struct {
	name string
	data any
}

type diagnosticsEventSpy struct {
	mu     sync.Mutex
	events []diagnosticsEvent
	notify chan struct{}
}

func (s *diagnosticsEventSpy) Emit(name string, data any) {
	s.mu.Lock()
	s.events = append(s.events, diagnosticsEvent{name: name, data: data})
	s.mu.Unlock()
	if s.notify != nil {
		select {
		case s.notify <- struct{}{}:
		default:
		}
	}
}

func newDiagnosticsEventSpy() *diagnosticsEventSpy {
	return &diagnosticsEventSpy{notify: make(chan struct{}, 1)}
}

func (s *diagnosticsEventSpy) waitFor(
	t *testing.T,
	name string,
	requestID string,
) diagnosticsEvent {
	t.Helper()
	deadline := time.NewTimer(2 * time.Second)
	defer deadline.Stop()
	for {
		s.mu.Lock()
		for _, event := range s.events {
			if event.name != name {
				continue
			}
			if requestID == "" || diagnosticsEventRequestID(event.data) == requestID {
				s.mu.Unlock()
				return event
			}
		}
		s.mu.Unlock()
		select {
		case <-s.notify:
		case <-deadline.C:
			t.Fatalf("diagnostics event %q for %q was not emitted", name, requestID)
		}
	}
}

func (s *diagnosticsEventSpy) snapshot() []diagnosticsEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]diagnosticsEvent(nil), s.events...)
}

func diagnosticsEventRequestID(data any) string {
	switch response := data.(type) {
	case DiagnosticsPreparedResponse:
		return response.RequestID
	case DiagnosticsSessionsListedResponse:
		return response.RequestID
	case DiagnosticsSessionInspectedResponse:
		return response.RequestID
	case DiagnosticsErrorResponse:
		return response.RequestID
	default:
		return ""
	}
}

type diagnosticsCatalogStub struct {
	listResult diagnostics.ListResult
	listErr    error
	session    diagnostics.Session
	inspectErr error
	listCalls  atomic.Int32
}

type blockingDiagnosticsCatalog struct {
	started chan struct{}
}

func newBlockingDiagnosticsCatalog() *blockingDiagnosticsCatalog {
	return &blockingDiagnosticsCatalog{started: make(chan struct{}, 8)}
}

func (s *blockingDiagnosticsCatalog) List(ctx context.Context, _ int) (diagnostics.ListResult, error) {
	s.started <- struct{}{}
	<-ctx.Done()
	return diagnostics.ListResult{}, ctx.Err()
}

func (s *blockingDiagnosticsCatalog) Inspect(ctx context.Context, _ string) (diagnostics.Session, error) {
	s.started <- struct{}{}
	<-ctx.Done()
	return diagnostics.Session{}, ctx.Err()
}

func (s *diagnosticsCatalogStub) List(context.Context, int) (diagnostics.ListResult, error) {
	s.listCalls.Add(1)
	return s.listResult, s.listErr
}

func (s *diagnosticsCatalogStub) Inspect(context.Context, string) (diagnostics.Session, error) {
	return s.session, s.inspectErr
}

func TestDiagnosticsBridgeEmitsCorrelatedClosedResponses(t *testing.T) {
	emitter := newDiagnosticsEventSpy()
	report := NewDiagnosticsService("v1.2.3", "", nil, nil, nil)
	catalog := &diagnosticsCatalogStub{
		listResult: diagnostics.ListResult{
			Sessions: []diagnostics.Session{{
				Handle:        "diag-0123456789abcdef0123456789abcdef",
				Compatibility: diagnostics.CompatibilityCurrent,
				Availability:  diagnostics.AvailabilityReady,
				Simulator:     "lmu",
			}},
		},
		session: diagnostics.Session{
			Handle:        "diag-0123456789abcdef0123456789abcdef",
			Compatibility: diagnostics.CompatibilityCurrent,
			Availability:  diagnostics.AvailabilityReady,
			Simulator:     "lmu",
		},
	}
	bridge := newDiagnosticsBridge(context.Background(), report, catalog, emitter)
	t.Cleanup(bridge.Close)

	bridge.HandlePrepare(map[string]any{"requestId": "request-prepare-1"})
	preparedEvent := emitter.waitFor(t, DiagnosticsEventPrepared, "request-prepare-1")
	if preparedEvent.name != DiagnosticsEventPrepared {
		t.Fatalf("prepare event = %q", preparedEvent.name)
	}
	prepared, ok := preparedEvent.data.(DiagnosticsPreparedResponse)
	if !ok || prepared.RequestID != "request-prepare-1" {
		t.Fatalf("prepared response = %#v", preparedEvent.data)
	}

	bridge.HandleList(map[string]any{
		"requestId": "request-list-0001",
		"limit":     25,
	})
	listedEvent := emitter.waitFor(t, DiagnosticsEventSessionsListed, "request-list-0001")
	if listedEvent.name != DiagnosticsEventSessionsListed {
		t.Fatalf("list event = %q", listedEvent.name)
	}
	listed, ok := listedEvent.data.(DiagnosticsSessionsListedResponse)
	if !ok || listed.RequestID != "request-list-0001" ||
		len(listed.Result.Sessions) != 1 || listed.Result.Truncated {
		t.Fatalf("listed response = %#v", listedEvent.data)
	}

	bridge.HandleInspect(map[string]any{
		"requestId": "request-inspect-1",
		"handle":    "diag-0123456789abcdef0123456789abcdef",
	})
	inspectedEvent := emitter.waitFor(t, DiagnosticsEventSessionInspected, "request-inspect-1")
	if inspectedEvent.name != DiagnosticsEventSessionInspected {
		t.Fatalf("inspect event = %q", inspectedEvent.name)
	}
	inspected, ok := inspectedEvent.data.(DiagnosticsSessionInspectedResponse)
	if !ok || inspected.RequestID != "request-inspect-1" ||
		inspected.Session.Handle != catalog.session.Handle {
		t.Fatalf("inspected response = %#v", inspectedEvent.data)
	}
}

func TestDiagnosticsBridgeMapsErrorsWithoutLeakingDetails(t *testing.T) {
	tests := []struct {
		name       string
		operation  DiagnosticsOperation
		data       any
		listErr    error
		inspectErr error
		wantCode   DiagnosticsErrorCode
	}{
		{
			name: "invalid prepare request", operation: DiagnosticsOperationPrepare,
			data:     map[string]any{"requestId": `C:\Users\SyntheticUser\token`},
			wantCode: DiagnosticsErrorInvalidRequest,
		},
		{
			name: "invalid list limit", operation: DiagnosticsOperationList,
			data:     map[string]any{"requestId": "request-list-0001", "limit": MaxDiagnosticsCatalogLimit + 1},
			wantCode: DiagnosticsErrorInvalidRequest,
		},
		{
			name: "stale handle", operation: DiagnosticsOperationInspect,
			data: map[string]any{
				"requestId": "request-inspect-1",
				"handle":    "diag-0123456789abcdef0123456789abcdef",
			},
			inspectErr: diagnostics.ErrStaleCatalogHandle,
			wantCode:   DiagnosticsErrorStaleHandle,
		},
		{
			name: "canceled list", operation: DiagnosticsOperationList,
			data:     map[string]any{"requestId": "request-list-0001", "limit": 10},
			listErr:  context.Canceled,
			wantCode: DiagnosticsErrorCanceled,
		},
		{
			name: "deadline exceeded", operation: DiagnosticsOperationList,
			data:     map[string]any{"requestId": "request-list-0001", "limit": 10},
			listErr:  context.DeadlineExceeded,
			wantCode: DiagnosticsErrorUnavailable,
		},
		{
			name: "unexpected backend detail", operation: DiagnosticsOperationList,
			data:     map[string]any{"requestId": "request-list-0001", "limit": 10},
			listErr:  errors.New(`open C:\Users\SyntheticUser\secret.sqlite: token=synthetic-secret`),
			wantCode: DiagnosticsErrorListFailed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			emitter := newDiagnosticsEventSpy()
			bridge := newDiagnosticsBridge(
				context.Background(),
				NewDiagnosticsService("v1", "", nil, nil, nil),
				&diagnosticsCatalogStub{
					listErr:    tt.listErr,
					inspectErr: tt.inspectErr,
				},
				emitter,
			)
			t.Cleanup(bridge.Close)

			switch tt.operation {
			case DiagnosticsOperationPrepare:
				bridge.HandlePrepare(tt.data)
			case DiagnosticsOperationList:
				bridge.HandleList(tt.data)
			case DiagnosticsOperationInspect:
				bridge.HandleInspect(tt.data)
			default:
				t.Fatalf("unexpected operation %q", tt.operation)
			}

			event := emitter.waitFor(t, DiagnosticsEventError, "")
			if event.name != DiagnosticsEventError {
				t.Fatalf("event = %q", event.name)
			}
			response, ok := event.data.(DiagnosticsErrorResponse)
			if !ok || response.Operation != tt.operation || response.Code != tt.wantCode {
				t.Fatalf("error response = %#v", event.data)
			}
			encoded, err := json.Marshal(response)
			if err != nil {
				t.Fatal(err)
			}
			lower := strings.ToLower(string(encoded))
			for _, forbidden := range []string{
				`c:\\users`, "secret.sqlite", "token", "private",
				"open ", "context deadline exceeded", "context canceled",
			} {
				if strings.Contains(lower, strings.ToLower(forbidden)) {
					t.Fatalf("closed error leaked %q: %s", forbidden, encoded)
				}
			}
		})
	}
}

func TestDiagnosticsBridgeCreatesPrivateEmptyCatalog(t *testing.T) {
	root := filepath.Join(t.TempDir(), "telemetry", "sessions")
	emitter := newDiagnosticsEventSpy()
	bridge := NewDiagnosticsBridge(
		context.Background(),
		root,
		NewDiagnosticsService("v1", "", nil, nil, nil),
		emitter,
	)
	t.Cleanup(bridge.Close)

	info, err := os.Stat(root)
	if err != nil {
		t.Fatalf("stat sessions root: %v", err)
	}
	if !info.IsDir() {
		t.Fatalf("sessions root mode = %v", info.Mode())
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("sessions root mode = %v, want private permissions", info.Mode())
	}

	bridge.HandleList(map[string]any{
		"requestId": "request-list-empty",
		"limit":     10,
	})
	event := emitter.waitFor(t, DiagnosticsEventSessionsListed, "request-list-empty")
	listed, ok := event.data.(DiagnosticsSessionsListedResponse)
	if event.name != DiagnosticsEventSessionsListed || !ok ||
		len(listed.Result.Sessions) != 0 || listed.Result.Truncated {
		t.Fatalf("empty list event = %q %#v", event.name, event.data)
	}
}

func TestDiagnosticsBridgeEmptyConfigIsClosedUnavailableWithoutCWDFallback(t *testing.T) {
	cwd := t.TempDir()
	t.Chdir(cwd)
	emitter := newDiagnosticsEventSpy()
	bridge := NewDiagnosticsBridge(
		context.Background(),
		"",
		NewDiagnosticsService("v1", "", nil, nil, nil),
		emitter,
	)
	t.Cleanup(bridge.Close)

	bridge.HandleList(map[string]any{
		"requestId": "request-list-no-config",
		"limit":     10,
	})
	event := emitter.waitFor(t, DiagnosticsEventError, "request-list-no-config")
	response, ok := event.data.(DiagnosticsErrorResponse)
	if event.name != DiagnosticsEventError || !ok ||
		response.RequestID != "request-list-no-config" ||
		response.Operation != DiagnosticsOperationList ||
		response.Code != DiagnosticsErrorUnavailable {
		t.Fatalf("unavailable response = %q %#v", event.name, event.data)
	}
	if _, err := os.Stat(filepath.Join(cwd, "telemetry", "sessions")); !os.IsNotExist(err) {
		t.Fatalf("empty cfgDir created a cwd fallback: %v", err)
	}
}

func TestDiagnosticsBridgeRealCatalogDoesNotExposeStorageIdentity(t *testing.T) {
	root := filepath.Join(t.TempDir(), "telemetry", "sessions")
	emitter := newDiagnosticsEventSpy()
	bridge := NewDiagnosticsBridge(
		context.Background(),
		root,
		NewDiagnosticsService("v1", "", nil, nil, nil),
		emitter,
	)
	t.Cleanup(bridge.Close)

	currentID := "session-current-private"
	store := recordingsqlite.New(recordingsqlite.Options{})
	currentManifest := recording.NewSessionManifest(
		currentID,
		"lmu",
		"build",
		time.Now().Add(-time.Hour).Round(0).UTC(),
	)
	writer, err := store.Begin(
		context.Background(),
		recording.SessionRef{Root: root, SessionID: currentID},
		currentManifest,
	)
	if err != nil {
		t.Fatalf("create current session: %v", err)
	}
	if _, err := writer.Complete(context.Background()); err != nil {
		t.Fatalf("complete current session: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close current session: %v", err)
	}

	futureID := "session-future-private"
	futureManifest := recording.NewSessionManifest(
		futureID,
		"lmu",
		"build",
		time.Now().Add(-2*time.Hour).Round(0).UTC(),
	)
	futureManifest.ManifestVersion = recording.ManifestVersionV1 + 1
	writeDiagnosticsManifestFixture(t, root, futureID, futureManifest)

	corruptID := "session-corrupt-private"
	corruptDir := filepath.Join(root, corruptID)
	if err := os.MkdirAll(corruptDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(corruptDir, "manifest.json"), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}

	bridge.HandleList(map[string]any{
		"requestId": "request-list-real",
		"limit":     10,
	})
	event := emitter.waitFor(t, DiagnosticsEventSessionsListed, "request-list-real")
	listed, ok := event.data.(DiagnosticsSessionsListedResponse)
	if event.name != DiagnosticsEventSessionsListed || !ok ||
		len(listed.Result.Sessions) != 3 {
		t.Fatalf("real list event = %q %#v", event.name, event.data)
	}
	compatibility := make(map[diagnostics.Compatibility]diagnostics.Session)
	for _, session := range listed.Result.Sessions {
		compatibility[session.Compatibility] = session
	}
	for _, want := range []diagnostics.Compatibility{
		diagnostics.CompatibilityCurrent,
		diagnostics.CompatibilityFuture,
		diagnostics.CompatibilityCorrupt,
	} {
		if _, exists := compatibility[want]; !exists {
			t.Fatalf("missing compatibility %q: %#v", want, listed.Result.Sessions)
		}
	}

	inspectIndex := 0
	for _, session := range listed.Result.Sessions {
		// Corrupt sessions remain fully described by their metadata-only list
		// entry. Only current and future-compatible handles are inspectable.
		if session.Compatibility == diagnostics.CompatibilityCorrupt {
			continue
		}
		inspectIndex++
		requestID := "request-inspect-" + string(rune('0'+inspectIndex))
		bridge.HandleInspect(map[string]any{
			"requestId": requestID,
			"handle":    session.Handle,
		})
		inspectedEvent := emitter.waitFor(t, DiagnosticsEventSessionInspected, requestID)
		if inspectedEvent.name != DiagnosticsEventSessionInspected {
			t.Fatalf("inspect event = %q %#v", inspectedEvent.name, inspectedEvent.data)
		}
	}

	var encoded strings.Builder
	for _, emitted := range emitter.snapshot() {
		payload, err := json.Marshal(emitted.data)
		if err != nil {
			t.Fatal(err)
		}
		encoded.Write(payload)
	}
	for _, forbidden := range []string{
		root,
		currentID,
		futureID,
		corruptID,
		recording.ActiveDatabaseV1,
		"sqlite",
		"SessionRef",
	} {
		if strings.Contains(encoded.String(), forbidden) {
			t.Fatalf("response leaked storage identity %q: %s", forbidden, encoded.String())
		}
	}
}

func TestDiagnosticsBridgeRejectsLinkedParentComponents(t *testing.T) {
	base := t.TempDir()
	target := t.TempDir()
	linked := filepath.Join(base, "linked")
	if err := os.Symlink(target, linked); err != nil {
		t.Skipf("symlink creation is unavailable: %v", err)
	}
	_, err := prepareDiagnosticsSessionsRoot(filepath.Join(linked, "telemetry", "sessions"))
	if !errors.Is(err, errDiagnosticsBackendUnavailable) {
		t.Fatalf("prepare linked root error = %v, want unavailable", err)
	}
	if _, err := os.Stat(filepath.Join(target, "telemetry")); !os.IsNotExist(err) {
		t.Fatalf("linked target was mutated: %v", err)
	}
}

func TestDiagnosticsBridgeRejectsWindowsJunctionParent(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are Windows-only")
	}
	base := t.TempDir()
	target := t.TempDir()
	linked := filepath.Join(base, "junction")
	output, err := exec.Command("cmd", "/c", "mklink", "/J", linked, target).CombinedOutput()
	if err != nil {
		t.Skipf("junction creation is unavailable: %v (%s)", err, output)
	}
	t.Cleanup(func() {
		_ = os.Remove(linked)
	})

	_, err = prepareDiagnosticsSessionsRoot(filepath.Join(linked, "telemetry", "sessions"))
	if !errors.Is(err, errDiagnosticsBackendUnavailable) {
		t.Fatalf("prepare junction root error = %v, want unavailable", err)
	}
	if _, err := os.Stat(filepath.Join(target, "telemetry")); !os.IsNotExist(err) {
		t.Fatalf("junction target was mutated: %v", err)
	}
}

func TestDiagnosticsBridgeLimitsConcurrencyAndCleansOperations(t *testing.T) {
	emitter := newDiagnosticsEventSpy()
	catalog := newBlockingDiagnosticsCatalog()
	bridge := newDiagnosticsBridge(
		context.Background(),
		NewDiagnosticsService("v1", "", nil, nil, nil),
		catalog,
		emitter,
	)
	t.Cleanup(bridge.Close)

	for _, requestID := range []string{"request-block-01", "request-block-02"} {
		bridge.HandleList(map[string]any{"requestId": requestID, "limit": 10})
		select {
		case <-catalog.started:
		case <-time.After(time.Second):
			t.Fatalf("operation %q did not start", requestID)
		}
	}
	bridge.HandleList(map[string]any{"requestId": "request-block-03", "limit": 10})
	busy := emitter.waitFor(t, DiagnosticsEventError, "request-block-03")
	busyError := busy.data.(DiagnosticsErrorResponse)
	if busyError.Code != DiagnosticsErrorUnavailable {
		t.Fatalf("busy error = %#v", busyError)
	}

	for _, requestID := range []string{"request-block-01", "request-block-02"} {
		bridge.HandleCancel(map[string]any{
			"requestId": requestID,
			"operation": DiagnosticsOperationList,
		})
		event := emitter.waitFor(t, DiagnosticsEventError, requestID)
		response := event.data.(DiagnosticsErrorResponse)
		if response.Code != DiagnosticsErrorCanceled {
			t.Fatalf("cancel response = %#v", response)
		}
	}
	waitForDiagnosticsBridgeIdle(t, bridge)
}

func TestDiagnosticsBridgeConsumesCancelThatArrivesBeforeRequest(t *testing.T) {
	emitter := newDiagnosticsEventSpy()
	catalog := &diagnosticsCatalogStub{}
	bridge := newDiagnosticsBridge(
		context.Background(),
		NewDiagnosticsService("v1", "", nil, nil, nil),
		catalog,
		emitter,
	)
	t.Cleanup(bridge.Close)

	const requestID = "request-cancel-before"
	bridge.HandleCancel(map[string]any{
		"requestId": requestID,
		"operation": DiagnosticsOperationList,
	})
	bridge.HandleList(map[string]any{
		"requestId": requestID,
		"limit":     10,
	})

	event := emitter.waitFor(t, DiagnosticsEventError, requestID)
	response := event.data.(DiagnosticsErrorResponse)
	if response.Operation != DiagnosticsOperationList ||
		response.Code != DiagnosticsErrorCanceled {
		t.Fatalf("cancel-before response = %#v", response)
	}
	if calls := catalog.listCalls.Load(); calls != 0 {
		t.Fatalf("cancel-before called catalog %d times", calls)
	}
	bridge.mu.Lock()
	active := len(bridge.active)
	pending := len(bridge.pending)
	bridge.mu.Unlock()
	if active != 0 || pending != 0 || len(bridge.slots) != 0 {
		t.Fatalf(
			"cancel-before leaked state: active=%d pending=%d slots=%d",
			active,
			pending,
			len(bridge.slots),
		)
	}
}

func TestDiagnosticsBridgeBoundsAndExpiresPendingCancellations(t *testing.T) {
	emitter := newDiagnosticsEventSpy()
	catalog := &diagnosticsCatalogStub{}
	bridge := newDiagnosticsBridge(
		context.Background(),
		NewDiagnosticsService("v1", "", nil, nil, nil),
		catalog,
		emitter,
	)
	t.Cleanup(bridge.Close)

	now := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
	bridge.now = func() time.Time { return now }
	bridge.pendingTTL = time.Second

	for index := 0; index < maxPendingDiagnosticsCancellations+8; index++ {
		bridge.HandleCancel(map[string]any{
			"requestId": fmt.Sprintf("request-pending-%03d", index),
			"operation": DiagnosticsOperationList,
		})
	}
	bridge.mu.Lock()
	pending := len(bridge.pending)
	bridge.mu.Unlock()
	if pending != maxPendingDiagnosticsCancellations {
		t.Fatalf(
			"pending cancellations = %d, want %d",
			pending,
			maxPendingDiagnosticsCancellations,
		)
	}

	// A duplicate remains one bounded entry and only refreshes its expiry.
	bridge.HandleCancel(map[string]any{
		"requestId": "request-pending-000",
		"operation": DiagnosticsOperationList,
	})
	bridge.mu.Lock()
	pending = len(bridge.pending)
	bridge.mu.Unlock()
	if pending != maxPendingDiagnosticsCancellations {
		t.Fatalf("duplicate cancellation changed pending size to %d", pending)
	}

	now = now.Add(2 * time.Second)
	bridge.HandleList(map[string]any{
		"requestId": "request-pending-000",
		"limit":     10,
	})
	emitter.waitFor(t, DiagnosticsEventSessionsListed, "request-pending-000")
	if calls := catalog.listCalls.Load(); calls != 1 {
		t.Fatalf("expired cancellation catalog calls = %d, want 1", calls)
	}
	bridge.mu.Lock()
	pending = len(bridge.pending)
	bridge.mu.Unlock()
	if pending != 0 {
		t.Fatalf("expired cancellations retained: %d", pending)
	}
}

func TestDiagnosticsBridgeTimeoutCleansOperation(t *testing.T) {
	emitter := newDiagnosticsEventSpy()
	catalog := newBlockingDiagnosticsCatalog()
	bridge := newDiagnosticsBridge(
		context.Background(),
		NewDiagnosticsService("v1", "", nil, nil, nil),
		catalog,
		emitter,
	)
	bridge.timeout = 20 * time.Millisecond
	t.Cleanup(bridge.Close)

	bridge.HandleList(map[string]any{"requestId": "request-timeout", "limit": 10})
	select {
	case <-catalog.started:
	case <-time.After(time.Second):
		t.Fatal("timed operation did not start")
	}
	event := emitter.waitFor(t, DiagnosticsEventError, "request-timeout")
	response := event.data.(DiagnosticsErrorResponse)
	if response.Code != DiagnosticsErrorUnavailable {
		t.Fatalf("timeout response = %#v", response)
	}
	waitForDiagnosticsBridgeIdle(t, bridge)
}

func TestDiagnosticsBridgeCloseCancelsAndWaitsForOperations(t *testing.T) {
	emitter := newDiagnosticsEventSpy()
	catalog := newBlockingDiagnosticsCatalog()
	bridge := newDiagnosticsBridge(
		context.Background(),
		NewDiagnosticsService("v1", "", nil, nil, nil),
		catalog,
		emitter,
	)

	bridge.HandleList(map[string]any{"requestId": "request-shutdown", "limit": 10})
	select {
	case <-catalog.started:
	case <-time.After(time.Second):
		t.Fatal("shutdown operation did not start")
	}
	bridge.Close()

	event := emitter.waitFor(t, DiagnosticsEventError, "request-shutdown")
	response := event.data.(DiagnosticsErrorResponse)
	if response.Code != DiagnosticsErrorCanceled {
		t.Fatalf("shutdown response = %#v", response)
	}
	waitForDiagnosticsBridgeIdle(t, bridge)
	bridge.HandleList(map[string]any{"requestId": "request-after-close", "limit": 10})
	closedEvent := emitter.waitFor(t, DiagnosticsEventError, "request-after-close")
	closedResponse := closedEvent.data.(DiagnosticsErrorResponse)
	if closedResponse.Code != DiagnosticsErrorUnavailable {
		t.Fatalf("closed response = %#v", closedResponse)
	}
}

func TestDiagnosticsBridgeMalformedCancelDoesNotAffectActiveOperation(t *testing.T) {
	emitter := newDiagnosticsEventSpy()
	catalog := newBlockingDiagnosticsCatalog()
	bridge := newDiagnosticsBridge(
		context.Background(),
		NewDiagnosticsService("v1", "", nil, nil, nil),
		catalog,
		emitter,
	)
	t.Cleanup(bridge.Close)

	bridge.HandleList(map[string]any{"requestId": "request-cancel-safe", "limit": 10})
	<-catalog.started
	bridge.HandleCancel(map[string]any{
		"requestId": "request-cancel-safe",
		"operation": "unknown",
	})
	bridge.mu.Lock()
	active := len(bridge.active)
	bridge.mu.Unlock()
	if active != 1 {
		t.Fatalf("malformed cancel changed active operations: %d", active)
	}
	bridge.HandleCancel(map[string]any{
		"requestId": "request-cancel-safe",
		"operation": DiagnosticsOperationList,
	})
	event := emitter.waitFor(t, DiagnosticsEventError, "request-cancel-safe")
	if response := event.data.(DiagnosticsErrorResponse); response.Code != DiagnosticsErrorCanceled {
		t.Fatalf("cancel response = %#v", response)
	}
}

func waitForDiagnosticsBridgeIdle(t *testing.T, bridge *DiagnosticsBridge) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		bridge.mu.Lock()
		active := len(bridge.active)
		bridge.mu.Unlock()
		if active == 0 && len(bridge.slots) == 0 {
			return
		}
		time.Sleep(time.Millisecond)
	}
	bridge.mu.Lock()
	active := len(bridge.active)
	bridge.mu.Unlock()
	t.Fatalf("diagnostics bridge leaked operations: active=%d slots=%d", active, len(bridge.slots))
}

func writeDiagnosticsManifestFixture(
	t *testing.T,
	root string,
	sessionID string,
	manifest recording.SessionManifest,
) {
	t.Helper()
	sessionDir := filepath.Join(root, sessionID)
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessionDir, "manifest.json"), encoded, 0o600); err != nil {
		t.Fatal(err)
	}
}
