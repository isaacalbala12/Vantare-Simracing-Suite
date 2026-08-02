package ptt

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestPollerTranslatesDeviceAndButtonTransitions(t *testing.T) {
	binding := testBinding()
	reader := &scriptedReader{samples: []DeviceSample{
		{Connected: false, Focused: true},
		{Connected: true, Focused: true},
		{Connected: true, Pressed: true, Focused: true},
		{Connected: true, Focused: true},
		{Connected: false, Focused: true},
	}}
	handler := &recordingHandler{}
	poller, err := NewPoller(binding, reader, handler, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	for range reader.samples {
		if err := poller.Poll(context.Background()); err != nil {
			t.Fatalf("Poll() error = %v", err)
		}
	}
	want := []InputKind{InputDeviceDisconnected, InputDeviceConnected, InputPressed, InputReleased, InputDeviceDisconnected}
	if got := handler.kinds(); !equalInputKinds(got, want) {
		t.Fatalf("input kinds = %v, want %v", got, want)
	}
}

func TestPollerInitialUnpressedSampleDoesNotEmitPhantomRelease(t *testing.T) {
	binding := testBinding()
	reader := &scriptedReader{samples: []DeviceSample{{Connected: true, Focused: true}}}
	handler := &recordingHandler{}
	poller, err := NewPoller(binding, reader, handler, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err != nil {
		t.Fatalf("Poll() error = %v", err)
	}
	want := []InputKind{InputDeviceConnected}
	if got := handler.kinds(); !equalInputKinds(got, want) {
		t.Fatalf("input kinds = %v, want %v", got, want)
	}
}

func TestPollerReportsLocalFocusLoss(t *testing.T) {
	binding := testBinding()
	binding.Scope = ScopeLocal
	reader := &scriptedReader{samples: []DeviceSample{
		{Connected: true, Pressed: true, Focused: true},
		{Connected: true, Pressed: true, Focused: false},
	}}
	handler := &recordingHandler{}
	poller, err := NewPoller(binding, reader, handler, 0)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	for range reader.samples {
		if err := poller.Poll(context.Background()); err != nil {
			t.Fatalf("Poll() error = %v", err)
		}
	}
	want := []InputKind{InputDeviceConnected, InputPressed, InputFocusLost}
	if got := handler.kinds(); !equalInputKinds(got, want) {
		t.Fatalf("input kinds = %v, want %v", got, want)
	}
}

func TestPollerReadErrorIsVisibleAndRecoveryReconnects(t *testing.T) {
	binding := testBinding()
	reader := &scriptedReader{errs: []error{errors.New("reader failed")}, samples: []DeviceSample{{Connected: true, Focused: true}}}
	handler := &recordingHandler{}
	poller, err := NewPoller(binding, reader, handler, 0)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err == nil || poller.LastError() == nil {
		t.Fatalf("first Poll() error=%v LastError()=%v", err, poller.LastError())
	}
	if err := poller.Poll(context.Background()); err != nil || poller.LastError() != nil {
		t.Fatalf("recovery Poll() error=%v LastError()=%v", err, poller.LastError())
	}
	want := []InputKind{InputDeviceError, InputDeviceConnected}
	if got := handler.kinds(); !equalInputKinds(got, want) {
		t.Fatalf("input kinds = %v, want %v", got, want)
	}
}

func TestPollerRetriesReleaseAfterHandlerFailure(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	handler := &failOnceHandler{kind: InputReleased, delegate: controller}
	reader := &scriptedReader{samples: []DeviceSample{
		{Connected: true, Pressed: true, Focused: true},
		{Connected: true, Pressed: false, Focused: true},
		{Connected: true, Pressed: false, Focused: true},
	}}
	poller, err := NewPoller(binding, reader, handler, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err != nil {
		t.Fatalf("initial Poll() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err == nil || port.active.ID == "" {
		t.Fatalf("failed release error=%v active=%+v", err, port.active)
	}
	if err := poller.Poll(context.Background()); err != nil {
		t.Fatalf("release retry Poll() error = %v", err)
	}
	if port.active.ID != "" || port.finishCalls != 1 || controller.Snapshot().State != StateProcessing {
		t.Fatalf("release retry did not finish capture: snapshot=%+v port=%+v", controller.Snapshot(), port)
	}
}

func TestPollerRetriesDisconnectAfterHandlerFailure(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	handler := &failOnceHandler{kind: InputDeviceDisconnected, delegate: controller}
	reader := &scriptedReader{samples: []DeviceSample{
		{Connected: true, Pressed: true, Focused: true},
		{Connected: false, Focused: true},
		{Connected: false, Focused: true},
	}}
	poller, err := NewPoller(binding, reader, handler, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err != nil {
		t.Fatalf("initial Poll() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err == nil || port.active.ID == "" {
		t.Fatalf("failed disconnect error=%v active=%+v", err, port.active)
	}
	if err := poller.Poll(context.Background()); err != nil {
		t.Fatalf("disconnect retry Poll() error = %v", err)
	}
	if port.active.ID != "" || port.cancelCalls != 1 || controller.Snapshot().Reason != ReasonDeviceRemoved {
		t.Fatalf("disconnect retry did not cancel capture: snapshot=%+v port=%+v", controller.Snapshot(), port)
	}
}

func TestPollerRetriesDeviceErrorAfterHandlerFailure(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	handler := &failOnceHandler{kind: InputDeviceError, delegate: controller}
	readerErr := errors.New("reader failed")
	reader := &scriptedReader{
		errs:     []error{nil, readerErr, readerErr},
		fallback: DeviceSample{Connected: true, Pressed: true, Focused: true},
	}
	poller, err := NewPoller(binding, reader, handler, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err != nil {
		t.Fatalf("initial Poll() error = %v", err)
	}
	if err := poller.Poll(context.Background()); err == nil || port.active.ID == "" {
		t.Fatalf("failed device error dispatch error=%v active=%+v", err, port.active)
	}
	if err := poller.Poll(context.Background()); !errors.Is(err, readerErr) {
		t.Fatalf("device error retry Poll() error = %v", err)
	}
	if port.active.ID != "" || port.cancelCalls != 1 || controller.Snapshot().Reason != ReasonInputError {
		t.Fatalf("device error retry did not cancel capture: snapshot=%+v port=%+v", controller.Snapshot(), port)
	}
}

func TestPollerRunCancelsAndCanRestart(t *testing.T) {
	binding := testBinding()
	reader := &scriptedReader{fallback: DeviceSample{Connected: true, Focused: true}}
	handler := &recordingHandler{}
	poller, err := NewPoller(binding, reader, handler, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	for range 2 {
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan error, 1)
		go func() { done <- poller.Run(ctx) }()
		reader.waitForRead(t)
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("Run() error = %v", err)
			}
		case <-time.After(time.Second):
			t.Fatal("Run() did not stop after cancellation")
		}
	}
}

func TestPollerRunCancellationReleasesCapturingOwnership(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{beginSignal: make(chan struct{}, 1)}
	controller := newConnectedController(t, binding, port)
	reader := &scriptedReader{fallback: DeviceSample{Connected: true, Pressed: true, Focused: true}}
	poller, err := NewPoller(binding, reader, controller, time.Hour)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- poller.Run(ctx) }()
	select {
	case <-port.beginSignal:
	case <-time.After(time.Second):
		t.Fatal("capture did not start")
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() did not stop")
	}
	if port.active.ID != "" || port.cancelCalls != 1 || controller.Snapshot().Reason != ReasonUserCancelled {
		t.Fatalf("Run cancellation did not release capture: snapshot=%+v port=%+v", controller.Snapshot(), port)
	}
}

func TestPollerRunCancellationReleasesProcessingOwnership(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{finishSignal: make(chan struct{}, 1)}
	controller := newConnectedController(t, binding, port)
	reader := &scriptedReader{
		samples: []DeviceSample{
			{Connected: true, Pressed: true, Focused: true},
			{Connected: true, Pressed: false, Focused: true},
		},
		fallback: DeviceSample{Connected: true, Pressed: false, Focused: true},
	}
	poller, err := NewPoller(binding, reader, controller, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- poller.Run(ctx) }()
	select {
	case <-port.finishSignal:
	case <-time.After(time.Second):
		t.Fatal("capture did not enter processing")
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() did not stop")
	}
	if port.processing.ID != "" || port.cancelCalls != 1 || controller.Snapshot().Reason != ReasonUserCancelled {
		t.Fatalf("Run cancellation did not release processing: snapshot=%+v port=%+v", controller.Snapshot(), port)
	}
}

func TestPollerRunCancellationFailureIsVisibleAndAllowsExternalRetry(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{cancelErr: errors.New("cancel failed"), beginSignal: make(chan struct{}, 1)}
	controller := newConnectedController(t, binding, port)
	reader := &scriptedReader{fallback: DeviceSample{Connected: true, Pressed: true, Focused: true}}
	poller, err := NewPoller(binding, reader, controller, time.Hour)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- poller.Run(ctx) }()
	select {
	case <-port.beginSignal:
	case <-time.After(time.Second):
		t.Fatal("capture did not start")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("Run() hid cancellation failure")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run() did not return bounded cancellation failure")
	}
	failed := controller.Snapshot()
	if failed.State != StateError || failed.CaptureID == "" || port.active.ID != failed.CaptureID {
		t.Fatalf("failed cancellation lost ownership: snapshot=%+v port=%+v", failed, port)
	}
	port.mu.Lock()
	port.cancelErr = nil
	port.mu.Unlock()
	if _, err := controller.Shutdown(context.Background()); err != nil {
		t.Fatalf("external Shutdown() retry error = %v", err)
	}
	if port.active.ID != "" || controller.Snapshot().CaptureID != "" {
		t.Fatalf("external retry did not release ownership: snapshot=%+v port=%+v", controller.Snapshot(), port)
	}
}

func TestPollerCancellationDuringReadStillReleasesOwnership(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{beginSignal: make(chan struct{}, 1)}
	controller := newConnectedController(t, binding, port)
	reader := &blockingAfterFirstReader{blocked: make(chan struct{})}
	poller, err := NewPoller(binding, reader, controller, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- poller.Run(ctx) }()
	select {
	case <-port.beginSignal:
	case <-time.After(time.Second):
		t.Fatal("capture did not start")
	}
	select {
	case <-reader.blocked:
	case <-time.After(time.Second):
		t.Fatal("reader did not enter cancellable read")
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() did not stop")
	}
	if port.active.ID != "" || port.cancelCalls != 1 {
		t.Fatalf("cancellation during read did not release capture: snapshot=%+v port=%+v", controller.Snapshot(), port)
	}
}

func TestPollerRejectsConcurrentRun(t *testing.T) {
	binding := testBinding()
	reader := &scriptedReader{fallback: DeviceSample{Connected: true, Focused: true}}
	handler := &recordingHandler{}
	poller, err := NewPoller(binding, reader, handler, time.Millisecond)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- poller.Run(ctx) }()
	reader.waitForRead(t)
	if err := poller.Run(context.Background()); !errors.Is(err, ErrPollerRunning) {
		t.Fatalf("concurrent Run() error = %v", err)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("first Run() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("first Run() did not stop")
	}
}

func TestPollerOneThousandStartStopCyclesJoin(t *testing.T) {
	binding := testBinding()
	reader := &scriptedReader{fallback: DeviceSample{Connected: true, Focused: true}}
	handler := &recordingHandler{}
	poller, err := NewPoller(binding, reader, handler, time.Hour)
	if err != nil {
		t.Fatalf("NewPoller() error = %v", err)
	}
	for cycle := 0; cycle < 1_000; cycle++ {
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan error, 1)
		go func() { done <- poller.Run(ctx) }()
		reader.waitForRead(t)
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("Run() cycle %d error = %v", cycle, err)
			}
		case <-time.After(time.Second):
			t.Fatalf("Run() cycle %d did not join", cycle)
		}
	}
}

type scriptedReader struct {
	mu       sync.Mutex
	samples  []DeviceSample
	errs     []error
	index    int
	fallback DeviceSample
	reads    chan struct{}
}

type blockingAfterFirstReader struct {
	mu      sync.Mutex
	reads   int
	blocked chan struct{}
}

func (reader *blockingAfterFirstReader) Read(ctx context.Context, _ Binding) (DeviceSample, error) {
	reader.mu.Lock()
	reader.reads++
	read := reader.reads
	reader.mu.Unlock()
	if read == 1 {
		return DeviceSample{Connected: true, Pressed: true, Focused: true}, nil
	}
	if read == 2 {
		close(reader.blocked)
	}
	<-ctx.Done()
	return DeviceSample{}, ctx.Err()
}

func (reader *scriptedReader) Read(context.Context, Binding) (DeviceSample, error) {
	reader.mu.Lock()
	defer reader.mu.Unlock()
	if reader.reads == nil {
		reader.reads = make(chan struct{}, 64)
	}
	select {
	case reader.reads <- struct{}{}:
	default:
	}
	if reader.index < len(reader.errs) && reader.errs[reader.index] != nil {
		err := reader.errs[reader.index]
		reader.index++
		return DeviceSample{}, err
	}
	sampleIndex := reader.index - len(reader.errs)
	reader.index++
	if sampleIndex >= 0 && sampleIndex < len(reader.samples) {
		return reader.samples[sampleIndex], nil
	}
	return reader.fallback, nil
}

func (reader *scriptedReader) waitForRead(t *testing.T) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		reader.mu.Lock()
		reads := reader.reads
		reader.mu.Unlock()
		if reads != nil {
			select {
			case <-reads:
				return
			case <-time.After(time.Until(deadline)):
				t.Fatal("reader was not called")
			}
		}
		if time.Now().After(deadline) {
			t.Fatal("reader was not initialized")
		}
		time.Sleep(time.Millisecond)
	}
}

type recordingHandler struct {
	mu     sync.Mutex
	inputs []Input
}

type failOnceHandler struct {
	mu       sync.Mutex
	kind     InputKind
	failed   bool
	delegate InputHandler
}

func (handler *failOnceHandler) Handle(ctx context.Context, input Input) (Snapshot, error) {
	handler.mu.Lock()
	if input.Kind == handler.kind && !handler.failed {
		handler.failed = true
		handler.mu.Unlock()
		return Snapshot{}, errors.New("injected handler failure")
	}
	handler.mu.Unlock()
	return handler.delegate.Handle(ctx, input)
}

func (handler *recordingHandler) Handle(_ context.Context, input Input) (Snapshot, error) {
	handler.mu.Lock()
	handler.inputs = append(handler.inputs, input)
	handler.mu.Unlock()
	return Snapshot{}, nil
}

func (handler *recordingHandler) kinds() []InputKind {
	handler.mu.Lock()
	defer handler.mu.Unlock()
	kinds := make([]InputKind, len(handler.inputs))
	for index, input := range handler.inputs {
		kinds[index] = input.Kind
	}
	return kinds
}

func equalInputKinds(got, want []InputKind) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}

var _ Reader = (*scriptedReader)(nil)
var _ Reader = (*blockingAfterFirstReader)(nil)
var _ InputHandler = (*recordingHandler)(nil)
var _ InputHandler = (*failOnceHandler)(nil)
