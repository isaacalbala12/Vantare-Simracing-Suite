package ptt

import (
	"context"
	"errors"
	"sync"
	"testing"
)

func TestControllerPressReleaseAndProcessingLifecycle(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newTestController(t, Config{Enabled: true, PermissionGranted: true, Binding: binding}, port)

	initial := controller.Snapshot()
	if initial.State != StateError || initial.Reason != ReasonDeviceUnavailable || initial.DeviceConnected {
		t.Fatalf("initial Snapshot() = %+v", initial)
	}
	connected := handleTestInput(t, controller, Input{Kind: InputDeviceConnected, Device: deviceFromBinding(binding)})
	if connected.State != StateListening || !connected.DeviceConnected {
		t.Fatalf("connected = %+v", connected)
	}

	capturing := handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
	if capturing.State != StateCapturing || capturing.CaptureID != "capture-1" || port.beginCalls != 1 {
		t.Fatalf("capturing = %+v, port = %+v", capturing, port)
	}
	if port.active.ID != "capture-1" || port.active.Binding != binding {
		t.Fatalf("active capture = %+v", port.active)
	}

	processing := handleTestInput(t, controller, Input{Kind: InputReleased, Binding: binding, Focused: true})
	if processing.State != StateProcessing || processing.CaptureID != "capture-1" || port.finishCalls != 1 || port.active.ID != "" {
		t.Fatalf("processing = %+v, port = %+v", processing, port)
	}
	listening := handleTestInput(t, controller, Input{Kind: InputProcessingComplete, CaptureID: "capture-1"})
	if listening.State != StateListening || listening.CaptureID != "" {
		t.Fatalf("listening = %+v", listening)
	}
}

func TestControllerDoublePressAndReleaseApplyOnce(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	for range 2 {
		handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
	}
	for range 2 {
		handleTestInput(t, controller, Input{Kind: InputReleased, Binding: binding, Focused: true})
	}
	if port.beginCalls != 1 || port.finishCalls != 1 || port.cancelCalls != 0 {
		t.Fatalf("port calls begin=%d finish=%d cancel=%d", port.beginCalls, port.finishCalls, port.cancelCalls)
	}
}

func TestControllerOnlyMatchingBindingCanOwnCapture(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	other := binding
	other.Control = "button-2"

	ignored := handleTestInput(t, controller, Input{Kind: InputPressed, Binding: other, Focused: true})
	if ignored.State != StateListening || port.beginCalls != 0 {
		t.Fatalf("other binding captured: snapshot=%+v port=%+v", ignored, port)
	}
	handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
	handleTestInput(t, controller, Input{Kind: InputReleased, Binding: other, Focused: true})
	if controller.Snapshot().State != StateCapturing || port.finishCalls != 0 {
		t.Fatalf("other binding released active capture: %+v", controller.Snapshot())
	}
}

func TestControllerLocalBindingRequiresFocusButGlobalDoesNot(t *testing.T) {
	for _, test := range []struct {
		name    string
		scope   BindingScope
		focused bool
		want    State
	}{
		{name: "local unfocused", scope: ScopeLocal, focused: false, want: StateListening},
		{name: "local focused", scope: ScopeLocal, focused: true, want: StateCapturing},
		{name: "global unfocused", scope: ScopeGlobal, focused: false, want: StateCapturing},
	} {
		t.Run(test.name, func(t *testing.T) {
			binding := testBinding()
			binding.Scope = test.scope
			port := &fakeCapturePort{}
			controller := newConnectedController(t, binding, port)
			got := handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: test.focused})
			if got.State != test.want {
				t.Fatalf("Handle() = %+v, want state %q", got, test.want)
			}
		})
	}
}

func TestControllerPermissionAndEnabledFailClosed(t *testing.T) {
	for _, config := range []Config{
		{Enabled: false, PermissionGranted: true, Binding: testBinding()},
		{Enabled: true, PermissionGranted: false, Binding: testBinding()},
	} {
		port := &fakeCapturePort{}
		controller := newTestController(t, config, port)
		handleTestInput(t, controller, Input{Kind: InputDeviceConnected, Device: deviceFromBinding(config.Binding)})
		got := handleTestInput(t, controller, Input{Kind: InputPressed, Binding: config.Binding, Focused: true})
		if got.State != StateDisabled || port.beginCalls != 0 {
			t.Fatalf("disabled controller captured: %+v port=%+v", got, port)
		}
	}
}

func TestControllerCancelsCaptureOnFocusLossRemovalAndUserCancel(t *testing.T) {
	tests := []struct {
		name   string
		input  func(Binding) Input
		reason Reason
	}{
		{name: "focus loss", input: func(Binding) Input { return Input{Kind: InputFocusLost} }, reason: ReasonFocusLost},
		{name: "device removal", input: func(binding Binding) Input {
			return Input{Kind: InputDeviceDisconnected, Device: deviceFromBinding(binding)}
		}, reason: ReasonDeviceRemoved},
		{name: "user cancel", input: func(Binding) Input { return Input{Kind: InputCancel} }, reason: ReasonUserCancelled},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			binding := testBinding()
			binding.Scope = ScopeLocal
			port := &fakeCapturePort{}
			controller := newConnectedController(t, binding, port)
			handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
			got := handleTestInput(t, controller, test.input(binding))
			if got.State != StateCancelled || got.Reason != test.reason || got.CaptureID != "" {
				t.Fatalf("cancelled snapshot = %+v", got)
			}
			if port.cancelCalls != 1 || port.lastReason != test.reason || port.active.ID != "" {
				t.Fatalf("port after cancellation = %+v", port)
			}
		})
	}
}

func TestControllerCancelsProcessingOnFocusLossRemovalAndUserCancel(t *testing.T) {
	tests := []struct {
		name   string
		input  func(Binding) Input
		reason Reason
	}{
		{name: "focus loss", input: func(Binding) Input { return Input{Kind: InputFocusLost} }, reason: ReasonFocusLost},
		{name: "device removal", input: func(binding Binding) Input {
			return Input{Kind: InputDeviceDisconnected, Device: deviceFromBinding(binding)}
		}, reason: ReasonDeviceRemoved},
		{name: "user cancel", input: func(Binding) Input { return Input{Kind: InputCancel} }, reason: ReasonUserCancelled},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			binding := testBinding()
			binding.Scope = ScopeLocal
			port := &fakeCapturePort{}
			controller := newConnectedController(t, binding, port)
			handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
			handleTestInput(t, controller, Input{Kind: InputReleased, Binding: binding, Focused: true})

			got := handleTestInput(t, controller, test.input(binding))
			if got.State != StateCancelled || got.Reason != test.reason || got.CaptureID != "" {
				t.Fatalf("cancelled processing snapshot = %+v", got)
			}
			if port.cancelCalls != 1 || port.lastReason != test.reason || port.processing.ID != "" {
				t.Fatalf("port after processing cancellation = %+v", port)
			}
		})
	}
}

func TestControllerHotplugRecoversWithoutStartingCapture(t *testing.T) {
	binding := testBinding()
	controller := newConnectedController(t, binding, &fakeCapturePort{})
	removed := handleTestInput(t, controller, Input{Kind: InputDeviceDisconnected, Device: deviceFromBinding(binding)})
	if removed.State != StateError || removed.Reason != ReasonDeviceRemoved || removed.DeviceConnected {
		t.Fatalf("removed = %+v", removed)
	}
	reconnected := handleTestInput(t, controller, Input{Kind: InputDeviceConnected, Device: deviceFromBinding(binding)})
	if reconnected.State != StateListening || reconnected.Reason != ReasonNone || !reconnected.DeviceConnected {
		t.Fatalf("reconnected = %+v", reconnected)
	}
}

func TestControllerConnectionEventDoesNotEraseProcessing(t *testing.T) {
	binding := testBinding()
	controller := newConnectedController(t, binding, &fakeCapturePort{})
	handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
	processing := handleTestInput(t, controller, Input{Kind: InputReleased, Binding: binding})
	got := handleTestInput(t, controller, Input{Kind: InputDeviceConnected, Device: deviceFromBinding(binding)})
	if got.State != StateProcessing || got.CaptureID != processing.CaptureID {
		t.Fatalf("duplicate connection changed processing: before=%+v after=%+v", processing, got)
	}
}

func TestControllerConfigureRevokesActiveCaptureImmediately(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
	got, err := controller.Configure(context.Background(), Config{Enabled: false, PermissionGranted: true, Binding: binding})
	if err != nil {
		t.Fatalf("Configure() error = %v", err)
	}
	if got.State != StateDisabled || got.Reason != ReasonDisabled || port.cancelCalls != 1 || port.lastReason != ReasonConfiguration {
		t.Fatalf("configured snapshot=%+v port=%+v", got, port)
	}
}

func TestControllerShutdownIsIdempotentAndRejectsInput(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
	first, err := controller.Shutdown(context.Background())
	if err != nil || first.State != StateDisabled || first.Reason != ReasonShutdown || port.cancelCalls != 1 {
		t.Fatalf("first Shutdown() snapshot=%+v error=%v port=%+v", first, err, port)
	}
	second, err := controller.Shutdown(context.Background())
	if err != nil || second != first || port.cancelCalls != 1 {
		t.Fatalf("second Shutdown() snapshot=%+v error=%v port=%+v", second, err, port)
	}
	if _, err := controller.Handle(context.Background(), Input{Kind: InputDeviceConnected, Device: deviceFromBinding(binding)}); !errors.Is(err, ErrClosed) {
		t.Fatalf("Handle() after shutdown error = %v", err)
	}
}

func TestControllerPortErrorsFailClosed(t *testing.T) {
	binding := testBinding()
	t.Run("begin", func(t *testing.T) {
		port := &fakeCapturePort{beginErr: errors.New("begin failed")}
		controller := newConnectedController(t, binding, port)
		got := handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
		if got.State != StateError || got.Reason != ReasonPortError || got.CaptureID != "" {
			t.Fatalf("begin error snapshot = %+v", got)
		}
	})
	t.Run("finish", func(t *testing.T) {
		port := &fakeCapturePort{finishErr: errors.New("finish failed")}
		controller := newConnectedController(t, binding, port)
		handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
		got, err := controller.Handle(context.Background(), Input{Kind: InputReleased, Binding: binding})
		if err == nil || got.State != StateError || got.Reason != ReasonPortError || got.CaptureID != "" || port.cancelCalls != 1 {
			t.Fatalf("finish error snapshot=%+v error=%v port=%+v", got, err, port)
		}
	})
}

func TestControllerFinishAndCancelFailureRetainsOwnership(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{finishErr: errors.New("finish failed"), cancelErr: errors.New("cancel failed")}
	controller := newConnectedController(t, binding, port)
	handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})

	got, err := controller.Handle(context.Background(), Input{Kind: InputReleased, Binding: binding})
	if err == nil || got.State != StateError || got.Reason != ReasonPortError || got.CaptureID == "" {
		t.Fatalf("finish/cancel failure snapshot=%+v error=%v", got, err)
	}
	if port.active.ID != got.CaptureID {
		t.Fatalf("finish/cancel failure lost active ownership: snapshot=%+v port=%+v", got, port)
	}
}

func TestControllerCancelFailureRetainsOwnershipUntilShutdownRetries(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{cancelErr: errors.New("cancel failed")}
	controller := newConnectedController(t, binding, port)
	handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
	processing := handleTestInput(t, controller, Input{Kind: InputReleased, Binding: binding})

	failed, err := controller.Handle(context.Background(), Input{Kind: InputCancel})
	if err == nil || failed.State != StateError || failed.Reason != ReasonPortError || failed.CaptureID != processing.CaptureID {
		t.Fatalf("failed cancellation snapshot=%+v error=%v", failed, err)
	}
	if port.processing.ID != processing.CaptureID {
		t.Fatalf("failed cancellation lost port ownership: %+v", port)
	}

	port.mu.Lock()
	port.cancelErr = nil
	port.mu.Unlock()
	shutdown, err := controller.Shutdown(context.Background())
	if err != nil || shutdown.State != StateDisabled || shutdown.CaptureID != "" || port.processing.ID != "" {
		t.Fatalf("shutdown retry snapshot=%+v error=%v port=%+v", shutdown, err, port)
	}
}

func TestControllerTenThousandCaptureCycles(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	for index := 1; index <= 10_000; index++ {
		handleTestInput(t, controller, Input{Kind: InputPressed, Binding: binding, Focused: true})
		processing := handleTestInput(t, controller, Input{Kind: InputReleased, Binding: binding})
		handleTestInput(t, controller, Input{Kind: InputProcessingComplete, CaptureID: processing.CaptureID})
	}
	got := controller.Snapshot()
	if got.State != StateListening || got.CaptureID != "" || port.beginCalls != 10_000 || port.finishCalls != 10_000 {
		t.Fatalf("after soak snapshot=%+v port=%+v", got, port)
	}
}

func TestControllerConcurrentDuplicateEventsKeepSingleOwner(t *testing.T) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller := newConnectedController(t, binding, port)
	var group sync.WaitGroup
	for range 64 {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := controller.Handle(context.Background(), Input{Kind: InputPressed, Binding: binding, Focused: true}); err != nil {
				t.Errorf("Handle(pressed) error = %v", err)
			}
		}()
	}
	group.Wait()
	for range 64 {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := controller.Handle(context.Background(), Input{Kind: InputReleased, Binding: binding}); err != nil {
				t.Errorf("Handle(released) error = %v", err)
			}
		}()
	}
	group.Wait()
	if port.beginCalls != 1 || port.finishCalls != 1 || port.cancelCalls != 0 {
		t.Fatalf("port calls begin=%d finish=%d cancel=%d", port.beginCalls, port.finishCalls, port.cancelCalls)
	}
}

func TestNewControllerRejectsInvalidConfiguration(t *testing.T) {
	if _, err := NewController(Config{}, &fakeCapturePort{}); !errors.Is(err, ErrInvalidBinding) {
		t.Fatalf("NewController(invalid binding) error = %v", err)
	}
	if _, err := NewController(Config{Binding: testBinding()}, nil); !errors.Is(err, ErrInvalidPort) {
		t.Fatalf("NewController(nil port) error = %v", err)
	}
}

type fakeCapturePort struct {
	mu           sync.Mutex
	active       Capture
	processing   Capture
	beginCalls   int
	finishCalls  int
	cancelCalls  int
	beginErr     error
	finishErr    error
	cancelErr    error
	lastReason   Reason
	beginSignal  chan struct{}
	finishSignal chan struct{}
}

func (port *fakeCapturePort) Begin(_ context.Context, capture Capture) error {
	port.mu.Lock()
	defer port.mu.Unlock()
	port.beginCalls++
	if port.beginErr != nil {
		return port.beginErr
	}
	if port.active.ID != "" {
		return errors.New("fake port already owns a capture")
	}
	port.active = capture
	if port.beginSignal != nil {
		select {
		case port.beginSignal <- struct{}{}:
		default:
		}
	}
	return nil
}

func (port *fakeCapturePort) Finish(_ context.Context, capture Capture) error {
	port.mu.Lock()
	defer port.mu.Unlock()
	port.finishCalls++
	if port.finishErr != nil {
		return port.finishErr
	}
	if port.active != capture {
		return errors.New("fake port finished a different capture")
	}
	port.active = Capture{}
	port.processing = capture
	if port.finishSignal != nil {
		select {
		case port.finishSignal <- struct{}{}:
		default:
		}
	}
	return nil
}

func (port *fakeCapturePort) Cancel(_ context.Context, capture Capture, reason Reason) error {
	port.mu.Lock()
	defer port.mu.Unlock()
	port.cancelCalls++
	port.lastReason = reason
	if port.cancelErr != nil {
		return port.cancelErr
	}
	if port.active != capture && port.processing != capture {
		return errors.New("fake port cancelled a different capture")
	}
	port.active = Capture{}
	port.processing = Capture{}
	return nil
}

func newTestController(t *testing.T, config Config, port CapturePort) *Controller {
	t.Helper()
	controller, err := NewController(config, port)
	if err != nil {
		t.Fatalf("NewController() error = %v", err)
	}
	return controller
}

func newConnectedController(t *testing.T, binding Binding, port CapturePort) *Controller {
	t.Helper()
	controller := newTestController(t, Config{Enabled: true, PermissionGranted: true, Binding: binding}, port)
	handleTestInput(t, controller, Input{Kind: InputDeviceConnected, Device: deviceFromBinding(binding)})
	return controller
}

func handleTestInput(t *testing.T, controller *Controller, input Input) Snapshot {
	t.Helper()
	snapshot, err := controller.Handle(context.Background(), input)
	if err != nil {
		t.Fatalf("Handle(%+v) error = %v", input, err)
	}
	return snapshot
}

func testBinding() Binding {
	return Binding{DeviceKind: DeviceHID, DeviceID: "joy-0", Control: "button-1", Scope: ScopeGlobal}
}

func deviceFromBinding(binding Binding) Device {
	return Device{Kind: binding.DeviceKind, ID: binding.DeviceID}
}

var _ CapturePort = (*fakeCapturePort)(nil)

func BenchmarkControllerCaptureCycle(b *testing.B) {
	binding := testBinding()
	port := &fakeCapturePort{}
	controller, err := NewController(Config{Enabled: true, PermissionGranted: true, Binding: binding}, port)
	if err != nil {
		b.Fatalf("NewController() error = %v", err)
	}
	if _, err := controller.Handle(context.Background(), Input{Kind: InputDeviceConnected, Device: deviceFromBinding(binding)}); err != nil {
		b.Fatalf("Handle(connected) error = %v", err)
	}
	b.ResetTimer()
	for range b.N {
		if _, err := controller.Handle(context.Background(), Input{Kind: InputPressed, Binding: binding, Focused: true}); err != nil {
			b.Fatal(err)
		}
		processing, err := controller.Handle(context.Background(), Input{Kind: InputReleased, Binding: binding})
		if err != nil {
			b.Fatal(err)
		}
		if _, err := controller.Handle(context.Background(), Input{Kind: InputProcessingComplete, CaptureID: processing.CaptureID}); err != nil {
			b.Fatal(err)
		}
	}
}
