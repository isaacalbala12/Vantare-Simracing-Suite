package core

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"sync/atomic"
	"time"

	identityeviction "github.com/vantare/overlays/v2/internal/telemetry/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

var (
	ErrCoordinatorRunning     = errors.New("telemetry session coordinator already has an active owner")
	ErrFactBatchOverflow      = errors.New("telemetry fact batch exceeds configured limit")
	ErrFactSequenceExhausted  = errors.New("telemetry fact sequence exhausted")
	ErrVehicleHistoryOverflow = errors.New("telemetry session vehicle history exceeds configured limit")
)

// MaxSessionVehicleHistory remains the LMU scoring-slot budget used by the
// recording mapper. SessionCoordinator history uses a separate bounded LRU.
const MaxSessionVehicleHistory = 104

type FactKind uint8

const (
	FactSessionStarted FactKind = iota + 1
	FactSessionEnded
	FactLapCompleted
	FactPitEntered
	FactPitExited
	FactDriverChanged
	FactConnectionLost
	FactConnectionRecovered
)

func (kind FactKind) Known() bool {
	return kind >= FactSessionStarted && kind <= FactConnectionRecovered
}

type FactSequence uint64

// SessionFact is a discrete, value-semantic occurrence. Sequence orders facts
// independently from latest-wins snapshot cursors. PreviousIdentity is set for
// identity transitions; Lap is set only for FactLapCompleted.
type SessionFact struct {
	Sequence         FactSequence
	Kind             FactKind
	OccurredUTC      time.Time
	Identity         identity.RunIdentity
	PreviousIdentity identity.RunIdentity
	Lap              session.LapNumber
}

// FactBatchSink either accepts the complete ordered batch or returns an error.
// ErrBackpressure and ErrClosed remain inspectable through wrapping. Partial
// acceptance is outside this port contract, preventing silent loss or replay
// ambiguity when a caller retries the same snapshot.
type FactBatchSink interface {
	WriteFacts(context.Context, []envelope.Fact[SessionFact]) error
}

type SessionCoordinatorConfig struct {
	Now               func() time.Time
	MaxFactBatch      int
	MaxVehicleHistory int
}

type coordinatorVehicle struct {
	identity      identity.RunIdentity
	completedLaps standings.CompletedLaps
	hasLaps       bool
	inPit         pit.InPit
	hasPit        bool
	lastSeen      schema.Cursor
}

type sessionFactDraft struct {
	header envelope.Header
	value  SessionFact
}

type coordinatorState struct {
	initialized     bool
	sessionActive   bool
	header          envelope.Header
	connected       bool
	connectionKnown bool
	vehicles        map[identity.VehicleID]coordinatorVehicle
	factSequence    FactSequence
}

// SessionCoordinator is a synchronous, single-owner state machine. It performs
// no I/O except the caller-provided loss-intolerant fact port and starts no
// goroutines. A failed fact write leaves all coordinator state unchanged.
type SessionCoordinator struct {
	running     atomic.Bool
	mu          sync.RWMutex
	now         func() time.Time
	maxFacts    int
	maxVehicles int
	state       coordinatorState
}

// CoordinatorCandidate owns the next lifecycle state and ordered fact batch
// without making either visible.
type CoordinatorCandidate struct {
	coordinator *SessionCoordinator
	next        coordinatorState
	facts       []envelope.Fact[SessionFact]
}

func NewSessionCoordinator(config SessionCoordinatorConfig) *SessionCoordinator {
	now := config.Now
	if now == nil {
		now = time.Now
	}
	maxFacts := config.MaxFactBatch
	if maxFacts <= 0 {
		maxFacts = 256
	}
	maxVehicles := config.MaxVehicleHistory
	if maxVehicles <= 0 {
		maxVehicles = identityeviction.DefaultHistoryLimit
	}
	return &SessionCoordinator{now: now, maxFacts: maxFacts, maxVehicles: maxVehicles}
}

func (coordinator *SessionCoordinator) Apply(
	ctx context.Context,
	snapshot envelope.Snapshot[ObservedState],
	sink FactBatchSink,
) error {
	if !coordinator.running.CompareAndSwap(false, true) {
		return ErrCoordinatorRunning
	}
	defer coordinator.running.Store(false)
	if err := ctx.Err(); err != nil {
		return err
	}
	if sink == nil {
		return fmt.Errorf("write session facts: %w", ErrClosed)
	}
	coordinator.mu.RLock()
	if err := validateBatchHeader(coordinator.state.header, coordinator.state.initialized, snapshot.Header()); err != nil {
		coordinator.mu.RUnlock()
		return err
	}
	coordinator.mu.RUnlock()

	candidate, err := coordinator.Prepare(ctx, snapshot)
	if err != nil {
		return err
	}
	if facts := candidate.Facts(); len(facts) != 0 {
		if err := sink.WriteFacts(ctx, facts); err != nil {
			return fmt.Errorf("write ordered telemetry facts: %w", err)
		}
	}
	coordinator.Commit(candidate)
	return nil
}

// Prepare computes lifecycle state and ordered facts without committing them.
func (coordinator *SessionCoordinator) Prepare(
	ctx context.Context,
	snapshot envelope.Snapshot[ObservedState],
) (CoordinatorCandidate, error) {
	if err := ctx.Err(); err != nil {
		return CoordinatorCandidate{}, err
	}
	header := snapshot.Header()
	value, ok := snapshot.Value()
	if !ok {
		return CoordinatorCandidate{}, envelope.ErrCloneRequired
	}
	header = coordinatorHeader(header, value)
	if err := validateObservedState(header.Identity, value); err != nil {
		return CoordinatorCandidate{}, err
	}
	coordinator.mu.RLock()
	next := cloneCoordinatorState(coordinator.state)
	coordinator.mu.RUnlock()
	drafts, err := coordinator.applySnapshot(&next, header, value)
	if err != nil {
		return CoordinatorCandidate{}, err
	}
	facts, err := coordinator.materializeFacts(ctx, &next, drafts)
	if err != nil {
		return CoordinatorCandidate{}, err
	}
	return CoordinatorCandidate{coordinator: coordinator, next: next, facts: facts}, nil
}

// Facts returns an owned copy of the facts prepared for this commit.
func (candidate CoordinatorCandidate) Facts() []envelope.Fact[SessionFact] {
	return append([]envelope.Fact[SessionFact](nil), candidate.facts...)
}

// Commit publishes a candidate prepared by this coordinator.
func (coordinator *SessionCoordinator) Commit(candidate CoordinatorCandidate) {
	if candidate.coordinator != coordinator {
		return
	}
	coordinator.mu.Lock()
	coordinator.state = cloneCoordinatorState(candidate.next)
	coordinator.mu.Unlock()
}

func (coordinator *SessionCoordinator) materializeFacts(
	ctx context.Context,
	next *coordinatorState,
	drafts []sessionFactDraft,
) ([]envelope.Fact[SessionFact], error) {
	if len(drafts) == 0 {
		return nil, nil
	}
	if len(drafts) > coordinator.maxFacts {
		return nil, ErrFactBatchOverflow
	}
	if uint64(next.factSequence) > math.MaxUint64-uint64(len(drafts)) {
		return nil, ErrFactSequenceExhausted
	}
	facts := make([]envelope.Fact[SessionFact], len(drafts))
	for index := range drafts {
		drafts[index].value.Sequence = next.factSequence + FactSequence(index) + 1
		facts[index] = envelope.NewFact(drafts[index].header, drafts[index].value)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	next.factSequence += FactSequence(len(drafts))
	return facts, nil
}

/*
	The remaining lifecycle methods still use the loss-intolerant fact port
	directly. F3.4 moves their state under the engine boundary.
*/

func (coordinator *SessionCoordinator) publish(
	ctx context.Context,
	sink FactBatchSink,
	next *coordinatorState,
	drafts []sessionFactDraft,
) error {
	facts, err := coordinator.materializeFacts(ctx, next, drafts)
	if err != nil {
		return err
	}
	if len(facts) == 0 {
		return nil
	}
	if err := sink.WriteFacts(ctx, facts); err != nil {
		return fmt.Errorf("write ordered telemetry facts: %w", err)
	}
	return nil
}

// SetConnected emits connection lifecycle facts against the latest accepted
// snapshot. Brief disconnect/recovery never changes epoch or session identity.
func (coordinator *SessionCoordinator) SetConnected(
	ctx context.Context,
	connected bool,
	sink FactBatchSink,
) error {
	if !coordinator.running.CompareAndSwap(false, true) {
		return ErrCoordinatorRunning
	}
	defer coordinator.running.Store(false)
	if err := ctx.Err(); err != nil {
		return err
	}
	if sink == nil {
		return fmt.Errorf("write connection fact: %w", ErrClosed)
	}

	coordinator.mu.RLock()
	if !coordinator.state.initialized {
		coordinator.mu.RUnlock()
		return ErrInvalidInitialCursor
	}
	if coordinator.state.connectionKnown && coordinator.state.connected == connected {
		coordinator.mu.RUnlock()
		return nil
	}

	next := cloneCoordinatorState(coordinator.state)
	coordinator.mu.RUnlock()
	next.connectionKnown = true
	next.connected = connected
	kind := FactConnectionLost
	if connected {
		kind = FactConnectionRecovered
	}
	events := []sessionFactDraft{newFactDraft(next.header, next.header.Identity, SessionFact{
		Kind:        kind,
		OccurredUTC: coordinator.now().Round(0).UTC(),
	})}
	if err := coordinator.publish(ctx, sink, &next, events); err != nil {
		return err
	}
	coordinator.mu.Lock()
	coordinator.state = next
	coordinator.mu.Unlock()
	return nil
}

// EndSession explicitly closes the current session when no successor snapshot
// exists yet. It is idempotent and does not conflate connection loss with a
// session boundary.
func (coordinator *SessionCoordinator) EndSession(ctx context.Context, sink FactBatchSink) error {
	if !coordinator.running.CompareAndSwap(false, true) {
		return ErrCoordinatorRunning
	}
	defer coordinator.running.Store(false)
	if err := ctx.Err(); err != nil {
		return err
	}
	if sink == nil {
		return fmt.Errorf("write session end fact: %w", ErrClosed)
	}

	coordinator.mu.RLock()
	if !coordinator.state.initialized || !coordinator.state.sessionActive {
		coordinator.mu.RUnlock()
		return nil
	}
	next := cloneCoordinatorState(coordinator.state)
	coordinator.mu.RUnlock()
	next.sessionActive = false
	next.vehicles = nil
	events := []sessionFactDraft{newFactDraft(next.header, next.header.Identity, SessionFact{
		Kind:        FactSessionEnded,
		OccurredUTC: coordinator.now().Round(0).UTC(),
	})}
	if err := coordinator.publish(ctx, sink, &next, events); err != nil {
		return err
	}
	coordinator.mu.Lock()
	coordinator.state = next
	coordinator.mu.Unlock()
	return nil
}

func (coordinator *SessionCoordinator) Current() (envelope.Header, FactSequence, bool) {
	coordinator.mu.RLock()
	defer coordinator.mu.RUnlock()
	return coordinator.state.header, coordinator.state.factSequence, coordinator.state.initialized
}

func (coordinator *SessionCoordinator) applySnapshot(
	next *coordinatorState,
	header envelope.Header,
	state ObservedState,
) ([]sessionFactDraft, error) {
	now := coordinator.now().Round(0).UTC()
	facts := make([]sessionFactDraft, 0, 4)
	previousHeader := next.header
	previousVehicles := next.vehicles

	if !next.initialized || !next.sessionActive {
		facts = append(facts, newFactDraft(header, header.Identity, SessionFact{Kind: FactSessionStarted, OccurredUTC: now}))
		previousVehicles = nil
	} else if !previousHeader.Identity.SameSession(header.Identity) {
		facts = append(facts,
			newFactDraft(previousHeader, previousHeader.Identity, SessionFact{Kind: FactSessionEnded, OccurredUTC: now}),
			newFactDraft(header, header.Identity, SessionFact{Kind: FactSessionStarted, OccurredUTC: now, PreviousIdentity: previousHeader.Identity}),
		)
		previousVehicles = nil
	} else if previousHeader.Identity.Vehicle != header.Identity.Vehicle {
		// A car/run reset starts a new baseline only for the newly active run.
		// Stable rivals keep their same-session high-water and pit history.
		delete(previousVehicles, header.Identity.Vehicle)
	}

	updatedVehicles := previousVehicles
	if updatedVehicles == nil {
		updatedVehicles = make(map[identity.VehicleID]coordinatorVehicle, len(state.Vehicles))
	}
	activeVehicles := make(map[identity.VehicleID]struct{}, len(state.Vehicles))
	for _, vehicle := range state.Vehicles {
		activeVehicles[vehicle.Identity.Vehicle] = struct{}{}
	}
	trackedVehicles := len(updatedVehicles)
	for _, vehicle := range state.Vehicles {
		if _, exists := updatedVehicles[vehicle.Identity.Vehicle]; !exists {
			trackedVehicles++
		}
	}
	if overflow := trackedVehicles - coordinator.maxVehicles; overflow > 0 {
		entries := make([]identityeviction.EvictionEntry, 0, len(updatedVehicles))
		for vehicleID, vehicle := range updatedVehicles {
			_, active := activeVehicles[vehicleID]
			entries = append(entries, identityeviction.EvictionEntry{Vehicle: vehicleID, LastSeen: vehicle.lastSeen, Active: active})
		}
		victims := identityeviction.OldestUnseen(entries, overflow)
		for _, vehicleID := range victims {
			delete(updatedVehicles, vehicleID)
		}
		if trackedVehicles-len(victims) > coordinator.maxVehicles {
			return nil, ErrVehicleHistoryOverflow
		}
	}
	for _, vehicle := range state.Vehicles {
		previous, exists := previousVehicles[vehicle.Identity.Vehicle]
		current := previous
		current.identity = vehicle.Identity
		continuousPresence := exists && previous.lastSeen == previousHeader.Cursor

		if exists && (previous.identity.Driver != vehicle.Identity.Driver || previous.identity.Team != vehicle.Identity.Team) {
			facts = append(facts, newFactDraft(header, vehicle.Identity, SessionFact{
				Kind:             FactDriverChanged,
				OccurredUTC:      now,
				PreviousIdentity: previous.identity,
			}))
		}

		if laps, present := usableField(vehicle.CompletedLaps); present {
			current.completedLaps, current.hasLaps = laps, true
			if exists && previous.hasLaps {
				if laps < previous.completedLaps {
					// A same-session source regression cannot revoke an
					// already emitted fact. Preserve the high-water mark.
					current.completedLaps = previous.completedLaps
				} else if laps > previous.completedLaps {
					for completed := previous.completedLaps + 1; ; completed++ {
						facts = append(facts, newFactDraft(header, vehicle.Identity, SessionFact{
							Kind:        FactLapCompleted,
							OccurredUTC: now,
							Lap:         session.LapNumber(completed),
						}))
						if len(facts) > coordinator.maxFacts {
							return nil, ErrFactBatchOverflow
						}
						if completed == laps {
							break
						}
					}
				}
			}
		} else if exists {
			current.completedLaps, current.hasLaps = previous.completedLaps, previous.hasLaps
		}

		if inPit, present := usableField(vehicle.InPit); present {
			current.inPit, current.hasPit = inPit, true
			if continuousPresence && previous.hasPit && inPit != previous.inPit {
				kind := FactPitExited
				if inPit {
					kind = FactPitEntered
				}
				facts = append(facts, newFactDraft(header, vehicle.Identity, SessionFact{
					Kind:             kind,
					OccurredUTC:      now,
					PreviousIdentity: previous.identity,
				}))
			}
		} else if exists {
			current.inPit, current.hasPit = previous.inPit, previous.hasPit
		}
		current.lastSeen = header.Cursor
		updatedVehicles[vehicle.Identity.Vehicle] = current
		if len(facts) > coordinator.maxFacts {
			return nil, ErrFactBatchOverflow
		}
	}

	next.initialized = true
	next.sessionActive = true
	next.header = header
	next.vehicles = updatedVehicles
	if !next.connectionKnown {
		next.connectionKnown = true
		next.connected = true
	}
	return facts, nil
}

func coordinatorHeader(header envelope.Header, state ObservedState) envelope.Header {
	if header.Identity.Vehicle == "" {
		return header
	}
	for _, vehicle := range state.Vehicles {
		if vehicle.Identity.Vehicle == header.Identity.Vehicle {
			header.Identity.Team = vehicle.Identity.Team
			header.Identity.Driver = vehicle.Identity.Driver
			return header
		}
	}
	return header
}

func newFactDraft(header envelope.Header, factIdentity identity.RunIdentity, value SessionFact) sessionFactDraft {
	header.Identity = factIdentity
	value.Identity = factIdentity
	return sessionFactDraft{header: header, value: value}
}

func cloneCoordinatorState(state coordinatorState) coordinatorState {
	result := state
	if state.vehicles != nil {
		result.vehicles = make(map[identity.VehicleID]coordinatorVehicle, len(state.vehicles))
		for id, vehicle := range state.vehicles {
			result.vehicles[id] = vehicle
		}
	}
	return result
}

func usableField[T comparable](field schema.Field[T]) (T, bool) {
	value, present := field.Value()
	return value, present && field.Freshness() != schema.FreshnessInvalid
}
