package app

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/diagnostics"
	recordingsqlite "github.com/vantare/overlays/v2/internal/telemetry/recording/sqlite"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	DiagnosticsEventPrepare          = "diagnostics:prepare"
	DiagnosticsEventPrepared         = "diagnostics:prepared"
	DiagnosticsEventSessionsList     = "diagnostics:sessions:list"
	DiagnosticsEventSessionsListed   = "diagnostics:sessions:listed"
	DiagnosticsEventSessionInspect   = "diagnostics:sessions:inspect"
	DiagnosticsEventSessionInspected = "diagnostics:sessions:inspected"
	DiagnosticsEventCancel           = "diagnostics:cancel"
	DiagnosticsEventError            = "diagnostics:error"

	MaxDiagnosticsCatalogLimit = diagnostics.MaxCatalogLimit

	defaultDiagnosticsOperationTimeout = 10 * time.Second
	maxConcurrentDiagnosticsOperations = 2
	maxPendingDiagnosticsCancellations = 64
	defaultPendingCancellationTTL      = 30 * time.Second
)

var (
	errDiagnosticsBackendUnavailable = errors.New("diagnostics backend unavailable")
	errDiagnosticsOperationBusy      = errors.New("diagnostics operation limit reached")
)

type DiagnosticsOperation string

const (
	DiagnosticsOperationPrepare DiagnosticsOperation = "prepare"
	DiagnosticsOperationList    DiagnosticsOperation = "sessions.list"
	DiagnosticsOperationInspect DiagnosticsOperation = "sessions.inspect"
)

type DiagnosticsErrorCode string

const (
	DiagnosticsErrorInvalidRequest DiagnosticsErrorCode = "invalid_request"
	DiagnosticsErrorPrepareFailed  DiagnosticsErrorCode = "prepare_failed"
	DiagnosticsErrorListFailed     DiagnosticsErrorCode = "list_failed"
	DiagnosticsErrorInspectFailed  DiagnosticsErrorCode = "inspect_failed"
	DiagnosticsErrorCanceled       DiagnosticsErrorCode = "canceled"
	DiagnosticsErrorStaleHandle    DiagnosticsErrorCode = "stale_handle"
	DiagnosticsErrorUnavailable    DiagnosticsErrorCode = "unavailable"
	DiagnosticsErrorInternal       DiagnosticsErrorCode = "internal"
)

type DiagnosticsPreparedResponse struct {
	RequestID string              `json:"requestId"`
	Prepared  PreparedDiagnostics `json:"prepared"`
}

type DiagnosticsSessionsListedResponse struct {
	RequestID string                 `json:"requestId"`
	Result    diagnostics.ListResult `json:"result"`
}

type DiagnosticsSessionInspectedResponse struct {
	RequestID string              `json:"requestId"`
	Session   diagnostics.Session `json:"session"`
}

type DiagnosticsErrorResponse struct {
	RequestID string               `json:"requestId"`
	Operation DiagnosticsOperation `json:"operation"`
	Code      DiagnosticsErrorCode `json:"code"`
}

type diagnosticsOperationKey struct {
	requestID string
	operation DiagnosticsOperation
}

type diagnosticsCatalog interface {
	List(context.Context, int) (diagnostics.ListResult, error)
	Inspect(context.Context, string) (diagnostics.Session, error)
}

// DiagnosticsBridge owns the only frontend-facing diagnostic contract. The
// catalog root, recording SessionRef and concrete SQLite store stay behind this
// boundary; Wails receives only closed DTOs and opaque, ephemeral handles.
type DiagnosticsBridge struct {
	report     *DiagnosticsService
	catalog    diagnosticsCatalog
	catalogErr error
	emitter    EventEmitter
	timeout    time.Duration

	ctx        context.Context
	cancel     context.CancelFunc
	slots      chan struct{}
	mu         sync.Mutex
	active     map[diagnosticsOperationKey]context.CancelFunc
	pending    map[diagnosticsOperationKey]time.Time
	closed     bool
	waitGroup  sync.WaitGroup
	now        func() time.Time
	pendingTTL time.Duration
}

// NewDiagnosticsBridge receives the absolute canonical root selected by the
// composition layer. It never derives storage from frontend input or cwd. The
// SQLite store is composed only as a read backend; recording is never started.
func NewDiagnosticsBridge(
	parent context.Context,
	sessionsRoot string,
	report *DiagnosticsService,
	emitter EventEmitter,
) *DiagnosticsBridge {
	bridge := newDiagnosticsBridge(parent, report, nil, emitter)
	root, err := prepareDiagnosticsSessionsRoot(sessionsRoot)
	if err != nil {
		bridge.catalogErr = errDiagnosticsBackendUnavailable
		return bridge
	}
	catalog, err := diagnostics.NewCatalog(
		root,
		recordingsqlite.New(recordingsqlite.Options{}),
	)
	if err != nil {
		bridge.catalogErr = errDiagnosticsBackendUnavailable
		return bridge
	}
	if err := validatePreparedDiagnosticsSessionsRoot(root); err != nil {
		bridge.catalogErr = errDiagnosticsBackendUnavailable
		return bridge
	}
	bridge.catalog = catalog
	return bridge
}

func newDiagnosticsBridge(
	parent context.Context,
	report *DiagnosticsService,
	catalog diagnosticsCatalog,
	emitter EventEmitter,
) *DiagnosticsBridge {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	return &DiagnosticsBridge{
		report:     report,
		catalog:    catalog,
		emitter:    emitter,
		timeout:    defaultDiagnosticsOperationTimeout,
		ctx:        ctx,
		cancel:     cancel,
		slots:      make(chan struct{}, maxConcurrentDiagnosticsOperations),
		active:     make(map[diagnosticsOperationKey]context.CancelFunc),
		pending:    make(map[diagnosticsOperationKey]time.Time),
		now:        time.Now,
		pendingTTL: defaultPendingCancellationTTL,
	}
}

// RegisterHandlers replaces the inherited uncorrelated diagnostics:get event.
func (b *DiagnosticsBridge) RegisterHandlers(wailsApp *application.App) {
	if b == nil || wailsApp == nil {
		return
	}
	wailsApp.Event.On(DiagnosticsEventPrepare, func(event *application.CustomEvent) {
		b.HandlePrepare(event.Data)
	})
	wailsApp.Event.On(DiagnosticsEventSessionsList, func(event *application.CustomEvent) {
		b.HandleList(event.Data)
	})
	wailsApp.Event.On(DiagnosticsEventSessionInspect, func(event *application.CustomEvent) {
		b.HandleInspect(event.Data)
	})
	wailsApp.Event.On(DiagnosticsEventCancel, func(event *application.CustomEvent) {
		b.HandleCancel(event.Data)
	})
}

func (b *DiagnosticsBridge) HandlePrepare(data any) {
	if b == nil {
		return
	}
	var request DiagnosticsRequest
	if err := decodeDiagnosticsInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) ||
		b.report == nil {
		b.emitError(safeDiagnosticsRequestID(request.RequestID), DiagnosticsOperationPrepare, ErrInvalidDiagnosticsRequest)
		return
	}
	b.startOperation(DiagnosticsOperationPrepare, request.RequestID, func(ctx context.Context) {
		response, err := b.report.PrepareDiagnosticsRequest(request)
		if err == nil {
			err = ctx.Err()
		}
		if err != nil {
			b.emitError(request.RequestID, DiagnosticsOperationPrepare, err)
			return
		}
		b.emit(DiagnosticsEventPrepared, DiagnosticsPreparedResponse(response))
	})
}

func (b *DiagnosticsBridge) HandleList(data any) {
	if b == nil {
		return
	}
	var request struct {
		RequestID string `json:"requestId"`
		Limit     int    `json:"limit,omitempty"`
	}
	if err := decodeDiagnosticsInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) ||
		request.Limit < 0 || request.Limit > diagnostics.MaxCatalogLimit {
		b.emitError(safeDiagnosticsRequestID(request.RequestID), DiagnosticsOperationList, ErrInvalidDiagnosticsRequest)
		return
	}
	if b.catalog == nil {
		b.emitError(request.RequestID, DiagnosticsOperationList, b.catalogErr)
		return
	}
	b.startOperation(DiagnosticsOperationList, request.RequestID, func(ctx context.Context) {
		result, err := b.catalog.List(ctx, request.Limit)
		if err == nil {
			err = ctx.Err()
		}
		if err != nil {
			b.emitError(request.RequestID, DiagnosticsOperationList, err)
			return
		}
		b.emit(DiagnosticsEventSessionsListed, DiagnosticsSessionsListedResponse{
			RequestID: request.RequestID,
			Result:    result,
		})
	})
}

func (b *DiagnosticsBridge) HandleInspect(data any) {
	if b == nil {
		return
	}
	var request struct {
		RequestID string `json:"requestId"`
		Handle    string `json:"handle"`
	}
	if err := decodeDiagnosticsInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) ||
		!safeDiagnosticsHandle(request.Handle) {
		b.emitError(safeDiagnosticsRequestID(request.RequestID), DiagnosticsOperationInspect, ErrInvalidDiagnosticsRequest)
		return
	}
	if b.catalog == nil {
		b.emitError(request.RequestID, DiagnosticsOperationInspect, b.catalogErr)
		return
	}
	b.startOperation(DiagnosticsOperationInspect, request.RequestID, func(ctx context.Context) {
		session, err := b.catalog.Inspect(ctx, request.Handle)
		if err == nil {
			err = ctx.Err()
		}
		if err != nil {
			b.emitError(request.RequestID, DiagnosticsOperationInspect, err)
			return
		}
		b.emit(DiagnosticsEventSessionInspected, DiagnosticsSessionInspectedResponse{
			RequestID: request.RequestID,
			Session:   session,
		})
	})
}

func (b *DiagnosticsBridge) HandleCancel(data any) {
	if b == nil {
		return
	}
	var request struct {
		RequestID string               `json:"requestId"`
		Operation DiagnosticsOperation `json:"operation"`
	}
	if err := decodeDiagnosticsInput(data, &request); err != nil ||
		!safeRequestID(request.RequestID) ||
		!request.Operation.known() {
		// A malformed cancellation has no valid correlated operation to answer
		// on. Emitting an invented operation would violate the closed frontend
		// contract, so ignore it without affecting any active request.
		return
	}
	key := diagnosticsOperationKey{
		requestID: request.RequestID,
		operation: request.Operation,
	}
	b.mu.Lock()
	b.purgeExpiredCancellationsLocked(b.currentTime())
	cancel := b.active[key]
	if cancel == nil && !b.closed {
		b.rememberPendingCancellationLocked(key)
	}
	b.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// Close cancels every active operation and waits for deterministic cleanup.
func (b *DiagnosticsBridge) Close() {
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
	clear(b.pending)
	b.mu.Unlock()
	b.waitGroup.Wait()
}

func (b *DiagnosticsBridge) startOperation(
	operation DiagnosticsOperation,
	requestID string,
	run func(context.Context),
) {
	if b == nil || run == nil {
		return
	}
	key := diagnosticsOperationKey{requestID: requestID, operation: operation}

	b.mu.Lock()
	now := b.currentTime()
	b.purgeExpiredCancellationsLocked(now)
	if b.closed || b.ctx.Err() != nil {
		b.mu.Unlock()
		b.emitError(requestID, operation, errDiagnosticsBackendUnavailable)
		return
	}
	if _, canceled := b.pending[key]; canceled {
		delete(b.pending, key)
		b.mu.Unlock()
		b.emitError(requestID, operation, context.Canceled)
		return
	}
	if _, exists := b.active[key]; exists {
		b.mu.Unlock()
		b.emitError(requestID, operation, ErrInvalidDiagnosticsRequest)
		return
	}
	select {
	case b.slots <- struct{}{}:
	default:
		b.mu.Unlock()
		b.emitError(requestID, operation, errDiagnosticsOperationBusy)
		return
	}
	timeout := b.timeout
	if timeout <= 0 {
		timeout = defaultDiagnosticsOperationTimeout
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

func (b *DiagnosticsBridge) currentTime() time.Time {
	if b != nil && b.now != nil {
		return b.now()
	}
	return time.Now()
}

func (b *DiagnosticsBridge) rememberPendingCancellationLocked(
	key diagnosticsOperationKey,
) {
	ttl := b.pendingTTL
	if ttl <= 0 {
		ttl = defaultPendingCancellationTTL
	}
	if _, exists := b.pending[key]; !exists &&
		len(b.pending) >= maxPendingDiagnosticsCancellations {
		return
	}
	b.pending[key] = b.currentTime().Add(ttl)
}

func (b *DiagnosticsBridge) purgeExpiredCancellationsLocked(now time.Time) {
	for key, expiresAt := range b.pending {
		if !now.Before(expiresAt) {
			delete(b.pending, key)
		}
	}
}

func (operation DiagnosticsOperation) known() bool {
	switch operation {
	case DiagnosticsOperationPrepare, DiagnosticsOperationList,
		DiagnosticsOperationInspect:
		return true
	default:
		return false
	}
}

func (b *DiagnosticsBridge) emit(name string, payload any) {
	if b != nil && b.emitter != nil {
		b.emitter.Emit(name, payload)
	}
}

func (b *DiagnosticsBridge) emitError(
	requestID string,
	operation DiagnosticsOperation,
	err error,
) {
	b.emit(DiagnosticsEventError, DiagnosticsErrorResponse{
		RequestID: requestID,
		Operation: operation,
		Code:      closedDiagnosticsErrorCode(operation, err),
	})
}

func closedDiagnosticsErrorCode(
	operation DiagnosticsOperation,
	err error,
) DiagnosticsErrorCode {
	switch {
	case errors.Is(err, ErrInvalidDiagnosticsRequest):
		return DiagnosticsErrorInvalidRequest
	case errors.Is(err, diagnostics.ErrStaleCatalogHandle):
		return DiagnosticsErrorStaleHandle
	case errors.Is(err, context.Canceled):
		return DiagnosticsErrorCanceled
	case errors.Is(err, context.DeadlineExceeded):
		return DiagnosticsErrorUnavailable
	case errors.Is(err, errDiagnosticsBackendUnavailable):
		return DiagnosticsErrorUnavailable
	case errors.Is(err, errDiagnosticsOperationBusy):
		return DiagnosticsErrorUnavailable
	}
	switch operation {
	case DiagnosticsOperationPrepare:
		return DiagnosticsErrorPrepareFailed
	case DiagnosticsOperationList:
		return DiagnosticsErrorListFailed
	case DiagnosticsOperationInspect:
		return DiagnosticsErrorInspectFailed
	default:
		return DiagnosticsErrorInternal
	}
}

func decodeDiagnosticsInput(data any, destination any) error {
	if data == nil || destination == nil {
		return ErrInvalidDiagnosticsRequest
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return ErrInvalidDiagnosticsRequest
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return ErrInvalidDiagnosticsRequest
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return ErrInvalidDiagnosticsRequest
	}
	return nil
}

func safeDiagnosticsRequestID(value string) string {
	if safeRequestID(value) {
		return value
	}
	return ""
}

func safeDiagnosticsHandle(value string) bool {
	const prefix = "diag-"
	const entropyHexLength = 32
	if len(value) != len(prefix)+entropyHexLength ||
		value[:len(prefix)] != prefix {
		return false
	}
	_, err := hex.DecodeString(value[len(prefix):])
	return err == nil
}

func prepareDiagnosticsSessionsRoot(sessionsRoot string) (string, error) {
	if sessionsRoot == "" || !filepath.IsAbs(sessionsRoot) {
		return "", errDiagnosticsBackendUnavailable
	}
	root := filepath.Clean(sessionsRoot)
	if err := validateDiagnosticsPathChain(root, true); err != nil {
		return "", errDiagnosticsBackendUnavailable
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", err
	}
	if err := validateDiagnosticsPathChain(root, false); err != nil {
		return "", errDiagnosticsBackendUnavailable
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil || !sameDiagnosticsPath(root, resolved) {
		return "", errDiagnosticsBackendUnavailable
	}
	if err := os.Chmod(root, 0o700); err != nil {
		return "", err
	}
	if err := validatePreparedDiagnosticsSessionsRoot(root); err != nil {
		return "", err
	}
	return root, nil
}

func validatePreparedDiagnosticsSessionsRoot(root string) error {
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || diagnosticsPathComponentLinked(info) {
		return errDiagnosticsBackendUnavailable
	}
	if err := validateDiagnosticsPathChain(root, false); err != nil {
		return errDiagnosticsBackendUnavailable
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil || !sameDiagnosticsPath(root, resolved) {
		return errDiagnosticsBackendUnavailable
	}
	return nil
}

func validateDiagnosticsPathChain(path string, allowMissing bool) error {
	path = filepath.Clean(path)
	volume := filepath.VolumeName(path)
	remaining := strings.TrimPrefix(path, volume)
	remaining = strings.TrimLeft(remaining, `/\`)
	current := volume + string(os.PathSeparator)
	if volume == "" {
		current = string(os.PathSeparator)
	}
	for _, component := range strings.FieldsFunc(remaining, func(r rune) bool {
		return r == '/' || r == '\\'
	}) {
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) && allowMissing {
			continue
		}
		if err != nil {
			return errDiagnosticsBackendUnavailable
		}
		if diagnosticsPathComponentLinked(info) || !info.IsDir() {
			return errDiagnosticsBackendUnavailable
		}
	}
	return nil
}

func sameDiagnosticsPath(left, right string) bool {
	left = filepath.Clean(left)
	right = filepath.Clean(right)
	if os.PathSeparator == '\\' {
		return strings.EqualFold(left, right)
	}
	return left == right
}
