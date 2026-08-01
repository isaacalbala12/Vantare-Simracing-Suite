// Package replayoracle provides a deterministic, test-only laboratory for the
// canonical Engineer projection. It owns no telemetry source, product
// lifecycle, I/O, goroutine, audio device or composition-root wiring.
package replayoracle

import (
	"errors"
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	engineercore "github.com/vantare/overlays/v2/internal/engineer/core"
	"github.com/vantare/overlays/v2/internal/engineer/fuel"
	"github.com/vantare/overlays/v2/internal/engineer/laps"
	"github.com/vantare/overlays/v2/internal/engineer/pitstops"
	"github.com/vantare/overlays/v2/internal/engineer/projectioninput"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	"github.com/vantare/overlays/v2/internal/engineer/timings"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const (
	ScenarioVersionV1 uint16 = 1
	OracleVersionV1   uint16 = 1

	MaxScenarioSteps    = 4_096
	MaxFamiliesPerStep  = 21
	MaxFactsPerStep     = 64
	MaxPendingMessages  = 256
	MaxScenarioOutcomes = 16_384

	// Legacy monitors add at most one minute to nowMS when constructing a
	// deadline. Keeping that headroom makes those additions overflow-safe.
	maxDecisionDeadlineOffsetMS int64 = 60_000
	MaxVirtualTimeMS                  = math.MaxInt64 - maxDecisionDeadlineOffsetMS
)

var (
	ErrClockMovedBackwards = errors.New("engineer replay clock cannot move backwards")
	ErrClockOutOfRange     = errors.New("engineer replay clock is outside its safe range")
	ErrScenarioVersion     = errors.New("engineer replay scenario version is unsupported")
	ErrScenarioLimit       = errors.New("engineer replay scenario exceeds a bounded limit")
	ErrInvalidScenario     = errors.New("engineer replay scenario is invalid")
)

type OutcomeState string

const (
	OutcomeEmitted     OutcomeState = "emitted"
	OutcomeSuppressed  OutcomeState = "suppressed"
	OutcomeExpired     OutcomeState = "expired"
	OutcomeCancelled   OutcomeState = "cancelled"
	OutcomeUnavailable OutcomeState = "unavailable"
)

type Reason string

const (
	ReasonCandidateEmitted         Reason = "candidate_emitted"
	ReasonNoCandidate              Reason = "no_candidate"
	ReasonDeadlineElapsed          Reason = "deadline_elapsed"
	ReasonEpochReset               Reason = "epoch_reset"
	ReasonIdentityChanged          Reason = "identity_changed"
	ReasonStaleContext             Reason = "stale_context"
	ReasonInvalidIdentityChange    Reason = "identity_changed_without_epoch"
	ReasonUnknownProjectionVersion Reason = "unknown_projection_version"
	ReasonUnknownCanonicalVersion  Reason = "unknown_canonical_version"
	ReasonObservationNotReady      Reason = "observation_not_ready"
	ReasonFamilyNotApproved        Reason = "family_not_approved"
	ReasonDecisionNotApproved      Reason = "decision_not_approved"
	ReasonUnknownFamily            Reason = "unknown_family"
	ReasonInvalidObservation       Reason = "invalid_observation"
	ReasonVehicleLimit             Reason = "vehicle_limit"
	ReasonFactBoundary             Reason = "lifecycle_fact"
	ReasonStaleFact                Reason = "stale_or_invalid_fact"
	ReasonUnknownFact              Reason = "unknown_fact"
)

type VirtualClock struct {
	nowMS int64
}

func NewVirtualClock(startMS int64) *VirtualClock {
	return &VirtualClock{nowMS: startMS}
}

func (clock *VirtualClock) NowMS() int64 {
	return clock.nowMS
}

func (clock *VirtualClock) Advance(deltaMS int64) error {
	if deltaMS < 0 {
		return ErrClockMovedBackwards
	}
	if clock.nowMS < 0 || clock.nowMS > MaxVirtualTimeMS || deltaMS > MaxVirtualTimeMS-clock.nowMS {
		return ErrClockOutOfRange
	}
	clock.nowMS += deltaMS
	return nil
}

type Scenario struct {
	Version uint16 `json:"version"`
	ID      string `json:"id"`
	Seed    uint64 `json:"seed"`
	StartMS int64  `json:"startMs"`
	Steps   []Step `json:"-"`
}

type Step struct {
	AdvanceMS int64
	Snapshot  *engineerprojection.ObservationSnapshotV1
	Facts     []engineerprojection.FactEnvelopeV1
	Families  []projectioninput.MonitorFamily
	Hold      bool
	Drain     bool
}

type Outcome struct {
	Sequence  int                           `json:"sequence"`
	Step      int                           `json:"step"`
	AtMS      int64                         `json:"atMs"`
	Family    projectioninput.MonitorFamily `json:"family,omitempty"`
	State     OutcomeState                  `json:"state"`
	Reason    Reason                        `json:"reason"`
	MessageID string                        `json:"messageId,omitempty"`
	TextKey   string                        `json:"textKey,omitempty"`
	ExpiresAt int64                         `json:"expiresAt,omitempty"`
}

type Report struct {
	OracleVersion   uint16    `json:"oracleVersion"`
	ScenarioVersion uint16    `json:"scenarioVersion"`
	ScenarioID      string    `json:"scenarioId"`
	Seed            uint64    `json:"seed"`
	Outcomes        []Outcome `json:"outcomes"`
}

type Runner struct{}

func NewRunner() *Runner {
	return &Runner{}
}

func (runner *Runner) Run(scenario Scenario) (Report, error) {
	if scenario.Version != ScenarioVersionV1 {
		return Report{}, ErrScenarioVersion
	}
	if scenario.ID == "" || scenario.StartMS < 0 || scenario.StartMS > MaxVirtualTimeMS {
		return Report{}, ErrInvalidScenario
	}
	if len(scenario.Steps) > MaxScenarioSteps {
		return Report{}, ErrScenarioLimit
	}

	state := newRunState(scenario)
	for stepIndex, step := range scenario.Steps {
		if len(step.Families) > MaxFamiliesPerStep || len(step.Facts) > MaxFactsPerStep {
			return Report{}, ErrScenarioLimit
		}
		if err := state.clock.Advance(step.AdvanceMS); err != nil {
			return Report{}, err
		}
		state.consumeFacts(stepIndex, step.Facts)
		if step.Snapshot != nil {
			state.consume(stepIndex, step)
		} else if len(step.Families) != 0 {
			return Report{}, ErrInvalidScenario
		}
		if step.Drain {
			state.drain(stepIndex, OutcomeEmitted, ReasonCandidateEmitted)
		}
		if len(state.report.Outcomes) > MaxScenarioOutcomes || state.queue.Len() > MaxPendingMessages {
			return Report{}, ErrScenarioLimit
		}
	}
	state.drain(len(scenario.Steps), OutcomeEmitted, ReasonCandidateEmitted)
	if len(state.report.Outcomes) > MaxScenarioOutcomes {
		return Report{}, ErrScenarioLimit
	}
	return state.report, nil
}

type runState struct {
	clock        *VirtualClock
	queue        *audio.Queue
	runtime      *engineercore.Runtime
	adapter      *projectioninput.Adapter
	lastContext  *engineerprojection.Context
	factEpoch    uint64
	factSequence uint64
	report       Report
}

func newRunState(scenario Scenario) *runState {
	queue := audio.NewQueue()
	return &runState{
		clock:   NewVirtualClock(scenario.StartMS),
		queue:   queue,
		runtime: engineercore.NewRuntime(queue, spotter.SensitivityNormal, true),
		adapter: projectioninput.NewAdapter(),
		report: Report{
			OracleVersion:   OracleVersionV1,
			ScenarioVersion: scenario.Version,
			ScenarioID:      scenario.ID,
			Seed:            scenario.Seed,
			Outcomes:        make([]Outcome, 0),
		},
	}
}

func (state *runState) consume(stepIndex int, step Step) {
	snapshot := *step.Snapshot
	if reason := validateSnapshot(snapshot); reason != "" {
		state.cancelPending(stepIndex, reason)
		state.resetRuntime()
		state.unavailable(stepIndex, step.Families, reason)
		return
	}

	if state.lastContext != nil {
		boundary, err := engineerprojection.ClassifyBoundary(*state.lastContext, snapshot.Context)
		if err != nil {
			reason := classifyBoundaryError(err)
			state.cancelPending(stepIndex, reason)
			state.resetRuntime()
			state.unavailable(stepIndex, step.Families, reason)
			return
		}
		if boundary.CancelsPending() {
			reason := ReasonIdentityChanged
			if boundary == engineerprojection.BoundaryEpochReset {
				reason = ReasonEpochReset
			}
			state.cancelPending(stepIndex, reason)
			state.runtime.Reset()
		}
	}
	contextCopy := snapshot.Context
	state.lastContext = &contextCopy

	for _, family := range step.Families {
		before := state.queue.Len()
		frame, err := state.adapter.FrameFor(family, snapshot)
		if err != nil {
			state.append(stepIndex, family, OutcomeUnavailable, classifyAdapterError(err), audio.Message{})
			continue
		}
		if family == projectioninput.FamilySpotter {
			state.runtime.ProcessSpotterFrame(state.clock.NowMS(), frame)
		} else if !state.runtime.ProcessMonitorFrame(string(family), state.clock.NowMS(), frame) {
			state.append(stepIndex, family, OutcomeUnavailable, ReasonUnknownFamily, audio.Message{})
			continue
		}
		if state.queue.Len() == before {
			state.append(stepIndex, family, OutcomeSuppressed, ReasonNoCandidate, audio.Message{})
		}
		if !step.Hold {
			state.drain(stepIndex, OutcomeEmitted, ReasonCandidateEmitted)
		}
	}
}

func (state *runState) consumeFacts(step int, facts []engineerprojection.FactEnvelopeV1) {
	for _, fact := range facts {
		reason := validateFact(fact, state.factEpoch, state.factSequence)
		if reason != "" {
			state.cancelPending(step, reason)
			state.resetRuntime()
			state.append(step, "", OutcomeUnavailable, reason, audio.Message{})
			continue
		}
		epoch := uint64(fact.Epoch)
		if epoch > state.factEpoch {
			state.factSequence = 0
		}
		state.factEpoch = epoch
		state.factSequence = uint64(fact.Fact.Sequence)
		switch fact.Fact.Kind {
		case engineerprojection.FactSessionStarted, engineerprojection.FactConnectionLost,
			engineerprojection.FactSessionEnded, engineerprojection.FactDriverChanged:
			state.cancelPending(step, ReasonFactBoundary)
			state.runtime.Reset()
		}
	}
}

func validateSnapshot(snapshot engineerprojection.ObservationSnapshotV1) Reason {
	policy := projection.VersionPolicy{
		Current:          engineerprojection.CurrentVersion,
		MinimumSupported: engineerprojection.MinimumSupportedVersion,
	}
	if err := policy.Validate(snapshot.ProjectionVersion); err != nil {
		return ReasonUnknownProjectionVersion
	}
	if snapshot.CanonicalVersion != schema.CanonicalVersionV1 {
		return ReasonUnknownCanonicalVersion
	}
	if snapshot.Context.Epoch == 0 || uint64(snapshot.Epoch) != snapshot.Context.Epoch || snapshot.Sequence == 0 {
		return ReasonInvalidObservation
	}
	if len(snapshot.Vehicles) > telemetrycore.MaxSessionVehicleHistory {
		return ReasonVehicleLimit
	}
	if _, err := time.Parse(time.RFC3339Nano, snapshot.CapturedAt); err != nil {
		return ReasonInvalidObservation
	}
	return ""
}

func validateFact(fact engineerprojection.FactEnvelopeV1, previousEpoch, previousSequence uint64) Reason {
	policy := projection.VersionPolicy{
		Current:          engineerprojection.CurrentVersion,
		MinimumSupported: engineerprojection.MinimumSupportedVersion,
	}
	if err := policy.Validate(fact.ProjectionVersion); err != nil {
		return ReasonUnknownProjectionVersion
	}
	if fact.CanonicalVersion != schema.CanonicalVersionV1 {
		return ReasonUnknownCanonicalVersion
	}
	epoch := uint64(fact.Epoch)
	sequence := uint64(fact.Fact.Sequence)
	if epoch == 0 || fact.Sequence == 0 || sequence == 0 ||
		epoch < previousEpoch || (epoch == previousEpoch && sequence <= previousSequence) {
		return ReasonStaleFact
	}
	if _, err := time.Parse(time.RFC3339Nano, fact.CapturedAt); err != nil {
		return ReasonStaleFact
	}
	if _, err := time.Parse(time.RFC3339Nano, fact.Fact.OccurredAt); err != nil {
		return ReasonStaleFact
	}
	switch fact.Fact.Kind {
	case engineerprojection.FactSessionStarted,
		engineerprojection.FactSessionEnded,
		engineerprojection.FactLapCompleted,
		engineerprojection.FactPitEntered,
		engineerprojection.FactPitExited,
		engineerprojection.FactDriverChanged,
		engineerprojection.FactConnectionLost,
		engineerprojection.FactConnectionRecovered:
		return ""
	default:
		return ReasonUnknownFact
	}
}

func classifyBoundaryError(err error) Reason {
	switch {
	case errors.Is(err, engineerprojection.ErrStaleProjection):
		return ReasonStaleContext
	case errors.Is(err, engineerprojection.ErrProjectionIdentityChange):
		return ReasonInvalidIdentityChange
	default:
		return ReasonInvalidObservation
	}
}

func classifyAdapterError(err error) Reason {
	switch {
	case errors.Is(err, projectioninput.ErrUnknownMonitorFamily):
		return ReasonUnknownFamily
	case errors.Is(err, projectioninput.ErrParityNotApproved):
		return ReasonFamilyNotApproved
	case errors.Is(err, projectioninput.ErrObservationNotReady):
		return ReasonObservationNotReady
	default:
		return ReasonInvalidObservation
	}
}

func (state *runState) unavailable(step int, families []projectioninput.MonitorFamily, reason Reason) {
	if len(families) == 0 {
		state.append(step, "", OutcomeUnavailable, reason, audio.Message{})
		return
	}
	for _, family := range families {
		state.append(step, family, OutcomeUnavailable, reason, audio.Message{})
	}
}

func (state *runState) cancelPending(step int, reason Reason) {
	state.drain(step, OutcomeCancelled, reason)
}

func (state *runState) drain(step int, intended OutcomeState, reason Reason) {
	for {
		message, ok := state.queue.Next(0)
		if !ok {
			return
		}
		outcomeState := intended
		outcomeReason := reason
		if intended == OutcomeEmitted {
			switch {
			case message.CreatedAt < 0 || message.CreatedAt > MaxVirtualTimeMS ||
				message.ExpiresAt < 0 || (message.ExpiresAt > 0 && message.ExpiresAt < message.CreatedAt):
				outcomeState = OutcomeUnavailable
				outcomeReason = ReasonInvalidObservation
			case !decisionApproved(familyForMessage(message), message.TextKey):
				outcomeState = OutcomeUnavailable
				outcomeReason = ReasonDecisionNotApproved
			case message.ExpiresAt > 0 && state.clock.NowMS() >= message.ExpiresAt:
				outcomeState = OutcomeExpired
				outcomeReason = ReasonDeadlineElapsed
			}
		}
		state.append(step, familyForMessage(message), outcomeState, outcomeReason, message)
	}
}

// decisionApproved is deliberately narrower than the legacy monitor output.
// The replay oracle must not turn an implementation detail into product
// evidence: only the decisions characterized by TC-08C are observable as
// emitted. ENG-05 may replace this temporary boundary with product policy.
func decisionApproved(family projectioninput.MonitorFamily, textKey string) bool {
	switch family {
	case projectioninput.FamilySpotter:
		switch textKey {
		case "spotter.car_left", "spotter.car_right", "spotter.still_there",
			"spotter.clear_left", "spotter.clear_right", "spotter.all_clear",
			"spotter.three_wide":
			return true
		}
	case projectioninput.FamilyFuel:
		switch textKey {
		case fuel.EventLowFuelHalfTank, fuel.EventLowFuel1Litre,
			fuel.EventLowFuel2Litres, fuel.EventFuelLapsRemaining4,
			fuel.EventFuelLapsRemaining3, fuel.EventFuelLapsRemaining2,
			fuel.EventFuelLapsRemaining1, fuel.EventFuelForPitNow:
			return true
		}
	case projectioninput.FamilyLaps:
		return textKey == laps.EventLapCompleted
	case projectioninput.FamilyTimings:
		return textKey == timings.EventGapReport
	case projectioninput.FamilyPitStops:
		return textKey == pitstops.EventPitEntry || textKey == pitstops.EventPitExit
	}
	return false
}

func (state *runState) append(step int, family projectioninput.MonitorFamily, result OutcomeState, reason Reason, message audio.Message) {
	state.report.Outcomes = append(state.report.Outcomes, Outcome{
		Sequence:  len(state.report.Outcomes) + 1,
		Step:      step,
		AtMS:      state.clock.NowMS(),
		Family:    family,
		State:     result,
		Reason:    reason,
		MessageID: message.ID,
		TextKey:   message.TextKey,
		ExpiresAt: message.ExpiresAt,
	})
}

func (state *runState) resetRuntime() {
	state.runtime.Reset()
	state.adapter = projectioninput.NewAdapter()
}

func familyForMessage(message audio.Message) projectioninput.MonitorFamily {
	if message.Category == audio.CategorySpotter {
		return projectioninput.FamilySpotter
	}
	return projectioninput.MonitorFamily(message.Category)
}
