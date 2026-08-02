package app

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/testingcenter/reportdraft"
)

type reportDraftEvent struct {
	name string
	data any
}

type reportDraftEventSpy struct {
	mu     sync.Mutex
	events []reportDraftEvent
	notify chan struct{}
}

func newReportDraftEventSpy() *reportDraftEventSpy {
	return &reportDraftEventSpy{notify: make(chan struct{}, 1)}
}

func (s *reportDraftEventSpy) Emit(name string, data any) {
	s.mu.Lock()
	s.events = append(s.events, reportDraftEvent{name: name, data: data})
	s.mu.Unlock()
	select {
	case s.notify <- struct{}{}:
	default:
	}
}

func (s *reportDraftEventSpy) waitFor(t *testing.T, name, requestID string) reportDraftEvent {
	t.Helper()
	deadline := time.NewTimer(2 * time.Second)
	defer deadline.Stop()
	for {
		s.mu.Lock()
		for _, event := range s.events {
			if event.name == name && reportDraftEventRequestID(event.data) == requestID {
				s.mu.Unlock()
				return event
			}
		}
		s.mu.Unlock()
		select {
		case <-s.notify:
		case <-deadline.C:
			t.Fatalf("event %q for %q was not emitted", name, requestID)
		}
	}
}

func reportDraftEventRequestID(data any) string {
	switch response := data.(type) {
	case TestingCenterReportDraftResponse:
		return response.RequestID
	case TestingCenterReportDraftDiscardedResponse:
		return response.RequestID
	case TestingCenterReportDraftErrorResponse:
		return response.RequestID
	default:
		return ""
	}
}

type reportDraftStoreStub struct {
	saveDraft  reportdraft.Draft
	loadDraft  reportdraft.Draft
	saveErr    error
	loadErr    error
	discardErr error
	saveStart  chan struct{}
	blockSave  bool

	mu           sync.Mutex
	saveCalls    int
	loadCalls    int
	discardCalls int
}

func (s *reportDraftStoreStub) Save(ctx context.Context, _ reportdraft.Fields) (reportdraft.Draft, error) {
	s.mu.Lock()
	s.saveCalls++
	s.mu.Unlock()
	if s.saveStart != nil {
		select {
		case s.saveStart <- struct{}{}:
		default:
		}
	}
	if s.blockSave {
		<-ctx.Done()
		return reportdraft.Draft{}, ctx.Err()
	}
	return s.saveDraft, s.saveErr
}

func (s *reportDraftStoreStub) Load(context.Context) (reportdraft.Draft, error) {
	s.mu.Lock()
	s.loadCalls++
	s.mu.Unlock()
	return s.loadDraft, s.loadErr
}

func (s *reportDraftStoreStub) Discard(context.Context) error {
	s.mu.Lock()
	s.discardCalls++
	s.mu.Unlock()
	return s.discardErr
}

func TestTestingCenterReportDraftBridgePersistsOnlyClosedDraftDTOs(t *testing.T) {
	store, err := reportdraft.NewStore(filepath.Join(t.TempDir(), reportdraft.DirectoryName, reportdraft.FileName))
	if err != nil {
		t.Fatal(err)
	}
	emitter := newReportDraftEventSpy()
	bridge := NewTestingCenterReportDraftBridge(context.Background(), store, emitter)
	defer bridge.Close()

	bridge.HandleLoad(map[string]any{"requestId": "load-none"})
	notFound := emitter.waitFor(t, TestingCenterReportDraftEventError, "load-none").data.(TestingCenterReportDraftErrorResponse)
	if notFound.Code != TestingCenterReportDraftErrorNotFound {
		t.Fatalf("load error = %q", notFound.Code)
	}

	bridge.HandleSave(map[string]any{
		"requestId": "save-one",
		"draft": map[string]any{
			"actionText":   "Open the overlay",
			"expectedText": "The widget appears",
			"observedText": "The widget stays hidden",
			"contextText":  "After changing profile",
			"module":       "overlay_runtime",
		},
	})
	saved := emitter.waitFor(t, TestingCenterReportDraftEventSaved, "save-one").data.(TestingCenterReportDraftResponse)
	if saved.Draft.IdempotencyKey == "" || saved.Draft.ActionText != "Open the overlay" {
		t.Fatalf("saved response = %#v", saved)
	}

	bridge.HandleLoad(map[string]any{"requestId": "load-one"})
	loaded := emitter.waitFor(t, TestingCenterReportDraftEventLoaded, "load-one").data.(TestingCenterReportDraftResponse)
	if loaded.Draft != saved.Draft {
		t.Fatalf("loaded = %#v, saved = %#v", loaded.Draft, saved.Draft)
	}

	bridge.HandleDiscard(map[string]any{"requestId": "discard-one"})
	emitter.waitFor(t, TestingCenterReportDraftEventDiscarded, "discard-one")
	bridge.HandleLoad(map[string]any{"requestId": "load-after"})
	after := emitter.waitFor(t, TestingCenterReportDraftEventError, "load-after").data.(TestingCenterReportDraftErrorResponse)
	if after.Code != TestingCenterReportDraftErrorNotFound {
		t.Fatalf("load after discard error = %q", after.Code)
	}
}

func TestTestingCenterReportDraftBridgeRejectsUnknownOrOversizedInput(t *testing.T) {
	store := &reportDraftStoreStub{}
	emitter := newReportDraftEventSpy()
	bridge := NewTestingCenterReportDraftBridge(context.Background(), store, emitter)
	defer bridge.Close()

	bridge.HandleSave(map[string]any{
		"requestId":    "bad-field",
		"draft":        map[string]any{},
		"sessionToken": "must-not-cross",
	})
	invalid := emitter.waitFor(t, TestingCenterReportDraftEventError, "bad-field").data.(TestingCenterReportDraftErrorResponse)
	if invalid.Code != TestingCenterReportDraftErrorInvalidRequest {
		t.Fatalf("unknown field code = %q", invalid.Code)
	}

	bridge.HandleSave(map[string]any{
		"requestId": "too-large",
		"draft":     map[string]any{"actionText": string(make([]byte, maxTestingCenterReportDraftInputBytes))},
	})
	oversized := emitter.waitFor(t, TestingCenterReportDraftEventError, "too-large").data.(TestingCenterReportDraftErrorResponse)
	if oversized.Code != TestingCenterReportDraftErrorInvalidRequest {
		t.Fatalf("oversized code = %q", oversized.Code)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.saveCalls != 0 {
		t.Fatalf("invalid input reached store %d times", store.saveCalls)
	}
}

func TestTestingCenterReportDraftBridgeMapsStorageErrorsWithoutDetails(t *testing.T) {
	store := &reportDraftStoreStub{loadErr: errors.New("C:\\private\\user\\draft.json")}
	emitter := newReportDraftEventSpy()
	bridge := NewTestingCenterReportDraftBridge(context.Background(), store, emitter)
	defer bridge.Close()

	bridge.HandleLoad(map[string]any{"requestId": "load-fail"})
	response := emitter.waitFor(t, TestingCenterReportDraftEventError, "load-fail").data.(TestingCenterReportDraftErrorResponse)
	if response.Code != TestingCenterReportDraftErrorInternal {
		t.Fatalf("storage error code = %q", response.Code)
	}
}

func TestTestingCenterReportDraftBridgeCancelsCorrelatedOperation(t *testing.T) {
	store := &reportDraftStoreStub{blockSave: true, saveStart: make(chan struct{}, 1)}
	emitter := newReportDraftEventSpy()
	bridge := NewTestingCenterReportDraftBridge(context.Background(), store, emitter)
	defer bridge.Close()

	bridge.HandleSave(map[string]any{"requestId": "cancel-me", "draft": map[string]any{}})
	select {
	case <-store.saveStart:
	case <-time.After(2 * time.Second):
		t.Fatal("save did not start")
	}
	bridge.HandleCancel(map[string]any{"requestId": "cancel-me", "operation": "save"})
	response := emitter.waitFor(t, TestingCenterReportDraftEventError, "cancel-me").data.(TestingCenterReportDraftErrorResponse)
	if response.Code != TestingCenterReportDraftErrorCanceled {
		t.Fatalf("cancel code = %q", response.Code)
	}
}

func TestTestingCenterReportDraftBridgeNilStoreAndCloseFailClosed(t *testing.T) {
	emitter := newReportDraftEventSpy()
	bridge := NewTestingCenterReportDraftBridge(context.Background(), nil, emitter)
	bridge.HandleLoad(map[string]any{"requestId": "unavailable"})
	response := emitter.waitFor(t, TestingCenterReportDraftEventError, "unavailable").data.(TestingCenterReportDraftErrorResponse)
	if response.Code != TestingCenterReportDraftErrorUnavailable {
		t.Fatalf("nil store code = %q", response.Code)
	}
	bridge.Close()
	bridge.HandleLoad(map[string]any{"requestId": "after-close"})
	closed := emitter.waitFor(t, TestingCenterReportDraftEventError, "after-close").data.(TestingCenterReportDraftErrorResponse)
	if closed.Code != TestingCenterReportDraftErrorUnavailable {
		t.Fatalf("closed code = %q", closed.Code)
	}
}
