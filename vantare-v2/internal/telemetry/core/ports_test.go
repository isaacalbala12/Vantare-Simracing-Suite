package core

import (
	"context"
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

type fakeDriver struct{}

func (fakeDriver) Run(context.Context, driver.ObservationSink[int]) error { return nil }
func (fakeDriver) State() driver.State                                    { return driver.StateStopped }

type fakeObservationSink struct{}

func (fakeObservationSink) WriteObservation(context.Context, int) error { return nil }

type fakeRecordingSink struct{}

func (fakeRecordingSink) WriteSnapshot(context.Context, envelope.Snapshot[[]int]) error {
	return nil
}
func (fakeRecordingSink) WriteFact(context.Context, envelope.Fact[int]) error { return nil }
func (fakeRecordingSink) Close(context.Context) error                         { return nil }

type fakeDerivation struct{}

func (fakeDerivation) Apply(snapshot envelope.Snapshot[[]int]) (envelope.Snapshot[[]int], error) {
	return snapshot, nil
}

func TestPortsAreSatisfiedByNarrowFakes(t *testing.T) {
	t.Parallel()

	var _ Driver[int] = fakeDriver{}
	var _ driver.ObservationSink[int] = fakeObservationSink{}
	var _ RecordingSink[[]int, int] = fakeRecordingSink{}
	var _ Derivation[[]int] = fakeDerivation{}
}

func TestFlowControlErrorsRemainInspectableWhenWrapped(t *testing.T) {
	t.Parallel()

	wrapped := errors.Join(errors.New("adapter context"), ErrBackpressure)
	if !errors.Is(wrapped, ErrBackpressure) {
		t.Fatal("wrapped backpressure must remain inspectable")
	}
	if errors.Is(wrapped, ErrClosed) {
		t.Fatal("backpressure must not be confused with closure")
	}
}
