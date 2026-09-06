package app

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

const defaultEngineerConsumeTimeout = 250 * time.Millisecond
const defaultEngineerFactQueueCapacity = 64

type engineerPort struct {
	runtime  *TelemetryCoreRuntime
	consumer EngineerProjectionConsumer
	timeout  time.Duration

	observations chan engineerprojection.ObservationSnapshotV1
	statuses     chan engineerStatusDelivery
	facts        chan engineerprojection.FactEnvelopeV1
	stop         chan struct{}
	done         chan struct{}
	// factWake es una señal coalescente (sin datos): hay un boundary
	// pendiente de notificar al consumidor en el orden del loop.
	factWake chan struct{}

	started atomic.Bool
	start   sync.Once
	close   sync.Once
	enqueue sync.Mutex
	factMu  sync.Mutex

	factCursor   *engineerprojection.FactCursor
	factBoundary error
	// factBoundaryNotified marca el boundary ya notificado: se notifica una
	// sola vez hasta que un epoch nuevo lo limpia. En el mismo epoch no hay
	// recuperacion: el gap es explicito y persiste.
	factBoundaryNotified  bool
	factDeliveredSequence telemetrycore.FactSequence
}

type engineerStatusDelivery struct {
	value engineerprojection.SourceStatusV1
	done  chan struct{}
}

func newEngineerPort(runtime *TelemetryCoreRuntime, consumer EngineerProjectionConsumer, timeout time.Duration, factCapacity int) *engineerPort {
	if runtime == nil || consumer == nil {
		return nil
	}
	if timeout <= 0 {
		timeout = defaultEngineerConsumeTimeout
	}
	if factCapacity < 1 {
		factCapacity = defaultEngineerFactQueueCapacity
	}
	return &engineerPort{
		runtime:      runtime,
		consumer:     consumer,
		timeout:      timeout,
		observations: make(chan engineerprojection.ObservationSnapshotV1, 1),
		statuses:     make(chan engineerStatusDelivery, 1),
		facts:        make(chan engineerprojection.FactEnvelopeV1, factCapacity),
		stop:         make(chan struct{}),
		done:         make(chan struct{}),
		factWake:     make(chan struct{}, 1),
		factCursor:   engineerprojection.NewFactCursor(factCapacity),
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

func (port *engineerPort) signalFactWakeLocked() {
	select {
	case port.factWake <- struct{}{}:
	default:
	}
}

// Delivery stays on the port loop: a queued old wake never carries stale
// boundary data past a newly delivered epoch. The producer never calls service.
func (port *engineerPort) notifyFactBoundary() {
	port.factMu.Lock()
	var boundary *engineerprojection.FactResyncRequiredError
	if port.factBoundaryNotified || !errors.As(port.factBoundary, &boundary) {
		port.factMu.Unlock()
		return
	}
	value := *boundary
	port.factBoundaryNotified = true
	port.factMu.Unlock()
	if err := port.runtime.guardConsumer("engineer.fact-boundary", func() error {
		return port.consumer.ConsumeFactBoundary(&value)
	}); err != nil {
		port.runtime.recordEngineerFactBoundary(newTelemetryConsumerError("engineer.fact-boundary", err))
	}
}

func (port *engineerPort) EnqueueFact(value engineerprojection.FactEnvelopeV1) (bool, error) {
	if port == nil || !port.started.Load() {
		return false, nil
	}
	port.factMu.Lock()
	defer port.factMu.Unlock()
	currentEpoch, _ := port.factCursor.Current()
	if port.factBoundary != nil && value.Epoch <= currentEpoch {
		return true, port.factBoundary
	}
	if err := port.factCursor.Append(value); err != nil {
		port.factBoundary = err
		port.factBoundaryNotified = false
		port.runtime.metricStore.incrementEngineerFactResync()
		port.runtime.recordEngineerFactBoundary(err)
		port.signalFactWakeLocked()
		return true, err
	}
	if value.Epoch > currentEpoch {
		port.factBoundary = nil
		port.factBoundaryNotified = false
		port.factDeliveredSequence = 0
	}
	select {
	case port.facts <- value:
		port.runtime.metricStore.setEngineerFactQueueDepth(uint64(len(port.facts)))
		return true, nil
	default:
		boundary := &engineerprojection.FactResyncRequiredError{
			Previous: port.factDeliveredSequence,
			Next:     value.Fact.Sequence,
		}
		port.factBoundary = boundary
		port.factBoundaryNotified = false
		port.runtime.metricStore.engineerFactDropped()
		for {
			select {
			case <-port.facts:
				port.runtime.metricStore.engineerFactDropped()
			default:
				port.runtime.metricStore.setEngineerFactQueueDepth(0)
				goto factsDrained
			}
		}
	factsDrained:
		port.runtime.metricStore.incrementEngineerFactResync()
		port.runtime.recordEngineerFactBoundary(boundary)
		port.signalFactWakeLocked()
		return true, boundary
	}
}

func (port *engineerPort) ResyncFacts(from telemetrycore.FactSequence) ([]engineerprojection.FactEnvelopeV1, error) {
	if port == nil {
		return nil, &engineerprojection.FactResyncRequiredError{Previous: from}
	}
	port.factMu.Lock()
	defer port.factMu.Unlock()
	facts, err := port.factCursor.ResyncFacts(from)
	if err != nil {
		return nil, err
	}
	port.factBoundary = nil
	port.factBoundaryNotified = false
	return facts, nil
}

func (port *engineerPort) DeclareFactBoundary(err error) {
	if port == nil || err == nil {
		return
	}
	port.factMu.Lock()
	port.factBoundary = err
	port.factBoundaryNotified = false
	port.signalFactWakeLocked()
	port.factMu.Unlock()
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
		case <-port.factWake:
			port.notifyFactBoundary()
		case observation := <-port.observations:
			if !port.consumeObservation(observation) {
				return
			}
		case fact := <-port.facts:
			port.runtime.metricStore.setEngineerFactQueueDepth(uint64(len(port.facts)))
			port.consumeFact(fact)
		}
	}
}

func (port *engineerPort) consumeFact(value engineerprojection.FactEnvelopeV1) {
	port.factMu.Lock()
	boundary := port.factBoundary
	port.factMu.Unlock()
	if boundary != nil {
		port.runtime.metricStore.engineerFactDropped()
		return
	}
	err := newTelemetryConsumerError("engineer.fact", port.runtime.guardConsumer("engineer.fact", func() error {
		return port.consumer.ConsumeFact(value)
	}))
	if err == nil {
		port.factMu.Lock()
		port.factDeliveredSequence = value.Fact.Sequence
		port.factMu.Unlock()
	}
	port.runtime.recordEngineerFactResult(err)
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

// consumeObservation ejecuta el callback con timeout y single-flight real:
// el loop no lee otra observacion hasta que esta termine (una llamada en
// vuelo como maximo; el canal cap-1 conserva la ultima). Un callback no
// cooperativo no se cancela: queda retenido como maximo 1 y su resultado
// tardio se descarta sin tapar el timeout. Devuelve false si se pidio stop
// (el loop debe salir); la salida entrega los status ya encolados, igual que
// cualquier otra ruta de cierre, sin inventar ninguno.
func (port *engineerPort) consumeObservation(value engineerprojection.ObservationSnapshotV1) bool {
	started := time.Now()
	result := make(chan error, 1)
	go func() {
		result <- newTelemetryConsumerError("engineer.observation", port.runtime.guardConsumer("engineer.observation", func() error {
			return port.consumer.ConsumeObservation(value)
		}))
	}()
	timer := time.NewTimer(port.timeout)
	defer timer.Stop()
	select {
	case err := <-result:
		port.runtime.metricStore.observeEngineerConsumeLatency(time.Since(started))
		port.runtime.recordEngineerObservationResult(err)
		return true
	case <-timer.C:
		err := newTelemetryConsumerError("engineer.observation", context.DeadlineExceeded)
		port.runtime.metricStore.engineerTimeout()
		port.runtime.metricStore.observeEngineerConsumeLatency(time.Since(started))
		port.runtime.recordEngineerObservationResult(err)
	case <-port.stop:
		port.deliverLastStatus()
		return false
	}
	// El callback sigue vivo tras el timeout: el timer vencio una sola vez,
	// no se crea otra ejecucion y el resultado tardio se descarta. El canal
	// cap-1 conserva la ultima observacion; status, facts y stop se siguen
	// atendiendo sin inventar datos.
	for {
		select {
		case <-result:
			return true
		case status := <-port.statuses:
			port.deliverStatus(status)
		case <-port.factWake:
			port.notifyFactBoundary()
		case fact := <-port.facts:
			port.runtime.metricStore.setEngineerFactQueueDepth(uint64(len(port.facts)))
			port.consumeFact(fact)
		case <-port.stop:
			port.deliverLastStatus()
			return false
		}
	}
}
