// Package replayoracle provides a deterministic, test-only laboratory for the
// canonical Engineer projection. It owns no telemetry source, product
// lifecycle, I/O, goroutine, audio device or composition-root wiring.
package replayoracle

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	engineercore "github.com/vantare/overlays/v2/internal/engineer/core"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/projectioninput"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
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
	ReasonEvidenceStale            Reason = "evidence_stale"
	ReasonCapabilityUnavailable    Reason = "capability_unavailable"
	ReasonPriorityMismatch         Reason = "priority_mismatch"
	ReasonPayloadLimit             Reason = "payload_limit"
	ReasonDedupKeyLimit            Reason = "dedup_key_limit"
	ReasonCoalesced                Reason = "coalesced"
	ReasonCooldownActive           Reason = "cooldown_active"
	ReasonPreemptedBySpotter       Reason = "preempted_by_spotter"
	ReasonQueuePressure            Reason = "queue_pressure"
	ReasonLifecycleBoundary        Reason = "lifecycle_boundary"
	ReasonSemanticInvalidated      Reason = "semantic_invalidated"
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

	state, err := newRunState(scenario)
	if err != nil {
		return Report{}, err
	}
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
		if len(state.report.Outcomes) > MaxScenarioOutcomes || state.queue.Len() > MaxPendingMessages ||
			state.scheduler.State().Pending > MaxPendingMessages {
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
	scheduler    *messagepolicy.Scheduler
	runtime      *engineercore.Runtime
	adapter      *projectioninput.Adapter
	lastContext  *engineerprojection.Context
	factEpoch    uint64
	factSequence uint64
	report       Report
}

func newRunState(scenario Scenario) (*runState, error) {
	queue := audio.NewQueue()
	clock := NewVirtualClock(scenario.StartMS)
	scheduler, err := messagepolicy.NewScheduler(clock, messagepolicy.Limits{
		MaxPending:      MaxPendingMessages,
		MaxDiagnostics:  MaxPendingMessages,
		MaxCooldownKeys: MaxPendingMessages,
	})
	if err != nil {
		return nil, err
	}
	return &runState{
		clock:     clock,
		queue:     queue,
		scheduler: scheduler,
		runtime:   engineercore.NewRuntime(queue, spotter.SensitivityNormal, true),
		adapter:   projectioninput.NewAdapter(),
		report: Report{
			OracleVersion:   OracleVersionV1,
			ScenarioVersion: scenario.Version,
			ScenarioID:      scenario.ID,
			Seed:            scenario.Seed,
			Outcomes:        make([]Outcome, 0),
		},
	}, nil
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
	semantic := semanticEvidence(snapshot, state.adapter)
	state.appendPolicyOutcomes(stepIndex, state.scheduler.Observe(messagepolicy.Evidence{
		CanonicalVersion:  snapshot.CanonicalVersion,
		ProjectionVersion: snapshot.ProjectionVersion,
		Context:           snapshot.Context,
		Manifest:          snapshot.Manifest,
		Source:            engineerprojection.SourceLive,
		FreshUntilMS:      state.clock.NowMS() + 1_000,
		ReadyFamilies:     readyFamilies(snapshot),
		Semantic:          semantic,
	}))

	for _, family := range step.Families {
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
		if state.queue.Len() == 0 {
			state.append(stepIndex, family, OutcomeSuppressed, ReasonNoCandidate, audio.Message{})
			continue
		}
		state.admitLegacy(stepIndex, snapshot)
		if !step.Hold {
			state.drain(stepIndex, OutcomeEmitted, ReasonCandidateEmitted)
		}
	}
}

func readyFamilies(snapshot engineerprojection.ObservationSnapshotV1) []messagepolicy.Family {
	result := make([]messagepolicy.Family, 0, 6)
	for _, contract := range projectioninput.MonitorContracts() {
		if contract.State != projectioninput.ParityApproved {
			continue
		}
		gate, err := projectioninput.Evaluate(snapshot, contract.Family)
		if err == nil && gate.Ready {
			result = append(result, messagepolicy.Family(contract.Family))
		}
	}
	return result
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
	for {
		message, ok := state.queue.Next(0)
		if !ok {
			break
		}
		state.append(step, familyForMessage(message), OutcomeCancelled, reason, message)
	}
	state.appendPolicyOutcomes(step, state.scheduler.Cancel(policyCancelReason(reason)))
}

func policyCancelReason(reason Reason) messagepolicy.Reason {
	switch reason {
	case ReasonEpochReset:
		return messagepolicy.ReasonEpochReset
	case ReasonIdentityChanged, ReasonInvalidIdentityChange:
		return messagepolicy.ReasonIdentityChanged
	case ReasonStaleContext:
		return messagepolicy.ReasonEvidenceStale
	default:
		return messagepolicy.ReasonLifecycleBoundary
	}
}

func (state *runState) drain(step int, intended OutcomeState, reason Reason) {
	if intended != OutcomeEmitted {
		state.cancelPending(step, reason)
		return
	}
	if state.queue.Len() != 0 {
		// Normal runtime paths drain the legacy queue in consume. Reaching
		// this branch means a test inserted a message directly; there is no
		// snapshot proof with which policy may admit it.
		for {
			message, ok := state.queue.Next(0)
			if !ok {
				break
			}
			state.append(step, familyForMessage(message), OutcomeUnavailable, ReasonInvalidObservation, message)
		}
	}
	for {
		_, outcomes, ok := state.scheduler.Next()
		state.appendPolicyOutcomes(step, outcomes)
		if !ok {
			return
		}
	}
}

func (state *runState) admitLegacy(step int, snapshot engineerprojection.ObservationSnapshotV1) {
	for {
		message, ok := state.queue.Next(0)
		if !ok {
			return
		}
		candidate, reason := candidateFromLegacy(message, snapshot, semanticEvidence(snapshot, state.adapter))
		if reason != "" {
			state.append(step, familyForMessage(message), OutcomeUnavailable, reason, message)
			continue
		}
		_, outcomes := state.scheduler.Submit(candidate)
		state.appendPolicyOutcomes(step, outcomes)
	}
}

func candidateFromLegacy(message audio.Message, snapshot engineerprojection.ObservationSnapshotV1, evidence messagepolicy.SemanticEvidence) (messagepolicy.Candidate, Reason) {
	if message.CreatedAt < 0 || message.CreatedAt > MaxVirtualTimeMS ||
		message.ExpiresAt <= message.CreatedAt || message.ExpiresAt > MaxVirtualTimeMS+maxDecisionDeadlineOffsetMS {
		return messagepolicy.Candidate{}, ReasonInvalidObservation
	}
	family := familyForMessage(message)
	intent := message.TextKey
	if family == projectioninput.FamilyPenalties && intent == "penalties.new_drivethrough" {
		intent = "penalties.count_increased"
	}
	payload, ok := boundedLegacyPayload(message.ValidationData)
	if !ok {
		return messagepolicy.Candidate{}, ReasonInvalidObservation
	}
	semantic, ok := semanticClaimForLegacy(message.ValidityRule, intent, evidence)
	if !ok {
		return messagepolicy.Candidate{}, ReasonInvalidObservation
	}
	return messagepolicy.Candidate{
		Version:           messagepolicy.ContractVersionV1,
		ID:                message.ID,
		Family:            messagepolicy.Family(family),
		Intent:            intent,
		Subject:           string(snapshot.Context.Identity.Vehicle),
		Priority:          priorityForLegacy(family),
		CreatedAtMS:       message.CreatedAt,
		ExpiresAtMS:       message.ExpiresAt,
		CanonicalVersion:  snapshot.CanonicalVersion,
		ProjectionVersion: snapshot.ProjectionVersion,
		Context:           snapshot.Context,
		Semantic:          semantic,
		Payload:           payload,
	}, ""
}

func semanticEvidence(snapshot engineerprojection.ObservationSnapshotV1, adapter *projectioninput.Adapter) messagepolicy.SemanticEvidence {
	var result messagepolicy.SemanticEvidence
	if frame, err := adapter.FrameFor(projectioninput.FamilySpotter, snapshot); err == nil {
		result.SpotterKnown = true
		for _, zone := range spotter.Classify(frame, spotter.SensitivityNormal) {
			switch zone.Side {
			case spotter.SideLeft:
				result.SpotterLeft = true
			case spotter.SideRight:
				result.SpotterRight = true
			}
		}
	}
	if value, present := snapshot.Player.FuelLiters.Value(); present && snapshot.Player.FuelLiters.Usable() {
		result.FuelKnown, result.FuelLitres = true, value
	}
	if value, present := snapshot.Player.FuelCapacity.Value(); present && snapshot.Player.FuelCapacity.Usable() {
		result.FuelCapacityKnown, result.FuelCapacity = true, value
	}
	if value, present := snapshot.Player.InPit.Value(); present && snapshot.Player.InPit.Usable() {
		result.PitKnown, result.InPit = true, value
	}
	if value, present := snapshot.Player.PenaltyCount.Value(); present && snapshot.Player.PenaltyCount.Usable() {
		result.PenaltyKnown, result.PenaltyCount = true, int64(value)
	}
	if value, present := snapshot.Player.LapNumber.Value(); present && snapshot.Player.LapNumber.Usable() {
		result.LapKnown, result.LapNumber = true, int64(value)
	}
	if value, present := snapshot.Player.TimeBehindLeader.Value(); present && snapshot.Player.TimeBehindLeader.Usable() {
		result.GapLeaderKnown, result.GapLeader = true, value
	}
	if value, present := snapshot.Player.TimeBehindNext.Value(); present && snapshot.Player.TimeBehindNext.Usable() {
		result.GapNextKnown, result.GapNext = true, value
	}
	return result
}

func semanticClaimForLegacy(validityRule, intent string, evidence messagepolicy.SemanticEvidence) (messagepolicy.SemanticClaim, bool) {
	claim := messagepolicy.SemanticClaim{}
	switch validityRule {
	case "spotter.active_left":
		claim.Rule = messagepolicy.SemanticSpotterLeftActive
	case "spotter.active_right":
		claim.Rule = messagepolicy.SemanticSpotterRightActive
	case "spotter.active_both":
		claim.Rule = messagepolicy.SemanticSpotterBothActive
	case "spotter.clear_left":
		claim.Rule = messagepolicy.SemanticSpotterLeftClear
	case "spotter.clear_right":
		claim.Rule = messagepolicy.SemanticSpotterRightClear
	case "spotter.all_clear":
		claim.Rule = messagepolicy.SemanticSpotterAllClear
	case "":
		// Non-Spotter legacy monitors did not carry ValidityRule. Preserve their
		// observable claim explicitly instead of treating an empty rule as valid.
	default:
		return messagepolicy.SemanticClaim{}, false
	}
	if claim.Rule != messagepolicy.SemanticUnknown {
		return claim, true
	}
	switch intent {
	case messagepolicy.IntentSpotterCarLeft:
		claim.Rule = messagepolicy.SemanticSpotterLeftActive
	case messagepolicy.IntentSpotterCarRight:
		claim.Rule = messagepolicy.SemanticSpotterRightActive
	case messagepolicy.IntentSpotterStillThere:
		claim.Rule = messagepolicy.SemanticSpotterAnyActive
	case messagepolicy.IntentSpotterClearLeft:
		claim.Rule = messagepolicy.SemanticSpotterLeftClear
	case messagepolicy.IntentSpotterClearRight:
		claim.Rule = messagepolicy.SemanticSpotterRightClear
	case messagepolicy.IntentSpotterAllClear:
		claim.Rule = messagepolicy.SemanticSpotterAllClear
	case messagepolicy.IntentSpotterThreeWide:
		claim.Rule = messagepolicy.SemanticSpotterBothActive
	case messagepolicy.IntentFuelHalfTank:
		claim.Rule = messagepolicy.SemanticFuelHalfTank
	case messagepolicy.IntentFuelOneLitre:
		claim.Rule = messagepolicy.SemanticFuelAtMostOneLitre
	case messagepolicy.IntentFuelTwoLitres:
		claim.Rule = messagepolicy.SemanticFuelAtMostTwoLitres
	case messagepolicy.IntentFuelLapsFour, messagepolicy.IntentFuelLapsThree, messagepolicy.IntentFuelLapsTwo,
		messagepolicy.IntentFuelLapsOne, messagepolicy.IntentFuelPitNow:
		if !evidence.FuelKnown {
			return messagepolicy.SemanticClaim{}, false
		}
		claim.Rule, claim.Primary, claim.HasPrimary = messagepolicy.SemanticFuelNotRefuelled, evidence.FuelLitres, true
	case messagepolicy.IntentPenaltyCountIncreased:
		if !evidence.PenaltyKnown {
			return messagepolicy.SemanticClaim{}, false
		}
		claim.Rule, claim.Integer = messagepolicy.SemanticPenaltyOutstanding, evidence.PenaltyCount
	case messagepolicy.IntentLapCompleted:
		if !evidence.LapKnown {
			return messagepolicy.SemanticClaim{}, false
		}
		claim.Rule, claim.Integer = messagepolicy.SemanticLapCurrent, evidence.LapNumber
	case messagepolicy.IntentTimingGapReport:
		claim.Rule = messagepolicy.SemanticTimingUnchanged
		if evidence.GapLeaderKnown {
			claim.Primary, claim.HasPrimary = evidence.GapLeader, true
		}
		if evidence.GapNextKnown {
			claim.Secondary, claim.HasSecondary = evidence.GapNext, true
		}
		if !claim.HasPrimary && !claim.HasSecondary {
			return messagepolicy.SemanticClaim{}, false
		}
	case messagepolicy.IntentPitEntry:
		claim.Rule = messagepolicy.SemanticInPit
	case messagepolicy.IntentPitExit:
		claim.Rule = messagepolicy.SemanticOutOfPit
	default:
		// Keep unapproved intents transportable to policy so it can produce the
		// stable decision_not_approved outcome instead of reclassifying them as
		// malformed observations.
		return messagepolicy.SemanticClaim{}, true
	}
	return claim, true
}

func priorityForLegacy(family projectioninput.MonitorFamily) messagepolicy.Priority {
	switch family {
	case projectioninput.FamilySpotter:
		return messagepolicy.PrioritySpotter
	case projectioninput.FamilyFuel:
		return messagepolicy.PriorityFailureResource
	case projectioninput.FamilyPenalties:
		return messagepolicy.PriorityPenalty
	default:
		return messagepolicy.PriorityInformation
	}
}

func boundedLegacyPayload(input map[string]any) (map[string]string, bool) {
	if len(input) == 0 {
		return nil, true
	}
	result := make(map[string]string, len(input))
	for key, value := range input {
		switch value.(type) {
		case string, bool,
			int, int8, int16, int32, int64,
			uint, uint8, uint16, uint32, uint64,
			float32, float64:
			result[key] = fmt.Sprint(value)
		default:
			return nil, false
		}
	}
	return result, true
}

func (state *runState) appendPolicyOutcomes(step int, outcomes []messagepolicy.PolicyOutcome) {
	for _, outcome := range outcomes {
		state.report.Outcomes = append(state.report.Outcomes, Outcome{
			Sequence:  len(state.report.Outcomes) + 1,
			Step:      step,
			AtMS:      outcome.AtMS,
			Family:    projectioninput.MonitorFamily(outcome.Family),
			State:     OutcomeState(outcome.State),
			Reason:    Reason(outcome.Reason),
			MessageID: outcome.CandidateID,
			TextKey:   outcome.Intent,
			ExpiresAt: outcome.ExpiresAtMS,
		})
	}
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
