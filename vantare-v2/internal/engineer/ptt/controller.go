package ptt

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
)

var (
	ErrInvalidPort  = errors.New("engineer PTT capture port is invalid")
	ErrInvalidInput = errors.New("engineer PTT input is invalid")
	ErrClosed       = errors.New("engineer PTT controller is closed")
)

type State string

const (
	StateDisabled   State = "disabled"
	StateListening  State = "listening"
	StateCapturing  State = "capturing"
	StateProcessing State = "processing"
	StateCancelled  State = "cancelled"
	StateError      State = "error"
)

type Reason string

const (
	ReasonNone              Reason = ""
	ReasonDisabled          Reason = "disabled"
	ReasonPermissionDenied  Reason = "permission_denied"
	ReasonDeviceUnavailable Reason = "device_unavailable"
	ReasonFocusLost         Reason = "focus_lost"
	ReasonDeviceRemoved     Reason = "device_removed"
	ReasonUserCancelled     Reason = "user_cancelled"
	ReasonConfiguration     Reason = "configuration_changed"
	ReasonPortError         Reason = "port_error"
	ReasonInputError        Reason = "input_error"
	ReasonShutdown          Reason = "shutdown"
)

type Config struct {
	Enabled           bool    `json:"enabled"`
	PermissionGranted bool    `json:"permission_granted"`
	Binding           Binding `json:"binding"`
}

type Device struct {
	Kind DeviceKind `json:"kind"`
	ID   string     `json:"id"`
}

type InputKind string

const (
	InputDeviceConnected    InputKind = "device_connected"
	InputDeviceDisconnected InputKind = "device_disconnected"
	InputPressed            InputKind = "pressed"
	InputReleased           InputKind = "released"
	InputFocusLost          InputKind = "focus_lost"
	InputCancel             InputKind = "cancel"
	InputProcessingComplete InputKind = "processing_complete"
	InputDeviceError        InputKind = "device_error"
)

type Input struct {
	Kind      InputKind
	Binding   Binding
	Device    Device
	Focused   bool
	CaptureID string
}

type Capture struct {
	ID      string  `json:"id"`
	Binding Binding `json:"binding"`
}

type CapturePort interface {
	Begin(context.Context, Capture) error
	Finish(context.Context, Capture) error
	Cancel(context.Context, Capture, Reason) error
}

type Snapshot struct {
	SchemaVersion   string  `json:"schema_version"`
	State           State   `json:"state"`
	Reason          Reason  `json:"reason,omitempty"`
	Binding         Binding `json:"binding"`
	DeviceConnected bool    `json:"device_connected"`
	CaptureID       string  `json:"capture_id,omitempty"`
}

type Controller struct {
	mu              sync.Mutex
	config          Config
	port            CapturePort
	state           State
	reason          Reason
	deviceConnected bool
	active          *Capture
	processing      *Capture
	nextCapture     uint64
	closed          bool
}

func NewController(config Config, port CapturePort) (*Controller, error) {
	if port == nil {
		return nil, ErrInvalidPort
	}
	normalized, err := NormalizeBinding(config.Binding)
	if err != nil {
		return nil, err
	}
	config.Binding = normalized
	controller := &Controller{config: config, port: port}
	controller.applyIdleState()
	return controller, nil
}

func (controller *Controller) Snapshot() Snapshot {
	if controller == nil {
		return Snapshot{SchemaVersion: ContractVersionV1, State: StateError, Reason: ReasonInputError}
	}
	controller.mu.Lock()
	defer controller.mu.Unlock()
	return controller.snapshotLocked()
}

func (controller *Controller) Handle(ctx context.Context, input Input) (Snapshot, error) {
	if controller == nil || ctx == nil {
		return Snapshot{}, ErrInvalidInput
	}
	controller.mu.Lock()
	defer controller.mu.Unlock()
	if controller.closed {
		return controller.snapshotLocked(), ErrClosed
	}
	if err := ctx.Err(); err != nil {
		if cancelErr := controller.cancelLocked(context.Background(), ReasonUserCancelled); cancelErr != nil {
			return controller.snapshotLocked(), cancelErr
		}
		return controller.snapshotLocked(), fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}

	switch input.Kind {
	case InputDeviceConnected:
		device, err := normalizeDevice(input.Device)
		if err != nil {
			return controller.snapshotLocked(), err
		}
		if controller.matchesDevice(device) {
			controller.deviceConnected = true
			if controller.active == nil && controller.processing == nil {
				controller.applyIdleState()
			}
		}
	case InputDeviceDisconnected:
		device, err := normalizeDevice(input.Device)
		if err != nil {
			return controller.snapshotLocked(), err
		}
		if controller.matchesDevice(device) {
			controller.deviceConnected = false
			if controller.active != nil || controller.processing != nil {
				if err := controller.cancelLocked(ctx, ReasonDeviceRemoved); err != nil {
					return controller.snapshotLocked(), err
				}
			} else {
				controller.state = StateError
				controller.reason = ReasonDeviceRemoved
			}
		}
	case InputPressed:
		binding, err := NormalizeBinding(input.Binding)
		if err != nil {
			return controller.snapshotLocked(), err
		}
		controller.pressLocked(ctx, binding, input.Focused)
	case InputReleased:
		binding, err := NormalizeBinding(input.Binding)
		if err != nil {
			return controller.snapshotLocked(), err
		}
		if err := controller.releaseLocked(ctx, binding); err != nil {
			return controller.snapshotLocked(), err
		}
	case InputFocusLost:
		if controller.config.Binding.Scope == ScopeLocal && (controller.active != nil || controller.processing != nil) {
			if err := controller.cancelLocked(ctx, ReasonFocusLost); err != nil {
				return controller.snapshotLocked(), err
			}
		}
	case InputCancel:
		if err := controller.cancelLocked(ctx, ReasonUserCancelled); err != nil {
			return controller.snapshotLocked(), err
		}
	case InputProcessingComplete:
		if input.CaptureID == "" || !validOpaqueToken(input.CaptureID) {
			return controller.snapshotLocked(), ErrInvalidInput
		}
		if controller.state == StateProcessing && controller.processing != nil && controller.processing.ID == input.CaptureID {
			controller.processing = nil
			controller.applyIdleState()
		}
	case InputDeviceError:
		controller.deviceConnected = false
		if controller.active != nil || controller.processing != nil {
			if err := controller.cancelLocked(ctx, ReasonInputError); err != nil {
				return controller.snapshotLocked(), err
			}
		} else {
			controller.state = StateError
			controller.reason = ReasonInputError
		}
	default:
		return controller.snapshotLocked(), ErrInvalidInput
	}
	return controller.snapshotLocked(), nil
}

func (controller *Controller) Configure(ctx context.Context, config Config) (Snapshot, error) {
	if controller == nil || ctx == nil {
		return Snapshot{}, ErrInvalidInput
	}
	normalized, err := NormalizeBinding(config.Binding)
	if err != nil {
		return controller.Snapshot(), err
	}
	config.Binding = normalized
	controller.mu.Lock()
	defer controller.mu.Unlock()
	if controller.closed {
		return controller.snapshotLocked(), ErrClosed
	}
	sameDevice := controller.config.Binding.DeviceKind == config.Binding.DeviceKind && controller.config.Binding.DeviceID == config.Binding.DeviceID
	if controller.active != nil || controller.processing != nil {
		if err := controller.cancelLocked(ctx, ReasonConfiguration); err != nil {
			return controller.snapshotLocked(), err
		}
	}
	controller.config = config
	if !sameDevice {
		controller.deviceConnected = false
	}
	controller.applyIdleState()
	return controller.snapshotLocked(), nil
}

func (controller *Controller) Shutdown(ctx context.Context) (Snapshot, error) {
	if controller == nil || ctx == nil {
		return Snapshot{}, ErrInvalidInput
	}
	controller.mu.Lock()
	defer controller.mu.Unlock()
	if controller.closed {
		return controller.snapshotLocked(), nil
	}
	if err := controller.cancelLocked(ctx, ReasonShutdown); err != nil {
		return controller.snapshotLocked(), err
	}
	controller.closed = true
	controller.state = StateDisabled
	controller.reason = ReasonShutdown
	controller.processing = nil
	return controller.snapshotLocked(), nil
}

func (controller *Controller) pressLocked(ctx context.Context, binding Binding, focused bool) {
	if binding != controller.config.Binding || !controller.config.Enabled || !controller.config.PermissionGranted || !controller.deviceConnected {
		return
	}
	if controller.config.Binding.Scope == ScopeLocal && !focused {
		return
	}
	if controller.active != nil || controller.processing != nil {
		return
	}
	controller.nextCapture++
	capture := Capture{ID: fmt.Sprintf("capture-%d", controller.nextCapture), Binding: binding}
	if err := controller.port.Begin(ctx, capture); err != nil {
		controller.state = StateError
		controller.reason = ReasonPortError
		return
	}
	controller.active = &capture
	controller.state = StateCapturing
	controller.reason = ReasonNone
}

func (controller *Controller) releaseLocked(ctx context.Context, binding Binding) error {
	if controller.active == nil || binding != controller.active.Binding {
		return nil
	}
	capture := *controller.active
	if err := controller.port.Finish(ctx, capture); err != nil {
		finishErr := fmt.Errorf("finish PTT capture %q: %w", capture.ID, err)
		cancelErr := controller.cancelLocked(context.Background(), ReasonPortError)
		controller.state = StateError
		controller.reason = ReasonPortError
		return errors.Join(finishErr, cancelErr)
	}
	controller.active = nil
	controller.processing = &capture
	controller.state = StateProcessing
	controller.reason = ReasonNone
	return nil
}

func (controller *Controller) cancelLocked(ctx context.Context, reason Reason) error {
	capture := controller.active
	if capture == nil {
		capture = controller.processing
	}
	if capture != nil {
		if err := controller.port.Cancel(ctx, *capture, reason); err != nil {
			controller.state = StateError
			controller.reason = ReasonPortError
			return fmt.Errorf("cancel PTT capture %q: %w", capture.ID, err)
		}
	}
	controller.active = nil
	controller.processing = nil
	controller.state = StateCancelled
	controller.reason = reason
	return nil
}

func (controller *Controller) applyIdleState() {
	switch {
	case !controller.config.Enabled:
		controller.state = StateDisabled
		controller.reason = ReasonDisabled
	case !controller.config.PermissionGranted:
		controller.state = StateDisabled
		controller.reason = ReasonPermissionDenied
	case !controller.deviceConnected:
		controller.state = StateError
		controller.reason = ReasonDeviceUnavailable
	default:
		controller.state = StateListening
		controller.reason = ReasonNone
	}
}

func (controller *Controller) matchesDevice(device Device) bool {
	return controller.config.Binding.DeviceKind == device.Kind && controller.config.Binding.DeviceID == device.ID
}

func (controller *Controller) snapshotLocked() Snapshot {
	captureID := ""
	if controller.processing != nil {
		captureID = controller.processing.ID
	}
	if controller.active != nil {
		captureID = controller.active.ID
	}
	return Snapshot{
		SchemaVersion: ContractVersionV1, State: controller.state, Reason: controller.reason,
		Binding: controller.config.Binding, DeviceConnected: controller.deviceConnected, CaptureID: captureID,
	}
}

func normalizeDevice(device Device) (Device, error) {
	if containsControl(device.ID) {
		return Device{}, ErrInvalidInput
	}
	device.ID = normalizeToken(device.ID)
	switch device.Kind {
	case DeviceKeyboard, DeviceGamepad, DeviceHID:
	default:
		return Device{}, ErrInvalidInput
	}
	if !validOpaqueToken(device.ID) {
		return Device{}, ErrInvalidInput
	}
	return device, nil
}

func normalizeToken(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}
