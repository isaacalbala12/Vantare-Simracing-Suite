package replayoracle

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/vantare/overlays/v2/internal/families"
	"github.com/vantare/overlays/v2/internal/radio"
	radiospotter "github.com/vantare/overlays/v2/internal/spotter"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

// The radio lab drives the radio.v1 stack the way EngineerService wires it:
// spotter.Producer and families.Engine feed a bounded radio.Bus, one delivery
// runs at a time through radio.Session ACKs, and lifecycle facts reset the
// same seams as delivery_runtime.go. Everything is synchronous and driven by
// VirtualClock, so a scenario is a deterministic script of steps.
const radioLabVersion uint16 = 1

type radioStep struct {
	AdvanceMS int64
	Snapshot  *engineerprojection.ObservationSnapshotV1
	Facts     []engineerprojection.FactEnvelopeV1
	// Hold parks the first dispatched delivery after its started ACK. Release
	// resolves a parked delivery before new evidence is consumed. Drain runs
	// the dispatch loop until the bus has no selectable work.
	Hold    bool
	Release bool
	Drain   bool
}

type radioOutcome struct {
	Sequence  int    `json:"sequence"`
	Step      int    `json:"step"`
	AtMS      int64  `json:"atMs"`
	Event     string `json:"event"`
	Family    string `json:"family,omitempty"`
	Intent    string `json:"intent,omitempty"`
	Reason    string `json:"reason,omitempty"`
	MessageID string `json:"messageId,omitempty"`
	Detail    string `json:"detail,omitempty"`
}

type radioReport struct {
	LabVersion uint16                `json:"labVersion"`
	ScenarioID string                `json:"scenarioId"`
	Outcomes   []radioOutcome        `json:"outcomes"`
	Metrics    radio.MetricsSnapshot `json:"metrics"`
}

type radioLabDelivery struct {
	item    *radio.Item
	session *radio.Session
}

type radioLab struct {
	clock    *VirtualClock
	bus      *radio.Bus
	producer *radiospotter.Producer
	engine   *families.Engine
	resolver *radio.Resolver
	metrics  *radio.Metrics

	lastContext       *engineerprojection.Context
	lastObservation   *observationCursor
	reconnectBoundary *observationCursor
	factEpoch         uint64
	factSequence      uint64
	connection        replayConnection

	nextDelivery int
	active       *radioLabDelivery
	currentStep  int
	report       radioReport
}

type fataler interface {
	Helper()
	Fatal(args ...any)
}

func newRadioLab(t fataler, startMS int64, limits radio.Limits) *radioLab {
	t.Helper()
	clock := NewVirtualClock(startMS)
	producer, err := radiospotter.NewProducer(clock, radio.LocaleES)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := families.New(clock, radio.LocaleES)
	if err != nil {
		t.Fatal(err)
	}
	if limits.MaxPending == 0 {
		limits = radio.DefaultLimits()
	}
	if limits.Cooldowns == nil {
		limits.Cooldowns = families.Cooldowns()
	}
	bus, err := radio.NewBus(limits, clock)
	if err != nil {
		t.Fatal(err)
	}
	resolver := radio.NewResolver()
	if err := radiospotter.RegisterCatalog(resolver); err != nil {
		t.Fatal(err)
	}
	if err := families.RegisterCatalog(resolver); err != nil {
		t.Fatal(err)
	}
	return &radioLab{
		clock: clock, bus: bus, producer: producer, engine: engine,
		resolver: resolver, metrics: radio.NewMetrics(128),
		connection: replayConnected,
		report:     radioReport{LabVersion: radioLabVersion, Outcomes: make([]radioOutcome, 0)},
	}
}

func (lab *radioLab) run(t fataler, id string, steps []radioStep) radioReport {
	t.Helper()
	lab.report.ScenarioID = id
	for index, step := range steps {
		lab.currentStep = index
		if err := lab.clock.Advance(step.AdvanceMS); err != nil {
			t.Fatal(err)
		}
		if step.Release {
			lab.settleHeld(index, true)
		}
		for _, fact := range step.Facts {
			lab.consumeFact(index, fact)
		}
		if step.Snapshot != nil {
			lab.consumeSnapshot(index, *step.Snapshot)
		}
		if step.Drain {
			lab.drain(index, step.Hold)
		}
	}
	final := len(steps)
	lab.currentStep = final
	lab.settleHeld(final, true)
	for {
		item, ok := lab.bus.Next(context.Background())
		if !ok {
			break
		}
		lab.dispatch(final, item, false)
	}
	lab.report.Metrics = lab.metrics.Snapshot()
	return lab.report
}

// consumeFact applies the service's lifecycle semantics: ordered validation,
// full radio reset at session/driver boundaries, and the disconnect boundary
// that only a strictly newer snapshot may cross after recovery.
func (lab *radioLab) consumeFact(step int, fact engineerprojection.FactEnvelopeV1) {
	if reason := validateFact(fact, lab.factEpoch, lab.factSequence); reason != "" {
		lab.resetAll(step, radio.ErrLifecycleBoundary)
		lab.record(step, "fact_rejected", nil, string(reason), "")
		return
	}
	epoch := uint64(fact.Epoch)
	if epoch > lab.factEpoch {
		lab.factSequence = 0
	}
	lab.factEpoch = epoch
	lab.factSequence = uint64(fact.Fact.Sequence)
	switch fact.Fact.Kind {
	case engineerprojection.FactSessionStarted, engineerprojection.FactSessionEnded,
		engineerprojection.FactDriverChanged:
		lab.resetAll(step, radio.ErrLifecycleBoundary)
	case engineerprojection.FactConnectionLost:
		lab.resetAll(step, radio.ErrSourceUnavailable)
		if lab.lastObservation != nil {
			boundary := *lab.lastObservation
			lab.reconnectBoundary = &boundary
		}
		lab.connection = replayDisconnected
	case engineerprojection.FactConnectionRecovered:
		lab.connection = replayAwaitingFreshSnapshot
	}
}

// consumeSnapshot mirrors ConsumeObservation: source gate, reconnect boundary,
// context boundary classification, then producers and family engine in order.
func (lab *radioLab) consumeSnapshot(step int, snapshot engineerprojection.ObservationSnapshotV1) {
	if lab.connection == replayDisconnected {
		lab.record(step, "snapshot_rejected", nil, string(ReasonSourceUnavailable), "")
		return
	}
	if lab.connection == replayAwaitingFreshSnapshot && lab.reconnectBoundary != nil &&
		!cursorFromSnapshot(snapshot).strictlyAfter(*lab.reconnectBoundary) {
		lab.record(step, "snapshot_rejected", nil, string(ReasonStaleContext), "")
		return
	}
	if lab.lastContext != nil {
		boundary, err := engineerprojection.ClassifyBoundary(*lab.lastContext, snapshot.Context)
		if err != nil {
			lab.resetAll(step, radio.ErrLifecycleBoundary)
			lab.record(step, "snapshot_rejected", nil, string(classifyBoundaryError(err)), "")
			return
		}
		if boundary.CancelsPending() {
			reason := string(ReasonIdentityChanged)
			if boundary == engineerprojection.BoundaryEpochReset {
				reason = string(ReasonEpochReset)
			}
			lab.resetAll(step, radio.ErrLifecycleBoundary)
			lab.record(step, "boundary_reset", nil, reason, "")
		}
	}
	contextCopy := snapshot.Context
	lab.lastContext = &contextCopy
	cursor := cursorFromSnapshot(snapshot)
	lab.lastObservation = &cursor
	lab.reconnectBoundary = nil
	lab.connection = replayConnected

	message, emit, err := lab.producer.Evaluate(snapshot)
	switch {
	case errors.Is(err, radiospotter.ErrObservationNotReady):
		// resetSpotterRadioLocked: producer reset + selective intent purge.
		lab.producer.Reset()
		lab.bus.ResetIntents(radio.ErrPolicyRejected, radiospotter.Intents()...)
		lab.record(step, "spotter_unavailable", nil, string(ReasonObservationNotReady), "")
		lab.settleHeld(step, false)
	case err != nil:
		lab.record(step, "spotter_error", nil, err.Error(), "")
	case emit:
		lab.submit(step, message)
	}

	evaluation, err := lab.engine.Evaluate(snapshot)
	if len(evaluation.ResetIntents) > 0 {
		lab.bus.ResetIntents(radio.ErrPolicyRejected, evaluation.ResetIntents...)
		lab.record(step, "intents_reset", nil, "", strings.Join(evaluation.ResetIntents, ","))
		lab.settleHeld(step, false)
	}
	switch {
	case err == nil:
		for _, current := range evaluation.Messages {
			lab.submit(step, current)
		}
	case errors.Is(err, families.ErrObservationNotReady):
		lab.record(step, "families_unavailable", nil, string(ReasonObservationNotReady), "")
	default:
		lab.record(step, "families_error", nil, err.Error(), "")
	}
}

// resetAll mirrors resetRadioLocked + cancelDeliveryLocked.
func (lab *radioLab) resetAll(step int, cause error) {
	lab.producer.Reset()
	lab.engine.Reset()
	lab.bus.Reset(cause)
	lab.record(step, "reset", nil, radioCancelReason(cause), "")
	lab.settleHeld(step, false)
}

func (lab *radioLab) submit(step int, message radio.RadioMessage) {
	result, err := lab.bus.Submit(message)
	if err != nil {
		lab.record(step, "rejected", &message, err.Error(), "")
		return
	}
	for index := range result.Dropped {
		lab.record(step, "dropped", &result.Dropped[index], "", "")
	}
	switch {
	case !result.Accepted:
		lab.record(step, "rejected", &message, "queue_pressure_or_cooldown", "")
	case result.Coalesced:
		lab.record(step, "coalesced", &message, "", "")
	default:
		lab.record(step, "submitted", &message, "", "")
	}
	if result.ActivePreempted {
		lab.record(step, "preempted_active", &message, "", "")
		lab.settleHeld(step, false)
	}
}

func (lab *radioLab) drain(step int, hold bool) {
	for lab.active == nil {
		item, ok := lab.bus.Next(context.Background())
		if !ok {
			return
		}
		lab.dispatch(step, item, hold)
		hold = false
	}
}

// dispatch mirrors dispatchRadioLocked + runRadioDelivery: a bounded session
// owns the ACK sequence and the started ACK feeds producers, family state and
// the bus cooldown in that order.
func (lab *radioLab) dispatch(step int, item *radio.Item, hold bool) {
	lab.nextDelivery++
	request := radio.Request{
		Version: radio.VersionV1, DeliveryID: fmt.Sprintf("lab-delivery-%d", lab.nextDelivery),
		DecidedAtMS: lab.clock.NowMS(), Message: item.Message,
	}
	session, err := radio.NewSession(request, lab.clock, lab.metrics, func(ack radio.Acknowledgement) error {
		lab.record(lab.currentStep, "ack_"+string(ack.State), &item.Message, string(ack.Reason), "")
		if ack.State != radio.StateStarted {
			return nil
		}
		if item.Message.Priority == radio.PriorityP0 {
			if err := lab.producer.AcknowledgeStarted(item.Message, ack.AtMS); err != nil {
				return err
			}
		} else {
			lab.engine.AcknowledgeStarted(item.Message)
		}
		item.Started()
		return nil
	})
	if err != nil {
		lab.record(step, "invalid_request", &item.Message, err.Error(), "")
		item.Done()
		return
	}
	delivery := &radioLabDelivery{item: item, session: session}
	if err := session.Acknowledge(radio.StateQueued, radio.ReasonNone); err != nil {
		item.Done()
		return
	}
	if reason := lab.deliveryCancelReason(delivery); reason != radio.ReasonNone {
		lab.terminate(step, delivery, radio.StateCancelled, reason)
		return
	}
	if _, err := lab.resolver.Resolve(item.Message); err != nil {
		lab.terminate(step, delivery, radio.StateFailed, radio.ReasonTransportError)
		return
	}
	if reason := lab.deliveryCancelReason(delivery); reason != radio.ReasonNone {
		lab.terminate(step, delivery, radio.StateCancelled, reason)
		return
	}
	if err := session.Acknowledge(radio.StateStarted, radio.ReasonNone); err != nil {
		lab.terminate(step, delivery, radio.StateCancelled, radio.ReasonPolicyRejected)
		return
	}
	if hold {
		lab.active = delivery
		lab.record(step, "held", &item.Message, "", "")
		return
	}
	lab.terminate(step, delivery, radio.StateCompleted, radio.ReasonNone)
}

// settleHeld finishes a parked delivery the way runRadioDelivery does when the
// port returns: the context cause picks the terminal ACK, then Done releases
// the slot. With force=false it only resolves a delivery whose context was
// actually cancelled or whose deadline elapsed — a started delivery survives
// ResetIntents, matching production.
func (lab *radioLab) settleHeld(step int, force bool) {
	delivery := lab.active
	if delivery == nil {
		return
	}
	cause := context.Cause(delivery.item.Context)
	expired := lab.clock.NowMS() >= delivery.item.Message.ExpiresAtMS
	if !force && cause == nil && !expired {
		return
	}
	lab.active = nil
	switch {
	case errors.Is(cause, radio.ErrPreemptedBySpotter):
		lab.terminate(step, delivery, radio.StateInterrupted, radio.ReasonPreemptedBySpotter)
	case errors.Is(cause, radio.ErrSourceUnavailable):
		lab.terminate(step, delivery, radio.StateCancelled, radio.ReasonSourceUnavailable)
	case errors.Is(cause, radio.ErrPolicyRejected):
		lab.terminate(step, delivery, radio.StateCancelled, radio.ReasonPolicyRejected)
	case cause != nil:
		lab.terminate(step, delivery, radio.StateCancelled, radio.ReasonLifecycleBoundary)
	case expired:
		lab.terminate(step, delivery, radio.StateCancelled, radio.ReasonDeadlineElapsed)
	default:
		lab.terminate(step, delivery, radio.StateCompleted, radio.ReasonNone)
	}
}

func (lab *radioLab) terminate(step int, delivery *radioLabDelivery, state radio.State, reason radio.Reason) {
	if err := delivery.session.Acknowledge(state, reason); err != nil {
		lab.record(step, "invalid_transition", &delivery.item.Message, err.Error(), "")
	}
	delivery.item.Done()
}

func (lab *radioLab) deliveryCancelReason(delivery *radioLabDelivery) radio.Reason {
	cause := context.Cause(delivery.item.Context)
	switch {
	case errors.Is(cause, radio.ErrPreemptedBySpotter):
		return radio.ReasonPreemptedBySpotter
	case errors.Is(cause, radio.ErrSourceUnavailable):
		return radio.ReasonSourceUnavailable
	case errors.Is(cause, radio.ErrPolicyRejected):
		return radio.ReasonPolicyRejected
	case cause != nil:
		return radio.ReasonLifecycleBoundary
	case lab.clock.NowMS() >= delivery.item.Message.ExpiresAtMS:
		return radio.ReasonDeadlineElapsed
	default:
		return radio.ReasonNone
	}
}

func (lab *radioLab) record(step int, event string, message *radio.RadioMessage, reason, detail string) {
	outcome := radioOutcome{
		Sequence: len(lab.report.Outcomes) + 1, Step: step, AtMS: lab.clock.NowMS(),
		Event: event, Reason: reason, Detail: detail,
	}
	if message != nil {
		outcome.Intent = message.Intent
		outcome.MessageID = message.ID
		outcome.Family = radioIntentFamily(*message)
	}
	lab.report.Outcomes = append(lab.report.Outcomes, outcome)
}

func radioIntentFamily(message radio.RadioMessage) string {
	if message.Priority == radio.PriorityP0 {
		return "spotter"
	}
	if family, ok := families.FamilyForIntent(message.Intent); ok {
		return family
	}
	return ""
}

func radioCancelReason(cause error) string {
	switch {
	case errors.Is(cause, radio.ErrPreemptedBySpotter):
		return string(radio.ReasonPreemptedBySpotter)
	case errors.Is(cause, radio.ErrSourceUnavailable):
		return string(radio.ReasonSourceUnavailable)
	case errors.Is(cause, radio.ErrPolicyRejected):
		return string(radio.ReasonPolicyRejected)
	default:
		return string(radio.ReasonLifecycleBoundary)
	}
}
