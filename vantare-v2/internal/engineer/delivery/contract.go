// Package delivery defines the bounded, transport-neutral handoff between an
// Engineer decision and a cancelable user-facing transport.
package delivery

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
)

const ContractVersionV1 uint16 = 1

const maxIdentifierBytes = 256

var (
	ErrInvalidRequest     = errors.New("engineer delivery request is invalid")
	ErrInvalidState       = errors.New("engineer delivery state is invalid")
	ErrInvalidReason      = errors.New("engineer delivery reason is invalid")
	ErrInvalidTransition  = errors.New("engineer delivery transition is invalid")
	ErrPreemptedBySpotter = errors.New("engineer delivery preempted by spotter")
	ErrLifecycleBoundary  = errors.New("engineer delivery cancelled by lifecycle boundary")
	ErrSourceUnavailable  = errors.New("engineer delivery cancelled because source is unavailable")
)

type State string

const (
	StateQueued      State = "queued"
	StateStarted     State = "started"
	StateCompleted   State = "completed"
	StateInterrupted State = "interrupted"
	StateFailed      State = "failed"
	StateCancelled   State = "cancelled"
)

type Reason string

const (
	ReasonNone               Reason = ""
	ReasonPreemptedBySpotter Reason = "preempted_by_spotter"
	ReasonLifecycleBoundary  Reason = "lifecycle_boundary"
	ReasonDeadlineElapsed    Reason = "deadline_elapsed"
	ReasonSourceUnavailable  Reason = "source_unavailable"
	ReasonPolicyRejected     Reason = "policy_rejected"
	ReasonTransportError     Reason = "transport_error"
)

type Request struct {
	Version     uint16
	DeliveryID  string
	DecidedAtMS int64
	Decision    messagepolicy.Decision
}

// Acknowledgement contains only bounded identifiers and lifecycle state. It
// deliberately excludes message text, telemetry, paths and device details.
type Acknowledgement struct {
	Version     uint16 `json:"version"`
	DeliveryID  string `json:"deliveryId"`
	CandidateID string `json:"candidateId"`
	State       State  `json:"state"`
	Reason      Reason `json:"reason,omitempty"`
	AtMS        int64  `json:"atMs"`
}

type Reporter interface {
	Acknowledge(state State, reason Reason) error
}

// Port blocks until one delivery completes or its context is cancelled. A
// port reports started before user-facing output begins and exactly one
// terminal acknowledgement before returning.
type Port interface {
	Deliver(ctx context.Context, request Request, reporter Reporter) error
}

type Clock interface {
	NowMS() int64
}

type Session struct {
	mu       sync.Mutex
	request  Request
	clock    Clock
	metrics  *Metrics
	observer func(Acknowledgement) error
	state    State
}

func NewSession(request Request, clock Clock, metrics *Metrics, observer func(Acknowledgement) error) (*Session, error) {
	if clock == nil || metrics == nil || request.Version != ContractVersionV1 ||
		!validIdentifier(request.DeliveryID) || request.Decision.Version != messagepolicy.ContractVersionV1 ||
		!validIdentifier(request.Decision.CandidateID) || request.Decision.CreatedAtMS < 0 ||
		request.Decision.ExpiresAtMS <= request.Decision.CreatedAtMS || request.DecidedAtMS < 0 {
		return nil, ErrInvalidRequest
	}
	return &Session{request: request, clock: clock, metrics: metrics, observer: observer}, nil
}

func (session *Session) Acknowledge(state State, reason Reason) error {
	if !knownState(state) {
		return ErrInvalidState
	}
	if !knownReason(reason) {
		return ErrInvalidReason
	}
	if !validStateReason(state, reason) {
		return ErrInvalidReason
	}
	session.mu.Lock()
	if !validTransition(session.state, state) {
		session.mu.Unlock()
		return ErrInvalidTransition
	}
	now := session.clock.NowMS()
	ack := Acknowledgement{
		Version:     ContractVersionV1,
		DeliveryID:  session.request.DeliveryID,
		CandidateID: session.request.Decision.CandidateID,
		State:       state,
		Reason:      reason,
		AtMS:        now,
	}
	observer := session.observer
	if observer != nil {
		if err := observer(ack); err != nil {
			session.mu.Unlock()
			return err
		}
	}
	session.state = state
	session.metrics.record(state, session.request.DecidedAtMS, now)
	session.mu.Unlock()
	return nil
}

func (session *Session) Terminal() bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	return terminal(session.state)
}

func (session *Session) State() State {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.state
}

func validIdentifier(value string) bool {
	return value != "" && len(value) <= maxIdentifierBytes && !strings.ContainsRune(value, '\x00')
}

func knownState(state State) bool {
	switch state {
	case StateQueued, StateStarted, StateCompleted, StateInterrupted, StateFailed, StateCancelled:
		return true
	default:
		return false
	}
}

func knownReason(reason Reason) bool {
	switch reason {
	case ReasonNone, ReasonPreemptedBySpotter, ReasonLifecycleBoundary,
		ReasonDeadlineElapsed, ReasonSourceUnavailable, ReasonPolicyRejected, ReasonTransportError:
		return true
	default:
		return false
	}
}

func validStateReason(state State, reason Reason) bool {
	switch state {
	case StateQueued, StateStarted, StateCompleted:
		return reason == ReasonNone
	case StateInterrupted:
		return reason == ReasonPreemptedBySpotter
	case StateFailed:
		return reason == ReasonTransportError
	case StateCancelled:
		return reason == ReasonLifecycleBoundary || reason == ReasonDeadlineElapsed ||
			reason == ReasonSourceUnavailable || reason == ReasonPolicyRejected ||
			reason == ReasonPreemptedBySpotter
	default:
		return false
	}
}

func validTransition(from, to State) bool {
	switch from {
	case "":
		return to == StateQueued
	case StateQueued:
		return to == StateStarted || to == StateFailed || to == StateCancelled
	case StateStarted:
		return to == StateCompleted || to == StateInterrupted || to == StateFailed || to == StateCancelled
	default:
		return false
	}
}

func terminal(state State) bool {
	switch state {
	case StateCompleted, StateInterrupted, StateFailed, StateCancelled:
		return true
	default:
		return false
	}
}

type MetricsSnapshot struct {
	Queued                   uint64 `json:"queued"`
	Started                  uint64 `json:"started"`
	Completed                uint64 `json:"completed"`
	Interrupted              uint64 `json:"interrupted"`
	Failed                   uint64 `json:"failed"`
	Cancelled                uint64 `json:"cancelled"`
	DecisionToStartSamples   int    `json:"decisionToStartSamples"`
	DecisionToStartP95MS     int64  `json:"decisionToStartP95Ms"`
	DecisionToStartMaximumMS int64  `json:"decisionToStartMaximumMs"`
}

type Metrics struct {
	mu      sync.Mutex
	limit   int
	latency []int64
	counts  [6]uint64
}

func NewMetrics(maxLatencySamples int) *Metrics {
	if maxLatencySamples <= 0 {
		maxLatencySamples = 128
	}
	return &Metrics{limit: maxLatencySamples, latency: make([]int64, 0, maxLatencySamples)}
}

func (metrics *Metrics) record(state State, decisionAt, ackAt int64) {
	metrics.mu.Lock()
	defer metrics.mu.Unlock()
	switch state {
	case StateQueued:
		metrics.counts[0]++
	case StateStarted:
		metrics.counts[1]++
		latency := ackAt - decisionAt
		if latency < 0 {
			latency = 0
		}
		if len(metrics.latency) == metrics.limit {
			copy(metrics.latency, metrics.latency[1:])
			metrics.latency[len(metrics.latency)-1] = latency
		} else {
			metrics.latency = append(metrics.latency, latency)
		}
	case StateCompleted:
		metrics.counts[2]++
	case StateInterrupted:
		metrics.counts[3]++
	case StateFailed:
		metrics.counts[4]++
	case StateCancelled:
		metrics.counts[5]++
	}
}

func (metrics *Metrics) Snapshot() MetricsSnapshot {
	metrics.mu.Lock()
	defer metrics.mu.Unlock()
	result := MetricsSnapshot{
		Queued: metrics.counts[0], Started: metrics.counts[1], Completed: metrics.counts[2],
		Interrupted: metrics.counts[3], Failed: metrics.counts[4], Cancelled: metrics.counts[5],
		DecisionToStartSamples: len(metrics.latency),
	}
	if len(metrics.latency) == 0 {
		return result
	}
	ordered := append([]int64(nil), metrics.latency...)
	sort.Slice(ordered, func(left, right int) bool { return ordered[left] < ordered[right] })
	index := (95*len(ordered) + 99) / 100
	if index > 0 {
		index--
	}
	result.DecisionToStartP95MS = ordered[index]
	result.DecisionToStartMaximumMS = ordered[len(ordered)-1]
	return result
}
