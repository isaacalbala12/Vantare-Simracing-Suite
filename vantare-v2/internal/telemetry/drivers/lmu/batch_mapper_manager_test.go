package lmu

import (
	"context"
	"errors"
	"testing"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/driver"
)

type mapperManagerDriver struct {
	observation Observation
	disconnect  error
}

func (current *mapperManagerDriver) Run(ctx context.Context, sink driver.ObservationSink[Observation]) error {
	if err := sink.WriteObservation(ctx, current.observation); err != nil {
		return err
	}
	if current.disconnect != nil {
		return current.disconnect
	}
	<-ctx.Done()
	return ctx.Err()
}

func (*mapperManagerDriver) RuntimeSnapshot() driver.RuntimeSnapshot {
	return driver.RuntimeSnapshot{State: driver.StateLive}
}

type managerBatchCollector struct {
	batches chan telemetrycore.Batch
}

func (collector *managerBatchCollector) WriteBatch(ctx context.Context, batch telemetrycore.Batch) error {
	batch.State.Vehicles = append([]telemetrycore.VehicleState(nil), batch.State.Vehicles...)
	select {
	case collector.batches <- batch:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestDriverManagerReconnectReusesObservationBatchSinkState(t *testing.T) {
	transient := errors.New("LMU transient disconnect")
	downstream := &managerBatchCollector{batches: make(chan telemetrycore.Batch, 2)}
	observationSink, err := NewObservationBatchSink(NewBatchMapper(), downstream)
	if err != nil {
		t.Fatal(err)
	}

	constructed := 0
	manager, err := telemetrycore.NewDriverManager([]telemetrycore.DriverCandidate[Observation]{
		{
			Descriptor: driver.Descriptor{ID: "lmu", Priority: 1},
			Detect:     func(context.Context) (bool, error) { return true, nil },
			New: func() (telemetrycore.Driver[Observation], error) {
				constructed++
				observation := trackObservation(7)
				observation.SourceTime = observed(time.Duration(constructed) * time.Second)
				current := &mapperManagerDriver{observation: observation}
				if constructed == 1 {
					current.disconnect = transient
				}
				return current, nil
			},
			Retryable: func(err error) bool { return errors.Is(err, transient) },
		},
	}, telemetrycore.ManagerConfig{Retry: telemetrycore.RetryPolicy{
		MaxReconnects: 1,
		Wait:          func(context.Context, time.Duration) error { return nil },
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(t.Context(), observationSink); err != nil {
		t.Fatal(err)
	}

	batches := make([]telemetrycore.Batch, 0, 2)
	for len(batches) < 2 {
		select {
		case batch := <-downstream.batches:
			batches = append(batches, batch)
		case <-time.After(time.Second):
			t.Fatalf("received %d batches after reconnect, want 2", len(batches))
		}
	}
	if err := manager.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}

	for index, batch := range batches {
		assertCursor(t, batch, 1, uint64(index+1))
		if batch.Header.Identity.Session != "lmu-session-1" || batch.Header.Identity.Vehicle != "lmu-slot-7-generation-1" {
			t.Fatalf("batch %d identity = %+v", index, batch.Header.Identity)
		}
		assertVehicleID(t, batch, 7, "lmu-slot-7-generation-1")
	}
}
