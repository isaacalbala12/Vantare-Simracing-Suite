package messagepolicy

import (
	"errors"
	"math"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const (
	defaultMaxPending       = 64
	defaultMaxPayloadItems  = 16
	defaultMaxPayloadBytes  = 2_048
	defaultMaxDedupKeyBytes = 256
	defaultMaxDiagnostics   = 128
	defaultMaxCooldownKeys  = 256
	defaultMaxPriorityBurst = 8

	hardMaxPending       = 256
	hardMaxPayloadItems  = 64
	hardMaxPayloadBytes  = 8_192
	hardMaxDedupKeyBytes = 1_024
	hardMaxDiagnostics   = 1_024
	hardMaxCooldownKeys  = 1_024
	hardMaxPriorityBurst = 64
	hardMaxIDBytes       = 256
	hardMaxFamilyBytes   = 64
	hardMaxIntentBytes   = 256
	hardMaxSubjectBytes  = 512
	hardMaxIdentityBytes = 256
	hardMaxReadyFamilies = 32
	hardMaxManifestItems = 32
	hardMaxManifestBytes = 4_096
)

var (
	ErrClockRequired = errors.New("engineer message policy requires a clock")
	ErrInvalidLimits = errors.New("engineer message policy limits are invalid")
)

type queuedCandidate struct {
	candidate Candidate
	sequence  uint64
}

type cooldownEntry struct {
	key       string
	emittedAt int64
	sequence  uint64
}

type Scheduler struct {
	clock       Clock
	limits      Limits
	pending     []queuedCandidate
	cooldowns   []cooldownEntry
	recent      []PolicyOutcome
	evidence    Evidence
	evidenceErr Reason
	hasEvidence bool
	next        uint64
	priorityRun int
	state       SchedulerState
}

func NewScheduler(clock Clock, limits Limits) (*Scheduler, error) {
	if clock == nil {
		return nil, ErrClockRequired
	}
	limits = fillLimits(limits)
	if !validLimits(limits) {
		return nil, ErrInvalidLimits
	}
	return &Scheduler{
		clock:     clock,
		limits:    limits,
		pending:   make([]queuedCandidate, 0, limits.MaxPending),
		cooldowns: make([]cooldownEntry, 0, limits.MaxCooldownKeys),
		recent:    make([]PolicyOutcome, 0, limits.MaxDiagnostics),
		state: SchedulerState{
			Version:  ContractVersionV1,
			Capacity: limits.MaxPending,
		},
	}, nil
}

func fillLimits(limits Limits) Limits {
	if limits.MaxPending == 0 {
		limits.MaxPending = defaultMaxPending
	}
	if limits.MaxPayloadItems == 0 {
		limits.MaxPayloadItems = defaultMaxPayloadItems
	}
	if limits.MaxPayloadBytes == 0 {
		limits.MaxPayloadBytes = defaultMaxPayloadBytes
	}
	if limits.MaxDedupKeyBytes == 0 {
		limits.MaxDedupKeyBytes = defaultMaxDedupKeyBytes
	}
	if limits.MaxDiagnostics == 0 {
		limits.MaxDiagnostics = defaultMaxDiagnostics
	}
	if limits.MaxCooldownKeys == 0 {
		limits.MaxCooldownKeys = defaultMaxCooldownKeys
	}
	if limits.MaxPriorityBurst == 0 {
		limits.MaxPriorityBurst = defaultMaxPriorityBurst
	}
	return limits
}

func validLimits(limits Limits) bool {
	return limits.MaxPending > 0 && limits.MaxPending <= hardMaxPending &&
		limits.MaxPayloadItems > 0 && limits.MaxPayloadItems <= hardMaxPayloadItems &&
		limits.MaxPayloadBytes > 0 && limits.MaxPayloadBytes <= hardMaxPayloadBytes &&
		limits.MaxDedupKeyBytes > 0 && limits.MaxDedupKeyBytes <= hardMaxDedupKeyBytes &&
		limits.MaxDiagnostics > 0 && limits.MaxDiagnostics <= hardMaxDiagnostics &&
		limits.MaxCooldownKeys > 0 && limits.MaxCooldownKeys <= hardMaxCooldownKeys &&
		limits.MaxPriorityBurst > 0 && limits.MaxPriorityBurst <= hardMaxPriorityBurst
}

// Observe replaces the current proof used for both admission and emission.
// Any epoch, identity or source boundary cancels queued work synchronously.
func (scheduler *Scheduler) Observe(evidence Evidence) []PolicyOutcome {
	var outcomes []PolicyOutcome
	now := scheduler.clock.NowMS()
	reason := validateEvidenceEnvelope(evidence, now)
	boundaryDetected := false
	if reason == "" && scheduler.hasEvidence && scheduler.evidenceErr == "" {
		boundary, err := engineerprojection.ClassifyBoundary(scheduler.evidence.Context, evidence.Context)
		if err != nil || boundary.CancelsPending() {
			boundaryDetected = true
			reason := ReasonIdentityChanged
			if err == nil && boundary == engineerprojection.BoundaryEpochReset {
				reason = ReasonEpochReset
			}
			outcomes = scheduler.cancelAll(reason)
		}
	}
	if reason != "" && len(scheduler.pending) != 0 {
		outcomes = append(outcomes, scheduler.cancelAll(reason)...)
	}
	if boundaryDetected || !evidence.Source.Available() {
		scheduler.clearCooldowns()
		scheduler.priorityRun = 0
	}
	if reason != "" {
		scheduler.priorityRun = 0
	}
	if reason == "" {
		evidence.ReadyFamilies = append([]Family(nil), evidence.ReadyFamilies...)
		scheduler.evidence = evidence
	} else {
		// Invalid evidence is untrusted and may contain arbitrarily large
		// strings or slices. Retain only the bounded reason, never its envelope.
		scheduler.evidence = Evidence{}
	}
	scheduler.evidenceErr = reason
	scheduler.hasEvidence = true
	return outcomes
}

// Cancel invalidates every pending candidate at an explicit lifecycle
// boundary such as session.started, connection loss or driver change.
func (scheduler *Scheduler) Cancel(reason Reason) []PolicyOutcome {
	if !knownCancelReason(reason) {
		reason = ReasonLifecycleBoundary
	}
	outcomes := scheduler.cancelAll(reason)
	scheduler.clearCooldowns()
	scheduler.evidence = Evidence{}
	scheduler.evidenceErr = ReasonSourceUnavailable
	scheduler.hasEvidence = false
	scheduler.priorityRun = 0
	return outcomes
}

// Submit validates and copies a candidate. Accepted candidates have no outcome
// yet; returned outcomes describe rejected, coalesced or preempted candidates.
func (scheduler *Scheduler) Submit(candidate Candidate) (bool, []PolicyOutcome) {
	now := scheduler.clock.NowMS()
	if reason := scheduler.validateCandidate(candidate, now); reason != "" {
		return false, []PolicyOutcome{scheduler.outcome(candidate, OutcomeUnavailable, reason, now)}
	}
	key := dedupKey(candidate)
	if len(key) > scheduler.limits.MaxDedupKeyBytes {
		return false, []PolicyOutcome{scheduler.outcome(candidate, OutcomeUnavailable, ReasonDedupKeyLimit, now)}
	}
	if scheduler.cooldownActive(key, cooldownFor(candidate), now) {
		return false, []PolicyOutcome{scheduler.outcome(candidate, OutcomeSuppressed, ReasonCooldownActive, now)}
	}

	var outcomes []PolicyOutcome
	if len(scheduler.pending) == scheduler.limits.MaxPending {
		outcomes = scheduler.pruneInvalidPending(now)
	}
	for index := 0; index < len(scheduler.pending); index++ {
		if dedupKey(scheduler.pending[index].candidate) != key {
			continue
		}
		outcomes = append(outcomes, scheduler.outcome(scheduler.pending[index].candidate, OutcomeSuppressed, ReasonCoalesced, now))
		scheduler.removePending(index)
		break
	}

	if candidate.Priority == PrioritySpotter {
		kept := scheduler.pending[:0]
		for _, queued := range scheduler.pending {
			if queued.candidate.Priority < PrioritySpotter {
				outcomes = append(outcomes, scheduler.outcome(queued.candidate, OutcomeCancelled, ReasonPreemptedBySpotter, now))
				continue
			}
			kept = append(kept, queued)
		}
		clear(scheduler.pending[len(kept):])
		scheduler.pending = kept
	}

	if len(scheduler.pending) == scheduler.limits.MaxPending {
		worst := scheduler.worstIndex()
		if worst < 0 || scheduler.pending[worst].candidate.Priority >= candidate.Priority {
			outcomes = append(outcomes, scheduler.outcome(candidate, OutcomeSuppressed, ReasonQueuePressure, now))
			return false, outcomes
		}
		outcomes = append(outcomes, scheduler.outcome(scheduler.pending[worst].candidate, OutcomeSuppressed, ReasonQueuePressure, now))
		scheduler.removePending(worst)
	}

	scheduler.next++
	scheduler.pending = append(scheduler.pending, queuedCandidate{candidate: cloneCandidate(candidate), sequence: scheduler.next})
	scheduler.state.Accepted++
	scheduler.state.Pending = len(scheduler.pending)
	return true, outcomes
}

// pruneInvalidPending removes facts that the latest observation has already
// disproved before a current fact competes for bounded queue capacity. This is
// especially important for equal-priority state transitions such as
// car_left -> all_clear: obsolete safety state must not evict its replacement.
func (scheduler *Scheduler) pruneInvalidPending(now int64) []PolicyOutcome {
	var outcomes []PolicyOutcome
	for index := 0; index < len(scheduler.pending); {
		candidate := scheduler.pending[index].candidate
		state, reason := scheduler.revalidate(candidate, now)
		if reason == "" {
			index++
			continue
		}
		outcomes = append(outcomes, scheduler.outcome(candidate, state, reason, now))
		scheduler.removePending(index)
	}
	scheduler.state.Pending = len(scheduler.pending)
	return outcomes
}

// Next returns at most one decision. It discards and reports every invalid
// candidate encountered before that decision, so expired work never leaks as
// late audio.
func (scheduler *Scheduler) Next() (Decision, []PolicyOutcome, bool) {
	var outcomes []PolicyOutcome
	for len(scheduler.pending) != 0 {
		sort.SliceStable(scheduler.pending, func(left, right int) bool {
			a := scheduler.pending[left]
			b := scheduler.pending[right]
			if a.candidate.Priority != b.candidate.Priority {
				return a.candidate.Priority > b.candidate.Priority
			}
			if a.candidate.CreatedAtMS != b.candidate.CreatedAtMS {
				return a.candidate.CreatedAtMS < b.candidate.CreatedAtMS
			}
			return a.sequence < b.sequence
		})
		index := scheduler.nextIndex()
		queued := scheduler.removePending(index)
		scheduler.state.Pending = len(scheduler.pending)
		now := scheduler.clock.NowMS()
		if state, reason := scheduler.revalidate(queued.candidate, now); reason != "" {
			outcomes = append(outcomes, scheduler.outcome(queued.candidate, state, reason, now))
			continue
		}
		decision := decisionFrom(queued.candidate)
		scheduler.recordPriorityChoice(index, queued.candidate.Priority)
		scheduler.rememberCooldown(dedupKey(queued.candidate), cooldownFor(queued.candidate), now)
		outcomes = append(outcomes, scheduler.outcome(queued.candidate, OutcomeEmitted, ReasonCandidateEmitted, now))
		return decision, outcomes, true
	}
	return Decision{}, outcomes, false
}

func (scheduler *Scheduler) State() SchedulerState {
	result := scheduler.state
	result.Pending = len(scheduler.pending)
	result.Recent = append([]PolicyOutcome(nil), scheduler.recent...)
	return result
}

func (scheduler *Scheduler) validateCandidate(candidate Candidate, now int64) Reason {
	if candidate.Version != ContractVersionV1 {
		return ReasonUnknownContractVersion
	}
	if candidate.CanonicalVersion != schema.CanonicalVersionV1 {
		return ReasonUnknownCanonicalVersion
	}
	versionPolicy := projection.VersionPolicy{Current: engineerprojection.CurrentVersion, MinimumSupported: engineerprojection.MinimumSupportedVersion}
	if versionPolicy.Validate(candidate.ProjectionVersion) != nil {
		return ReasonUnknownProjectionVersion
	}
	if len(candidate.ID) == 0 || len(candidate.ID) > hardMaxIDBytes ||
		len(candidate.Family) == 0 || len(candidate.Family) > hardMaxFamilyBytes ||
		len(candidate.Intent) == 0 || len(candidate.Intent) > hardMaxIntentBytes ||
		len(candidate.Subject) == 0 || len(candidate.Subject) > hardMaxSubjectBytes ||
		containsNUL(candidate.ID) || containsNUL(string(candidate.Family)) ||
		containsNUL(candidate.Intent) || containsNUL(candidate.Subject) ||
		!validContext(candidate.Context) ||
		candidate.Context.Epoch == 0 || candidate.Context.Identity.Event == "" ||
		candidate.Context.Identity.Session == "" || candidate.Context.Identity.Vehicle == "" ||
		candidate.Context.Identity.Driver == "" || candidate.CreatedAtMS < 0 ||
		candidate.CreatedAtMS > now || candidate.ExpiresAtMS <= candidate.CreatedAtMS {
		return ReasonInvalidCandidate
	}
	if len(candidate.Payload) > scheduler.limits.MaxPayloadItems || payloadBytes(candidate.Payload) > scheduler.limits.MaxPayloadBytes {
		return ReasonPayloadLimit
	}
	priority, ok := approvedPriority(candidate.Family, candidate.Intent)
	if !ok {
		return ReasonDecisionNotApproved
	}
	if priority != candidate.Priority {
		return ReasonPriorityMismatch
	}
	if !validSemanticClaim(candidate.Intent, candidate.Semantic) {
		return ReasonInvalidCandidate
	}
	if reason := scheduler.validateEvidence(candidate, now); reason != "" {
		return reason
	}
	if now >= candidate.ExpiresAtMS {
		return ReasonDeadlineElapsed
	}
	return ""
}

func (scheduler *Scheduler) revalidate(candidate Candidate, now int64) (OutcomeState, Reason) {
	if now >= candidate.ExpiresAtMS {
		return OutcomeExpired, ReasonDeadlineElapsed
	}
	if reason := scheduler.validateEvidence(candidate, now); reason != "" {
		switch reason {
		case ReasonEvidenceStale:
			return OutcomeExpired, reason
		case ReasonIdentityChanged, ReasonEpochReset, ReasonSourceUnavailable, ReasonSemanticInvalidated:
			return OutcomeCancelled, reason
		default:
			return OutcomeUnavailable, reason
		}
	}
	if scheduler.cooldownActive(dedupKey(candidate), cooldownFor(candidate), now) {
		return OutcomeSuppressed, ReasonCooldownActive
	}
	return "", ""
}

func (scheduler *Scheduler) validateEvidence(candidate Candidate, now int64) Reason {
	if !scheduler.hasEvidence {
		return ReasonSourceUnavailable
	}
	if scheduler.evidenceErr != "" {
		return scheduler.evidenceErr
	}
	evidence := scheduler.evidence
	if reason := validateEvidenceAtTime(evidence, now); reason != "" {
		return reason
	}
	if candidate.CanonicalVersion != evidence.CanonicalVersion {
		return ReasonUnknownCanonicalVersion
	}
	if candidate.ProjectionVersion != evidence.ProjectionVersion {
		return ReasonUnknownProjectionVersion
	}
	if candidate.Context.Epoch != evidence.Context.Epoch {
		return ReasonEpochReset
	}
	if candidate.Context.Identity != evidence.Context.Identity {
		return ReasonIdentityChanged
	}
	for _, capability := range requiredCapabilities(candidate.Family) {
		if evidence.Manifest.State(capability) != engineerprojection.CapabilitySupported {
			return ReasonCapabilityUnavailable
		}
	}
	if !familyReady(evidence.ReadyFamilies, candidate.Family) {
		return ReasonEvidenceNotReady
	}
	if !semanticClaimMatches(candidate.Semantic, evidence.Semantic) {
		return ReasonSemanticInvalidated
	}
	return ""
}

func validateEvidenceEnvelope(evidence Evidence, now int64) Reason {
	if reason := validateEvidenceAtTime(evidence, now); reason != "" {
		return reason
	}
	if len(evidence.ReadyFamilies) > hardMaxReadyFamilies || !validReadyFamilies(evidence.ReadyFamilies) {
		return ReasonEvidenceNotReady
	}
	entries := evidence.Manifest.Entries()
	if len(entries) > hardMaxManifestItems || manifestBytes(entries) > hardMaxManifestBytes {
		return ReasonEvidenceNotReady
	}
	return ""
}

// validateEvidenceAtTime rechecks the scalar proof that can become invalid as
// the injected clock advances. Collection shape is validated once in Observe;
// stored Manifest is immutable and ReadyFamilies is owned by the scheduler.
func validateEvidenceAtTime(evidence Evidence, now int64) Reason {
	if evidence.CanonicalVersion != schema.CanonicalVersionV1 {
		return ReasonUnknownCanonicalVersion
	}
	versionPolicy := projection.VersionPolicy{Current: engineerprojection.CurrentVersion, MinimumSupported: engineerprojection.MinimumSupportedVersion}
	if versionPolicy.Validate(evidence.ProjectionVersion) != nil {
		return ReasonUnknownProjectionVersion
	}
	if !validContext(evidence.Context) || evidence.Context.Epoch == 0 || evidence.Context.Identity.Event == "" ||
		evidence.Context.Identity.Session == "" || evidence.Context.Identity.Vehicle == "" ||
		evidence.Context.Identity.Driver == "" {
		return ReasonIdentityChanged
	}
	if !evidence.Source.Available() {
		return ReasonSourceUnavailable
	}
	if evidence.FreshUntilMS <= now {
		return ReasonEvidenceStale
	}
	return ""
}

func validContext(context engineerprojection.Context) bool {
	identity := context.Identity
	parts := []string{
		string(identity.Event), string(identity.Session), string(identity.Vehicle),
		string(identity.Team), string(identity.Driver),
	}
	for _, part := range parts {
		if len(part) > hardMaxIdentityBytes || containsNUL(part) {
			return false
		}
	}
	return true
}

func containsNUL(value string) bool {
	return strings.IndexByte(value, 0) >= 0
}

func validSemanticClaim(intent string, claim SemanticClaim) bool {
	expected, ok := semanticRuleForIntent(intent)
	if !ok || claim.Rule != expected || !finiteNonNegative(claim.Primary) || !finiteNonNegative(claim.Secondary) {
		return false
	}
	switch claim.Rule {
	case SemanticFuelNotRefuelled:
		return claim.HasPrimary && !claim.HasSecondary
	case SemanticPenaltyOutstanding, SemanticLapCurrent:
		return claim.Integer >= 0 && !claim.HasPrimary && !claim.HasSecondary
	case SemanticTimingUnchanged:
		return claim.HasPrimary || claim.HasSecondary
	default:
		return !claim.HasPrimary && !claim.HasSecondary && claim.Integer == 0
	}
}

func finiteNonNegative(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0
}

func semanticRuleForIntent(intent string) (SemanticRule, bool) {
	switch intent {
	case IntentSpotterCarLeft:
		return SemanticSpotterLeftActive, true
	case IntentSpotterCarRight:
		return SemanticSpotterRightActive, true
	case IntentSpotterStillThere:
		return SemanticSpotterAnyActive, true
	case IntentSpotterClearLeft:
		return SemanticSpotterLeftClear, true
	case IntentSpotterClearRight:
		return SemanticSpotterRightClear, true
	case IntentSpotterAllClear:
		return SemanticSpotterAllClear, true
	case IntentSpotterThreeWide:
		return SemanticSpotterBothActive, true
	case IntentFuelHalfTank:
		return SemanticFuelHalfTank, true
	case IntentFuelOneLitre:
		return SemanticFuelAtMostOneLitre, true
	case IntentFuelTwoLitres:
		return SemanticFuelAtMostTwoLitres, true
	case IntentFuelLapsFour, IntentFuelLapsThree, IntentFuelLapsTwo, IntentFuelLapsOne, IntentFuelPitNow:
		return SemanticFuelNotRefuelled, true
	case IntentPenaltyCountIncreased:
		return SemanticPenaltyOutstanding, true
	case IntentLapCompleted:
		return SemanticLapCurrent, true
	case IntentTimingGapReport:
		return SemanticTimingUnchanged, true
	case IntentPitEntry:
		return SemanticInPit, true
	case IntentPitExit:
		return SemanticOutOfPit, true
	default:
		return SemanticUnknown, false
	}
}

func semanticClaimMatches(claim SemanticClaim, evidence SemanticEvidence) bool {
	switch claim.Rule {
	case SemanticSpotterLeftActive:
		return evidence.SpotterKnown && evidence.SpotterLeft
	case SemanticSpotterRightActive:
		return evidence.SpotterKnown && evidence.SpotterRight
	case SemanticSpotterAnyActive:
		return evidence.SpotterKnown && (evidence.SpotterLeft || evidence.SpotterRight)
	case SemanticSpotterBothActive:
		return evidence.SpotterKnown && evidence.SpotterLeft && evidence.SpotterRight
	case SemanticSpotterLeftClear:
		return evidence.SpotterKnown && !evidence.SpotterLeft
	case SemanticSpotterRightClear:
		return evidence.SpotterKnown && !evidence.SpotterRight
	case SemanticSpotterAllClear:
		return evidence.SpotterKnown && !evidence.SpotterLeft && !evidence.SpotterRight
	case SemanticFuelHalfTank:
		return evidence.FuelKnown && evidence.FuelCapacityKnown &&
			evidence.FuelCapacity > 0 && evidence.FuelLitres <= evidence.FuelCapacity/2
	case SemanticFuelAtMostOneLitre:
		return evidence.FuelKnown && evidence.FuelLitres <= 1
	case SemanticFuelAtMostTwoLitres:
		return evidence.FuelKnown && evidence.FuelLitres <= 2
	case SemanticFuelNotRefuelled:
		return evidence.FuelKnown && claim.HasPrimary && evidence.FuelLitres <= claim.Primary+0.01
	case SemanticPenaltyOutstanding:
		return evidence.PenaltyKnown && claim.Integer > 0 && evidence.PenaltyCount >= claim.Integer
	case SemanticLapCurrent:
		return evidence.LapKnown && evidence.LapNumber == claim.Integer
	case SemanticTimingUnchanged:
		if claim.HasPrimary && (!evidence.GapLeaderKnown || math.Abs(evidence.GapLeader-claim.Primary) > 0.05) {
			return false
		}
		if claim.HasSecondary && (!evidence.GapNextKnown || math.Abs(evidence.GapNext-claim.Secondary) > 0.05) {
			return false
		}
		return true
	case SemanticInPit:
		return evidence.PitKnown && evidence.InPit
	case SemanticOutOfPit:
		return evidence.PitKnown && !evidence.InPit
	default:
		return false
	}
}

func manifestBytes(entries []engineerprojection.Capability) int {
	total := 0
	for _, capability := range entries {
		total += len(capability.ID) + 1
	}
	return total
}

func validReadyFamilies(families []Family) bool {
	for index, family := range families {
		if len(requiredCapabilities(family)) == 0 {
			return false
		}
		for previous := 0; previous < index; previous++ {
			if families[previous] == family {
				return false
			}
		}
	}
	return true
}

func familyReady(families []Family, target Family) bool {
	for _, family := range families {
		if family == target {
			return true
		}
	}
	return false
}

func approvedPriority(family Family, intent string) (Priority, bool) {
	switch family {
	case FamilySpotter:
		switch intent {
		case IntentSpotterCarLeft, IntentSpotterCarRight, IntentSpotterStillThere,
			IntentSpotterClearLeft, IntentSpotterClearRight, IntentSpotterAllClear, IntentSpotterThreeWide:
			return PrioritySpotter, true
		}
	case FamilyFuel:
		switch intent {
		case IntentFuelHalfTank, IntentFuelOneLitre, IntentFuelTwoLitres,
			IntentFuelLapsFour, IntentFuelLapsThree, IntentFuelLapsTwo,
			IntentFuelLapsOne, IntentFuelPitNow:
			return PriorityFailureResource, true
		}
	case FamilyPenalties:
		if intent == IntentPenaltyCountIncreased {
			return PriorityPenalty, true
		}
	case FamilyLaps:
		if intent == IntentLapCompleted {
			return PriorityInformation, true
		}
	case FamilyTimings:
		if intent == IntentTimingGapReport {
			return PriorityInformation, true
		}
	case FamilyPitStops:
		if intent == IntentPitEntry || intent == IntentPitExit {
			return PriorityInformation, true
		}
	}
	return 0, false
}

func requiredCapabilities(family Family) []engineerprojection.CapabilityID {
	switch family {
	case FamilySpotter:
		return []engineerprojection.CapabilityID{engineerprojection.CapabilityStandings, engineerprojection.CapabilityControls, engineerprojection.CapabilityPit, engineerprojection.CapabilitySpatial}
	case FamilyFuel:
		return []engineerprojection.CapabilityID{engineerprojection.CapabilitySession, engineerprojection.CapabilityStandings, engineerprojection.CapabilityFuel}
	case FamilyPenalties:
		return []engineerprojection.CapabilityID{engineerprojection.CapabilityStandings}
	case FamilyLaps:
		return []engineerprojection.CapabilityID{engineerprojection.CapabilitySession, engineerprojection.CapabilityStandings}
	case FamilyTimings:
		return []engineerprojection.CapabilityID{engineerprojection.CapabilitySession, engineerprojection.CapabilityStandings, engineerprojection.CapabilityGaps}
	case FamilyPitStops:
		return []engineerprojection.CapabilityID{engineerprojection.CapabilitySession, engineerprojection.CapabilityStandings, engineerprojection.CapabilityControls, engineerprojection.CapabilityPit}
	default:
		return nil
	}
}

func cooldownFor(candidate Candidate) int64 {
	switch candidate.Family {
	case FamilyFuel:
		return 30_000
	case FamilyTimings:
		return 60_000
	case FamilyPenalties:
		return 5_000
	case FamilyPitStops:
		return 1_000
	case FamilySpotter:
		if candidate.Intent == IntentSpotterStillThere {
			return 350
		}
	}
	return 0
}

func (scheduler *Scheduler) cooldownActive(key string, duration, now int64) bool {
	if duration <= 0 {
		return false
	}
	for _, entry := range scheduler.cooldowns {
		if entry.key == key {
			return now < entry.emittedAt || now-entry.emittedAt < duration
		}
	}
	return false
}

func (scheduler *Scheduler) rememberCooldown(key string, duration, now int64) {
	if duration == 0 {
		return
	}
	scheduler.next++
	for index := range scheduler.cooldowns {
		if scheduler.cooldowns[index].key == key {
			scheduler.cooldowns[index].emittedAt = now
			scheduler.cooldowns[index].sequence = scheduler.next
			return
		}
	}
	if len(scheduler.cooldowns) == scheduler.limits.MaxCooldownKeys {
		oldest := 0
		for index := 1; index < len(scheduler.cooldowns); index++ {
			if scheduler.cooldowns[index].sequence < scheduler.cooldowns[oldest].sequence {
				oldest = index
			}
		}
		copy(scheduler.cooldowns[oldest:], scheduler.cooldowns[oldest+1:])
		last := len(scheduler.cooldowns) - 1
		scheduler.cooldowns[last] = cooldownEntry{}
		scheduler.cooldowns = scheduler.cooldowns[:last]
	}
	scheduler.cooldowns = append(scheduler.cooldowns, cooldownEntry{key: key, emittedAt: now, sequence: scheduler.next})
}

func (scheduler *Scheduler) clearCooldowns() {
	clear(scheduler.cooldowns)
	scheduler.cooldowns = scheduler.cooldowns[:0]
}

func (scheduler *Scheduler) worstIndex() int {
	if len(scheduler.pending) == 0 {
		return -1
	}
	worst := 0
	for index := 1; index < len(scheduler.pending); index++ {
		left := scheduler.pending[index]
		right := scheduler.pending[worst]
		if left.candidate.Priority < right.candidate.Priority ||
			(left.candidate.Priority == right.candidate.Priority && left.sequence > right.sequence) {
			worst = index
		}
	}
	return worst
}

// nextIndex preserves strict priority for critical Spotter work. For all
// lower priorities it allows at most MaxPriorityBurst consecutive selections
// while older lower-priority work is waiting, preventing an informational
// candidate from waiting forever under a sustained non-critical stream.
func (scheduler *Scheduler) nextIndex() int {
	if len(scheduler.pending) == 0 || scheduler.pending[0].candidate.Priority == PrioritySpotter ||
		scheduler.priorityRun < scheduler.limits.MaxPriorityBurst {
		return 0
	}
	top := scheduler.pending[0].candidate.Priority
	selected := -1
	for index := 1; index < len(scheduler.pending); index++ {
		candidate := scheduler.pending[index]
		if candidate.candidate.Priority >= top {
			continue
		}
		if selected < 0 || candidate.candidate.CreatedAtMS < scheduler.pending[selected].candidate.CreatedAtMS ||
			(candidate.candidate.CreatedAtMS == scheduler.pending[selected].candidate.CreatedAtMS && candidate.sequence < scheduler.pending[selected].sequence) {
			selected = index
		}
	}
	if selected >= 0 {
		return selected
	}
	return 0
}

func (scheduler *Scheduler) recordPriorityChoice(index int, selected Priority) {
	if selected == PrioritySpotter || index > 0 {
		scheduler.priorityRun = 0
		return
	}
	for _, queued := range scheduler.pending {
		if queued.candidate.Priority < selected {
			scheduler.priorityRun++
			return
		}
	}
	scheduler.priorityRun = 0
}

func (scheduler *Scheduler) removePending(index int) queuedCandidate {
	removed := scheduler.pending[index]
	copy(scheduler.pending[index:], scheduler.pending[index+1:])
	last := len(scheduler.pending) - 1
	scheduler.pending[last] = queuedCandidate{}
	scheduler.pending = scheduler.pending[:last]
	return removed
}

func (scheduler *Scheduler) cancelAll(reason Reason) []PolicyOutcome {
	now := scheduler.clock.NowMS()
	outcomes := make([]PolicyOutcome, 0, len(scheduler.pending))
	for _, queued := range scheduler.pending {
		outcomes = append(outcomes, scheduler.outcome(queued.candidate, OutcomeCancelled, reason, now))
	}
	clear(scheduler.pending)
	scheduler.pending = scheduler.pending[:0]
	scheduler.state.Pending = 0
	return outcomes
}

func (scheduler *Scheduler) outcome(candidate Candidate, state OutcomeState, reason Reason, at int64) PolicyOutcome {
	if !knownReason(reason) {
		reason = ReasonLifecycleBoundary
	}
	outcome := PolicyOutcome{
		Version:     ContractVersionV1,
		State:       state,
		Reason:      reason,
		CandidateID: boundedDiagnostic(candidate.ID, hardMaxIDBytes),
		Family:      Family(boundedDiagnostic(string(candidate.Family), hardMaxFamilyBytes)),
		Intent:      boundedDiagnostic(candidate.Intent, hardMaxIntentBytes),
		AtMS:        at,
		ExpiresAtMS: candidate.ExpiresAtMS,
	}
	switch state {
	case OutcomeEmitted:
		scheduler.state.Emitted++
	case OutcomeSuppressed:
		scheduler.state.Suppressed++
	case OutcomeExpired:
		scheduler.state.Expired++
	case OutcomeCancelled:
		scheduler.state.Cancelled++
	case OutcomeUnavailable:
		scheduler.state.Unavailable++
	}
	if len(scheduler.recent) == scheduler.limits.MaxDiagnostics {
		copy(scheduler.recent, scheduler.recent[1:])
		scheduler.recent[len(scheduler.recent)-1] = PolicyOutcome{}
		scheduler.recent = scheduler.recent[:len(scheduler.recent)-1]
	}
	scheduler.recent = append(scheduler.recent, outcome)
	return outcome
}

func cloneCandidate(candidate Candidate) Candidate {
	candidate.Payload = clonePayload(candidate.Payload)
	return candidate
}

func decisionFrom(candidate Candidate) Decision {
	return Decision{
		Version:     ContractVersionV1,
		CandidateID: candidate.ID,
		Family:      candidate.Family,
		Intent:      candidate.Intent,
		Subject:     candidate.Subject,
		Priority:    candidate.Priority,
		CreatedAtMS: candidate.CreatedAtMS,
		ExpiresAtMS: candidate.ExpiresAtMS,
		Context:     candidate.Context,
		Semantic:    candidate.Semantic,
		Payload:     clonePayload(candidate.Payload),
	}
}

func clonePayload(payload map[string]string) map[string]string {
	if len(payload) == 0 {
		return nil
	}
	result := make(map[string]string, len(payload))
	for key, value := range payload {
		result[key] = value
	}
	return result
}

func payloadBytes(payload map[string]string) int {
	total := 0
	for key, value := range payload {
		total += len(key) + len(value)
	}
	return total
}

func dedupKey(candidate Candidate) string {
	return candidate.Intent + "\x00" + candidate.Subject
}

func boundedDiagnostic(value string, maximum int) string {
	if len(value) > maximum || containsNUL(value) {
		return ""
	}
	return value
}

func knownReason(reason Reason) bool {
	switch reason {
	case ReasonCandidateEmitted, ReasonDeadlineElapsed, ReasonEvidenceStale,
		ReasonEpochReset, ReasonIdentityChanged, ReasonLifecycleBoundary,
		ReasonSourceUnavailable, ReasonUnknownContractVersion,
		ReasonUnknownProjectionVersion, ReasonUnknownCanonicalVersion,
		ReasonCapabilityUnavailable, ReasonEvidenceNotReady,
		ReasonDecisionNotApproved, ReasonPriorityMismatch,
		ReasonInvalidCandidate, ReasonPayloadLimit, ReasonDedupKeyLimit,
		ReasonCoalesced, ReasonCooldownActive, ReasonPreemptedBySpotter,
		ReasonQueuePressure, ReasonSemanticInvalidated:
		return true
	default:
		return false
	}
}

func knownCancelReason(reason Reason) bool {
	switch reason {
	case ReasonEpochReset, ReasonIdentityChanged, ReasonLifecycleBoundary,
		ReasonSourceUnavailable, ReasonEvidenceStale:
		return true
	default:
		return false
	}
}
