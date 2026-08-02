package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/testingcenter/reportdraft"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	TestingCenterReportDraftEventSave      = "testing-center:report-draft:save"
	TestingCenterReportDraftEventSaved     = "testing-center:report-draft:saved"
	TestingCenterReportDraftEventLoad      = "testing-center:report-draft:load"
	TestingCenterReportDraftEventLoaded    = "testing-center:report-draft:loaded"
	TestingCenterReportDraftEventDiscard   = "testing-center:report-draft:discard"
	TestingCenterReportDraftEventDiscarded = "testing-center:report-draft:discarded"
	TestingCenterReportDraftEventCancel    = "testing-center:report-draft:cancel"
	TestingCenterReportDraftEventError     = "testing-center:report-draft:error"

	defaultTestingCenterReportDraftTimeout = 5 * time.Second
	maxTestingCenterReportDraftOperations  = 2
	maxTestingCenterReportDraftInputBytes  = 20 * 1024
)

var (
	errTestingCenterReportDraftInvalidRequest = errors.New("testing center report draft request is invalid")
	errTestingCenterReportDraftUnavailable    = errors.New("testing center report draft is unavailable")
	errTestingCenterReportDraftBusy           = errors.New("testing center report draft operation limit reached")
)

type TestingCenterReportDraftOperation string

const (
	TestingCenterReportDraftOperationSave    TestingCenterReportDraftOperation = "save"
	TestingCenterReportDraftOperationLoad    TestingCenterReportDraftOperation = "load"
	TestingCenterReportDraftOperationDiscard TestingCenterReportDraftOperation = "discard"
)

type TestingCenterReportDraftErrorCode string

const (
	TestingCenterReportDraftErrorInvalidRequest TestingCenterReportDraftErrorCode = "invalid_request"
	TestingCenterReportDraftErrorNotFound       TestingCenterReportDraftErrorCode = "not_found"
	TestingCenterReportDraftErrorCorruptRemoved TestingCenterReportDraftErrorCode = "corrupt_removed"
	TestingCenterReportDraftErrorCanceled       TestingCenterReportDraftErrorCode = "canceled"
	TestingCenterReportDraftErrorUnavailable    TestingCenterReportDraftErrorCode = "unavailable"
	TestingCenterReportDraftErrorInternal       TestingCenterReportDraftErrorCode = "internal"
)

type TestingCenterReportDraftSaveRequest struct {
	RequestID string             `json:"requestId"`
	Draft     reportdraft.Fields `json:"draft"`
}

type TestingCenterReportDraftRequest struct {
	RequestID string `json:"requestId"`
}

type TestingCenterReportDraftCancelRequest struct {
	RequestID string                            `json:"requestId"`
	Operation TestingCenterReportDraftOperation `json:"operation"`
}

type TestingCenterReportDraftResponse struct {
	RequestID string            `json:"requestId"`
	Draft     reportdraft.Draft `json:"draft"`
}

type TestingCenterReportDraftDiscardedResponse struct {
	RequestID string `json:"requestId"`
}

type TestingCenterReportDraftErrorResponse struct {
	RequestID string                            `json:"requestId"`
	Operation TestingCenterReportDraftOperation `json:"operation"`
	Code      TestingCenterReportDraftErrorCode `json:"code"`
}

type testingCenterReportDraftStore interface {
	Save(context.Context, reportdraft.Fields) (reportdraft.Draft, error)
	Load(context.Context) (reportdraft.Draft, error)
	Discard(context.Context) error
}

type testingCenterReportDraftOperationKey struct {
	requestID string
	operation TestingCenterReportDraftOperation
}

// TestingCenterReportDraftBridge is the only Wails boundary for the resumable
// report text. It never accepts paths, tokens, diagnostics, logs or identity.
type TestingCenterReportDraftBridge struct {
	store   testingCenterReportDraftStore
	emitter EventEmitter
	timeout time.Duration

	ctx       context.Context
	cancel    context.CancelFunc
	slots     chan struct{}
	mu        sync.Mutex
	active    map[testingCenterReportDraftOperationKey]context.CancelFunc
	closed    bool
	waitGroup sync.WaitGroup
}

func NewTestingCenterReportDraftBridge(
	parent context.Context,
	store testingCenterReportDraftStore,
	emitter EventEmitter,
) *TestingCenterReportDraftBridge {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	return &TestingCenterReportDraftBridge{
		store:   store,
		emitter: emitter,
		timeout: defaultTestingCenterReportDraftTimeout,
		ctx:     ctx,
		cancel:  cancel,
		slots:   make(chan struct{}, maxTestingCenterReportDraftOperations),
		active:  make(map[testingCenterReportDraftOperationKey]context.CancelFunc),
	}
}

func (b *TestingCenterReportDraftBridge) RegisterHandlers(wailsApp *application.App) {
	if b == nil || wailsApp == nil {
		return
	}
	wailsApp.Event.On(TestingCenterReportDraftEventSave, func(event *application.CustomEvent) {
		b.HandleSave(event.Data)
	})
	wailsApp.Event.On(TestingCenterReportDraftEventLoad, func(event *application.CustomEvent) {
		b.HandleLoad(event.Data)
	})
	wailsApp.Event.On(TestingCenterReportDraftEventDiscard, func(event *application.CustomEvent) {
		b.HandleDiscard(event.Data)
	})
	wailsApp.Event.On(TestingCenterReportDraftEventCancel, func(event *application.CustomEvent) {
		b.HandleCancel(event.Data)
	})
}

func (b *TestingCenterReportDraftBridge) HandleSave(data any) {
	if b == nil {
		return
	}
	var request TestingCenterReportDraftSaveRequest
	if err := decodeTestingCenterReportDraftInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) {
		b.emitError(testingCenterReportDraftCorrelationID(data, request.RequestID), TestingCenterReportDraftOperationSave, errTestingCenterReportDraftInvalidRequest)
		return
	}
	b.startOperation(TestingCenterReportDraftOperationSave, request.RequestID, func(ctx context.Context) {
		if b.store == nil {
			b.emitError(request.RequestID, TestingCenterReportDraftOperationSave, errTestingCenterReportDraftUnavailable)
			return
		}
		draft, err := b.store.Save(ctx, request.Draft)
		if err == nil {
			err = ctx.Err()
		}
		if err != nil {
			b.emitError(request.RequestID, TestingCenterReportDraftOperationSave, err)
			return
		}
		b.emit(TestingCenterReportDraftEventSaved, TestingCenterReportDraftResponse{RequestID: request.RequestID, Draft: draft})
	})
}

func (b *TestingCenterReportDraftBridge) HandleLoad(data any) {
	if b == nil {
		return
	}
	var request TestingCenterReportDraftRequest
	if err := decodeTestingCenterReportDraftInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) {
		b.emitError(testingCenterReportDraftCorrelationID(data, request.RequestID), TestingCenterReportDraftOperationLoad, errTestingCenterReportDraftInvalidRequest)
		return
	}
	b.startOperation(TestingCenterReportDraftOperationLoad, request.RequestID, func(ctx context.Context) {
		if b.store == nil {
			b.emitError(request.RequestID, TestingCenterReportDraftOperationLoad, errTestingCenterReportDraftUnavailable)
			return
		}
		draft, err := b.store.Load(ctx)
		if err == nil {
			err = ctx.Err()
		}
		if err != nil {
			b.emitError(request.RequestID, TestingCenterReportDraftOperationLoad, err)
			return
		}
		b.emit(TestingCenterReportDraftEventLoaded, TestingCenterReportDraftResponse{RequestID: request.RequestID, Draft: draft})
	})
}

func (b *TestingCenterReportDraftBridge) HandleDiscard(data any) {
	if b == nil {
		return
	}
	var request TestingCenterReportDraftRequest
	if err := decodeTestingCenterReportDraftInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) {
		b.emitError(testingCenterReportDraftCorrelationID(data, request.RequestID), TestingCenterReportDraftOperationDiscard, errTestingCenterReportDraftInvalidRequest)
		return
	}
	b.startOperation(TestingCenterReportDraftOperationDiscard, request.RequestID, func(ctx context.Context) {
		if b.store == nil {
			b.emitError(request.RequestID, TestingCenterReportDraftOperationDiscard, errTestingCenterReportDraftUnavailable)
			return
		}
		err := b.store.Discard(ctx)
		if err == nil {
			err = ctx.Err()
		}
		if err != nil {
			b.emitError(request.RequestID, TestingCenterReportDraftOperationDiscard, err)
			return
		}
		b.emit(TestingCenterReportDraftEventDiscarded, TestingCenterReportDraftDiscardedResponse{RequestID: request.RequestID})
	})
}

func (b *TestingCenterReportDraftBridge) HandleCancel(data any) {
	if b == nil {
		return
	}
	var request TestingCenterReportDraftCancelRequest
	if err := decodeTestingCenterReportDraftInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) || !request.Operation.known() {
		return
	}
	key := testingCenterReportDraftOperationKey{requestID: request.RequestID, operation: request.Operation}
	b.mu.Lock()
	cancel := b.active[key]
	b.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (b *TestingCenterReportDraftBridge) Close() {
	if b == nil {
		return
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	b.closed = true
	b.cancel()
	b.mu.Unlock()
	b.waitGroup.Wait()
}

func (b *TestingCenterReportDraftBridge) startOperation(
	operation TestingCenterReportDraftOperation,
	requestID string,
	run func(context.Context),
) {
	key := testingCenterReportDraftOperationKey{requestID: requestID, operation: operation}
	b.mu.Lock()
	if b.closed || b.ctx.Err() != nil {
		b.mu.Unlock()
		b.emitError(requestID, operation, errTestingCenterReportDraftUnavailable)
		return
	}
	if _, exists := b.active[key]; exists {
		b.mu.Unlock()
		b.emitError(requestID, operation, errTestingCenterReportDraftInvalidRequest)
		return
	}
	select {
	case b.slots <- struct{}{}:
	default:
		b.mu.Unlock()
		b.emitError(requestID, operation, errTestingCenterReportDraftBusy)
		return
	}
	timeout := b.timeout
	if timeout <= 0 {
		timeout = defaultTestingCenterReportDraftTimeout
	}
	ctx, cancel := context.WithTimeout(b.ctx, timeout)
	b.active[key] = cancel
	b.waitGroup.Add(1)
	b.mu.Unlock()

	go func() {
		defer func() {
			cancel()
			<-b.slots
			b.mu.Lock()
			delete(b.active, key)
			b.mu.Unlock()
			b.waitGroup.Done()
		}()
		run(ctx)
	}()
}

func (operation TestingCenterReportDraftOperation) known() bool {
	switch operation {
	case TestingCenterReportDraftOperationSave, TestingCenterReportDraftOperationLoad,
		TestingCenterReportDraftOperationDiscard:
		return true
	default:
		return false
	}
}

func (b *TestingCenterReportDraftBridge) emit(name string, payload any) {
	if b != nil && b.emitter != nil {
		b.emitter.Emit(name, payload)
	}
}

func (b *TestingCenterReportDraftBridge) emitError(
	requestID string,
	operation TestingCenterReportDraftOperation,
	err error,
) {
	b.emit(TestingCenterReportDraftEventError, TestingCenterReportDraftErrorResponse{
		RequestID: requestID,
		Operation: operation,
		Code:      closedTestingCenterReportDraftErrorCode(err),
	})
}

func closedTestingCenterReportDraftErrorCode(err error) TestingCenterReportDraftErrorCode {
	switch {
	case errors.Is(err, errTestingCenterReportDraftInvalidRequest), errors.Is(err, reportdraft.ErrInvalidDraft):
		return TestingCenterReportDraftErrorInvalidRequest
	case errors.Is(err, reportdraft.ErrNotFound):
		return TestingCenterReportDraftErrorNotFound
	case errors.Is(err, reportdraft.ErrInvalidStoredDraftRemoved):
		return TestingCenterReportDraftErrorCorruptRemoved
	case errors.Is(err, context.Canceled):
		return TestingCenterReportDraftErrorCanceled
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, errTestingCenterReportDraftUnavailable), errors.Is(err, errTestingCenterReportDraftBusy):
		return TestingCenterReportDraftErrorUnavailable
	case errors.Is(err, reportdraft.ErrInvalidPath):
		return TestingCenterReportDraftErrorUnavailable
	default:
		return TestingCenterReportDraftErrorInternal
	}
}

func decodeTestingCenterReportDraftInput(data any, destination any) error {
	if data == nil || destination == nil {
		return errTestingCenterReportDraftInvalidRequest
	}
	raw, err := json.Marshal(data)
	if err != nil || len(raw) == 0 || len(raw) > maxTestingCenterReportDraftInputBytes {
		return errTestingCenterReportDraftInvalidRequest
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return errTestingCenterReportDraftInvalidRequest
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return errTestingCenterReportDraftInvalidRequest
	}
	return nil
}

func safeTestingCenterReportDraftRequestID(value string) string {
	if safeRequestID(value) {
		return value
	}
	return ""
}

func testingCenterReportDraftCorrelationID(data any, decoded string) string {
	if safe := safeTestingCenterReportDraftRequestID(decoded); safe != "" {
		return safe
	}
	object, ok := data.(map[string]any)
	if !ok {
		return ""
	}
	raw, ok := object["requestId"].(string)
	if !ok {
		return ""
	}
	return safeTestingCenterReportDraftRequestID(raw)
}
