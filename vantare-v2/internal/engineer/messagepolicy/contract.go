// Package messagepolicy provides the deterministic policy and scheduler that
// sits between Engineer monitor candidates and future delivery transports. It
// performs no telemetry acquisition, audio, I/O or product wiring.
package messagepolicy

import (
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const ContractVersionV1 uint16 = 1

type Family string

const (
	FamilySpotter   Family = "spotter"
	FamilyFuel      Family = "fuel"
	FamilyPenalties Family = "penalties"
	FamilyLaps      Family = "laps"
	FamilyTimings   Family = "timings"
	FamilyPitStops  Family = "pitstops"
	FamilyUnknown   Family = ""
)

const (
	IntentSpotterCarLeft    = "spotter.car_left"
	IntentSpotterCarRight   = "spotter.car_right"
	IntentSpotterStillThere = "spotter.still_there"
	IntentSpotterClearLeft  = "spotter.clear_left"
	IntentSpotterClearRight = "spotter.clear_right"
	IntentSpotterAllClear   = "spotter.all_clear"
	IntentSpotterThreeWide  = "spotter.three_wide"

	IntentFuelHalfTank  = "fuel.low_half_tank"
	IntentFuelOneLitre  = "fuel.low_1l"
	IntentFuelTwoLitres = "fuel.low_2l"
	IntentFuelLapsFour  = "fuel.laps_remaining_4"
	IntentFuelLapsThree = "fuel.laps_remaining_3"
	IntentFuelLapsTwo   = "fuel.laps_remaining_2"
	IntentFuelLapsOne   = "fuel.laps_remaining_1"
	IntentFuelPitNow    = "fuel.for_pit_now"

	IntentPenaltyCountIncreased = "penalties.count_increased"
	IntentLapCompleted          = "laps.lap_completed"
	IntentTimingGapReport       = "timings.gap_report"
	IntentPitEntry              = "pitstops.entry"
	IntentPitExit               = "pitstops.exit"
)

// Priority is deliberately coarse. Producers cannot invent numeric urgency;
// policy validates every candidate against the priority assigned to its
// proven intent.
type Priority uint8

const (
	PriorityMotivation Priority = iota + 1
	PriorityInformation
	PriorityPenalty
	PriorityStrategyUrgent
	PriorityFailureResource
	PriorityRaceControl
	PrioritySpotter
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
	ReasonDeadlineElapsed          Reason = "deadline_elapsed"
	ReasonEvidenceStale            Reason = "evidence_stale"
	ReasonEpochReset               Reason = "epoch_reset"
	ReasonIdentityChanged          Reason = "identity_changed"
	ReasonLifecycleBoundary        Reason = "lifecycle_boundary"
	ReasonSourceUnavailable        Reason = "source_unavailable"
	ReasonUnknownContractVersion   Reason = "unknown_contract_version"
	ReasonUnknownProjectionVersion Reason = "unknown_projection_version"
	ReasonUnknownCanonicalVersion  Reason = "unknown_canonical_version"
	ReasonCapabilityUnavailable    Reason = "capability_unavailable"
	ReasonEvidenceNotReady         Reason = "evidence_not_ready"
	ReasonDecisionNotApproved      Reason = "decision_not_approved"
	ReasonPriorityMismatch         Reason = "priority_mismatch"
	ReasonInvalidCandidate         Reason = "invalid_candidate"
	ReasonPayloadLimit             Reason = "payload_limit"
	ReasonDedupKeyLimit            Reason = "dedup_key_limit"
	ReasonCoalesced                Reason = "coalesced"
	ReasonCooldownActive           Reason = "cooldown_active"
	ReasonPreemptedBySpotter       Reason = "preempted_by_spotter"
	ReasonQueuePressure            Reason = "queue_pressure"
	ReasonSemanticInvalidated      Reason = "semantic_invalidated"
)

// SemanticRule identifies the observable claim that must still be true when a
// queued candidate is selected. Rules are deliberately finite and owned by
// policy; a producer cannot smuggle an arbitrary validation expression into
// the scheduler.
type SemanticRule uint8

const (
	SemanticUnknown SemanticRule = iota
	SemanticSpotterLeftActive
	SemanticSpotterRightActive
	SemanticSpotterAnyActive
	SemanticSpotterBothActive
	SemanticSpotterLeftClear
	SemanticSpotterRightClear
	SemanticSpotterAllClear
	SemanticFuelHalfTank
	SemanticFuelAtMostOneLitre
	SemanticFuelAtMostTwoLitres
	SemanticFuelNotRefuelled
	SemanticPenaltyOutstanding
	SemanticLapCurrent
	SemanticTimingUnchanged
	SemanticInPit
	SemanticOutOfPit
)

// SemanticClaim is a bounded value-semantic description of the claim made by
// one candidate. Numeric fields are used only by the rule assigned to the
// approved intent; validateSemanticClaim rejects every other combination.
type SemanticClaim struct {
	Rule         SemanticRule `json:"rule"`
	Primary      float64      `json:"primary,omitempty"`
	Secondary    float64      `json:"secondary,omitempty"`
	Integer      int64        `json:"integer,omitempty"`
	HasPrimary   bool         `json:"hasPrimary,omitempty"`
	HasSecondary bool         `json:"hasSecondary,omitempty"`
}

// SemanticEvidence is a fixed-size view of the latest observation. Presence
// remains explicit so missing telemetry never becomes a meaningful zero.
type SemanticEvidence struct {
	SpotterKnown bool
	SpotterLeft  bool
	SpotterRight bool

	FuelKnown         bool
	FuelLitres        float64
	FuelCapacityKnown bool
	FuelCapacity      float64

	PitKnown bool
	InPit    bool

	PenaltyKnown bool
	PenaltyCount int64

	LapKnown  bool
	LapNumber int64

	GapLeaderKnown bool
	GapLeader      float64
	GapNextKnown   bool
	GapNext        float64
}

// Candidate is the bounded, transport-neutral output of one monitor. Payload
// values are strings so this contract does not admit arbitrary object graphs.
type Candidate struct {
	Version           uint16                     `json:"version"`
	ID                string                     `json:"id"`
	Family            Family                     `json:"family"`
	Intent            string                     `json:"intent"`
	Subject           string                     `json:"subject"`
	Priority          Priority                   `json:"priority"`
	CreatedAtMS       int64                      `json:"createdAtMs"`
	ExpiresAtMS       int64                      `json:"expiresAtMs"`
	CanonicalVersion  schema.Version             `json:"canonicalVersion"`
	ProjectionVersion projection.Version         `json:"projectionVersion"`
	Context           engineerprojection.Context `json:"context"`
	Semantic          SemanticClaim              `json:"semantic"`
	Payload           map[string]string          `json:"payload,omitempty"`
}

// Decision is an immutable copy of a candidate that passed policy twice:
// once when enqueued and again immediately before emission.
type Decision struct {
	Version     uint16                     `json:"version"`
	CandidateID string                     `json:"candidateId"`
	Family      Family                     `json:"family"`
	Intent      string                     `json:"intent"`
	Subject     string                     `json:"subject"`
	Priority    Priority                   `json:"priority"`
	CreatedAtMS int64                      `json:"createdAtMs"`
	ExpiresAtMS int64                      `json:"expiresAtMs"`
	Context     engineerprojection.Context `json:"context"`
	Semantic    SemanticClaim              `json:"semantic"`
	Payload     map[string]string          `json:"payload,omitempty"`
}

type PolicyOutcome struct {
	Version     uint16       `json:"version"`
	State       OutcomeState `json:"state"`
	Reason      Reason       `json:"reason"`
	CandidateID string       `json:"candidateId,omitempty"`
	Family      Family       `json:"family,omitempty"`
	Intent      string       `json:"intent,omitempty"`
	AtMS        int64        `json:"atMs"`
	ExpiresAtMS int64        `json:"expiresAtMs,omitempty"`
}

// SchedulerState is a bounded diagnostic snapshot. Recent never exceeds the
// configured diagnostics limit and contains no telemetry or personal data.
type SchedulerState struct {
	Version     uint16          `json:"version"`
	Pending     int             `json:"pending"`
	Capacity    int             `json:"capacity"`
	Accepted    uint64          `json:"accepted"`
	Emitted     uint64          `json:"emitted"`
	Suppressed  uint64          `json:"suppressed"`
	Expired     uint64          `json:"expired"`
	Cancelled   uint64          `json:"cancelled"`
	Unavailable uint64          `json:"unavailable"`
	Recent      []PolicyOutcome `json:"recent"`
}

// Evidence is the current canonical context used to validate candidates. It
// must be refreshed by the caller; the scheduler never assumes that a prior
// snapshot remains live.
type Evidence struct {
	CanonicalVersion  schema.Version
	ProjectionVersion projection.Version
	Context           engineerprojection.Context
	Manifest          engineerprojection.Manifest
	Source            engineerprojection.SourceState
	FreshUntilMS      int64
	ReadyFamilies     []Family
	Semantic          SemanticEvidence
}

type Clock interface {
	NowMS() int64
}

type Limits struct {
	MaxPending       int
	MaxPayloadItems  int
	MaxPayloadBytes  int
	MaxDedupKeyBytes int
	MaxDiagnostics   int
	MaxCooldownKeys  int
	MaxPriorityBurst int
}
