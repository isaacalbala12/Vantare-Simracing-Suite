package app

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

const defaultEngineerConsumeTimeout = 250 * time.Millisecond

type engineerPort struct {
	runtime  *TelemetryCoreRuntime
	consumer EngineerProjectionConsumer
	timeout  time.Duration

	observations chan engineerprojection.ObservationSnapshotV1
	statuses     chan engineerStatusDelivery
	stop         chan struct{}
	done         chan struct{}

	started atomic.Bool
	start   sync.Once
	close   sync.Once
	enqueue sync.Mutex
}

type engineerStatusDelivery struct {
	value engineerprojection.SourceStatusV1
	done  chan struct{}
}

func newEngineerPort(runtime *TelemetryCoreRuntime, consumer EngineerProjectionConsumer, timeout time.Duration) *engineerPort {
	if runtime == nil || consumer == nil {
		return nil
	}
	if timeout <= 0 {
		timeout = defaultEngineerConsumeTimeout
	}
	return &engineerPort{
		runtime:      runtime,
		consumer:     consumer,
		timeout:      timeout,
		observations: make(chan engineerprojection.ObservationSnapshotV1, 1),
		statuses:     make(chan engineerStatusDelivery, 1),
		stop:         make(chan struct{}),
		done:         make(chan struct{}),
	}
}

func (port *engineerPort) Start() {
	if port == nil {
		return
	}
	port.start.Do(func() {
		port.started.Store(true)
		go port.run()
	})
}

func (port *engineerPort) Stop(ctx context.Context) error {
	if port == nil || !port.started.Load() {
		return nil
	}
	port.RequestStop()
	select {
	case <-port.done:
		return nil
	case <-ctx.Done():
		return fmtEngineerPortStop(ctx.Err())
	}
}

func (port *engineerPort) RequestStop() {
	if port == nil || !port.started.Load() {
		return
	}
	port.close.Do(func() { close(port.stop) })
}

func fmtEngineerPortStop(err error) error {
	return errors.Join(errors.New("stop Engineer asynchronous port"), err)
}

func (port *engineerPort) EnqueueObservation(value engineerprojection.ObservationSnapshotV1) bool {
	if port == nil || !port.started.Load() {
		return false
	}
	port.enqueue.Lock()
	defer port.enqueue.Unlock()
	select {
	case port.observations <- value:
		return true
	default:
	}
	select {
	case <-port.observations:
		port.runtime.metricStore.engineerStateDropped()
	default:
	}
	select {
	case port.observations <- value:
	default:
		port.runtime.metricStore.engineerStateDropped()
	}
	return true
}

func (port *engineerPort) EnqueueStatus(value engineerprojection.SourceStatusV1) bool {
	return port.enqueueStatus(engineerStatusDelivery{value: value})
}

func (port *engineerPort) DeliverStatus(value engineerprojection.SourceStatusV1) bool {
	delivery := engineerStatusDelivery{value: value, done: make(chan struct{})}
	if !port.enqueueStatus(delivery) {
		return false
	}
	<-delivery.done
	return true
}

func (port *engineerPort) enqueueStatus(delivery engineerStatusDelivery) bool {
	if port == nil || !port.started.Load() {
		return false
	}
	port.enqueue.Lock()
	defer port.enqueue.Unlock()
	select {
	case port.statuses <- delivery:
		return true
	default:
	}
	select {
	case replaced := <-port.statuses:
		if replaced.done != nil {
			close(replaced.done)
		}
	default:
	}
	select {
	case port.statuses <- delivery:
	default:
		if delivery.done != nil {
			close(delivery.done)
		}
	}
	return true
}

func (port *engineerPort) run() {
	defer close(port.done)
	for {
		select {
		case <-port.stop:
			port.deliverLastStatus()
			return
		case status := <-port.statuses:
			port.deliverStatus(status)
		case observation := <-port.observations:
			port.consumeObservation(observation)
		}
	}
}

func (port *engineerPort) deliverLastStatus() {
	for {
		select {
		case status := <-port.statuses:
			port.deliverStatus(status)
		default:
			return
		}
	}
}

func (port *engineerPort) deliverStatus(delivery engineerStatusDelivery) {
	port.runtime.consumeEngineerStatus(delivery.value)
	if delivery.done != nil {
		close(delivery.done)
	}
}

func (port *engineerPort) consumeObservation(value engineerprojection.ObservationSnapshotV1) {
	started := time.Now()
	result := make(chan error, 1)
	go func() {
		result <- newTelemetryConsumerError("engineer.observation", port.runtime.guardConsumer("engineer.observation", func() error {
			return port.consumer.ConsumeObservation(value)
		}))
	}()
	timer := time.NewTimer(port.timeout)
	defer timer.Stop()
	var err error
	select {
	case err = <-result:
	case <-timer.C:
		err = newTelemetryConsumerError("engineer.observation", context.DeadlineExceeded)
		port.runtime.metricStore.engineerTimeout()
	}
	port.runtime.metricStore.observeEngineerConsumeLatency(time.Since(started))
	port.runtime.recordEngineerObservationResult(err)
}
