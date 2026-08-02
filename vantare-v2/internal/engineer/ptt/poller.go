package ptt

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	DefaultPollInterval = 8 * time.Millisecond
	DefaultStopTimeout  = time.Second
)

var ErrPollerRunning = errors.New("engineer PTT poller is already running")

type Poller struct {
	binding  Binding
	reader   Reader
	handler  InputHandler
	interval time.Duration

	pollMu             sync.Mutex
	mu                 sync.Mutex
	running            bool
	initialized        bool
	previous           DeviceSample
	readerErrorHandled bool
	lastErr            error
}

func NewPoller(binding Binding, reader Reader, handler InputHandler, interval time.Duration) (*Poller, error) {
	normalized, err := NormalizeBinding(binding)
	if err != nil {
		return nil, err
	}
	if reader == nil || handler == nil {
		return nil, ErrInvalidInput
	}
	if interval <= 0 {
		interval = DefaultPollInterval
	}
	return &Poller{binding: normalized, reader: reader, handler: handler, interval: interval}, nil
}

// Run polls until ctx is cancelled. Only one Run call may be active at a time.
// Reader and handler calls must be bounded; Run deliberately owns no hidden
// goroutine so cancellation and teardown remain observable to its caller.
func (poller *Poller) Run(ctx context.Context) (runErr error) {
	if poller == nil || ctx == nil {
		return ErrInvalidInput
	}
	poller.mu.Lock()
	if poller.running {
		poller.mu.Unlock()
		return ErrPollerRunning
	}
	poller.running = true
	poller.mu.Unlock()
	defer func() {
		poller.mu.Lock()
		poller.running = false
		poller.mu.Unlock()
	}()
	defer func() {
		runErr = errors.Join(runErr, poller.cancelCapture())
	}()

	if err := poller.Poll(ctx); err != nil && !errors.Is(err, context.Canceled) {
		poller.setLastError(err)
	}
	ticker := time.NewTicker(poller.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := poller.Poll(ctx); err != nil {
				if errors.Is(err, context.Canceled) {
					return nil
				}
				poller.setLastError(err)
			}
		}
	}
}

// cancelCapture releases any capturing or processing ownership after the
// polling context ends. It deliberately uses a separate bounded context: the
// caller's context is already cancelled, but a stuck port must still become a
// visible Run error rather than blocking shutdown indefinitely.
func (poller *Poller) cancelCapture() error {
	ctx, cancel := context.WithTimeout(context.Background(), DefaultStopTimeout)
	defer cancel()
	if err := poller.dispatch(ctx, Input{Kind: InputCancel, Binding: poller.binding}); err != nil {
		return fmt.Errorf("cancel PTT after polling stopped: %w", err)
	}
	return nil
}

func (poller *Poller) Poll(ctx context.Context) error {
	if poller == nil || ctx == nil {
		return ErrInvalidInput
	}
	poller.pollMu.Lock()
	defer poller.pollMu.Unlock()
	sample, err := poller.reader.Read(ctx, poller.binding)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		poller.mu.Lock()
		errorHandled := poller.readerErrorHandled
		poller.mu.Unlock()
		if !errorHandled {
			if dispatchErr := poller.dispatch(ctx, Input{Kind: InputDeviceError, Binding: poller.binding}); dispatchErr != nil {
				return dispatchErr
			}
			poller.mu.Lock()
			poller.readerErrorHandled = true
			poller.initialized = false
			poller.previous = DeviceSample{}
			poller.mu.Unlock()
		}
		poller.setLastError(err)
		return err
	}

	poller.mu.Lock()
	previous := poller.previous
	initialized := poller.initialized
	poller.mu.Unlock()

	if !initialized || sample.Connected != previous.Connected {
		kind := InputDeviceDisconnected
		if sample.Connected {
			kind = InputDeviceConnected
		}
		device := Device{Kind: poller.binding.DeviceKind, ID: poller.binding.DeviceID}
		if err := poller.dispatch(ctx, Input{Kind: kind, Binding: poller.binding, Device: device}); err != nil {
			return err
		}
	}
	if !sample.Connected {
		poller.commitSample(sample)
		return nil
	}
	if !initialized {
		if sample.Pressed {
			if err := poller.dispatch(ctx, Input{Kind: InputPressed, Binding: poller.binding, Focused: sample.Focused}); err != nil {
				return err
			}
		}
		poller.commitSample(sample)
		return nil
	}
	if poller.binding.Scope == ScopeLocal && previous.Focused && !sample.Focused {
		if err := poller.dispatch(ctx, Input{Kind: InputFocusLost, Binding: poller.binding}); err != nil {
			return err
		}
	}
	if sample.Pressed == previous.Pressed {
		poller.commitSample(sample)
		return nil
	}
	kind := InputReleased
	if sample.Pressed {
		kind = InputPressed
	}
	if err := poller.dispatch(ctx, Input{Kind: kind, Binding: poller.binding, Focused: sample.Focused}); err != nil {
		return err
	}
	poller.commitSample(sample)
	return nil
}

func (poller *Poller) LastError() error {
	if poller == nil {
		return ErrInvalidInput
	}
	poller.mu.Lock()
	defer poller.mu.Unlock()
	return poller.lastErr
}

func (poller *Poller) dispatch(ctx context.Context, input Input) error {
	if _, err := poller.handler.Handle(ctx, input); err != nil {
		return fmt.Errorf("dispatch PTT input %q: %w", input.Kind, err)
	}
	return nil
}

func (poller *Poller) setLastError(err error) {
	poller.mu.Lock()
	poller.lastErr = err
	poller.mu.Unlock()
}

func (poller *Poller) commitSample(sample DeviceSample) {
	poller.mu.Lock()
	poller.previous = sample
	poller.initialized = true
	poller.readerErrorHandled = false
	poller.lastErr = nil
	poller.mu.Unlock()
}
