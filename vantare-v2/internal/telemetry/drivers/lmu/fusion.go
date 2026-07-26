package lmu

import (
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/catalog"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const (
	MatrixVersion          uint16 = 2
	maxConflictDiagnostics        = 5
)

type AuthorityRule struct {
	Signal         catalog.SignalID
	Preferred      ObservationSource
	Alternative    ObservationSource
	Equivalent     bool
	PreferredTTL   time.Duration
	AlternativeTTL time.Duration
}

var authorityMatrixV2 = [...]AuthorityRule{
	{catalog.SignalSessionSourceTime, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalSessionTrackName, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalSessionType, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalSessionVehicleCount, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalVehiclePlayerPresent, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{catalog.SignalVehicleName, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalSessionLapNumber, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleGear, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleEngineRPM, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalVehicleSpeedMPS, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalControlsThrottle, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalControlsBrake, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalControlsClutch, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{catalog.SignalStandingsPosition, SourceREST, SourceUnknown, false, defaultRESTTTL, 0},
	{catalog.SignalStandingsCompletedLaps, SourceREST, SourceUnknown, false, defaultRESTTTL, 0},
	{catalog.SignalPitStopCount, SourceREST, SourceUnknown, false, defaultRESTTTL, 0},
	{catalog.SignalPitInPit, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
}

func AuthorityMatrix() []AuthorityRule {
	result := make([]AuthorityRule, len(authorityMatrixV2))
	copy(result, authorityMatrixV2[:])
	return result
}

type FieldDecision struct {
	Signal    catalog.SignalID
	Source    ObservationSource
	Freshness schema.Freshness
	Fallback  bool
}

type ConflictDiagnostic struct {
	Signal      catalog.SignalID
	Preferred   ObservationSource
	Alternative ObservationSource
}

type monotonicStamp struct {
	elapsed time.Duration
	set     bool
}

type fusionSource struct {
	observation Observation
	received    monotonicStamp
	sequence    uint64
}

// Fusion is single-writer state owned by one Driver.Run. UTC is output metadata
// only; arrival sequence orders inputs and monotonic elapsed time governs TTL.
type Fusion struct {
	shared   fusionSource
	rest     fusionSource
	sequence uint64
}

func (fusion *Fusion) Merge(receivedUTC time.Time, elapsed time.Duration, inputs ...Observation) Observation {
	for _, input := range inputs {
		fusion.sequence++
		state := fusionSource{observation: input, received: monotonicStamp{elapsed: elapsed, set: true}, sequence: fusion.sequence}
		switch input.Source {
		case SourceSharedMemory:
			fusion.shared = state
		case SourceREST:
			fusion.rest = state
		}
	}

	result := Observation{
		Source:        SourceCanonical,
		ReceivedUTC:   receivedUTC.Round(0).UTC(),
		MatrixVersion: MatrixVersion,
		Decisions:     make([]FieldDecision, 0, len(authorityMatrixV2)),
		Conflicts:     make([]ConflictDiagnostic, 0, maxConflictDiagnostics),
	}
	if fusion.shared.sequence != 0 {
		result.Compatibility = fusion.shared.observation.Compatibility
		result.Fingerprint = fusion.shared.observation.Fingerprint
		result.ClockChange = fusion.shared.observation.ClockChange
	}
	shm := fusion.shared.observation
	rest := fusion.rest.observation.REST
	shmStamp := fusion.shared.received
	result.SourceTime = chooseField(elapsed, authorityMatrixV2[0], shm.SourceTime, shmStamp, rest.SourceTime.Field, timedStamp(rest.SourceTime, fusion.rest.received), &result)
	result.TrackName = chooseField(elapsed, authorityMatrixV2[1], shm.TrackName, shmStamp, rest.TrackName.Field, timedStamp(rest.TrackName, fusion.rest.received), &result)
	result.SessionType = chooseField(elapsed, authorityMatrixV2[2], shm.SessionType, shmStamp, rest.SessionType.Field, timedStamp(rest.SessionType, fusion.rest.received), &result)
	result.VehicleCount = chooseField(elapsed, authorityMatrixV2[3], shm.VehicleCount, shmStamp, rest.VehicleCount.Field, timedStamp(rest.VehicleCount, fusion.rest.received), &result)
	result.PlayerPresent = chooseField(elapsed, authorityMatrixV2[4], shm.PlayerPresent, shmStamp, rest.PlayerPresent.Field, timedStamp(rest.PlayerPresent, fusion.rest.received), &result)
	result.VehicleName = choosePreferredOnly(elapsed, authorityMatrixV2[5], shm.VehicleName, shmStamp, &result)
	result.LapNumber = choosePreferredOnly(elapsed, authorityMatrixV2[6], shm.LapNumber, shmStamp, &result)
	result.Gear = choosePreferredOnly(elapsed, authorityMatrixV2[7], shm.Gear, shmStamp, &result)
	result.EngineRPM = choosePreferredOnly(elapsed, authorityMatrixV2[8], shm.EngineRPM, shmStamp, &result)
	result.SpeedMPS = choosePreferredOnly(elapsed, authorityMatrixV2[9], shm.SpeedMPS, shmStamp, &result)
	result.Throttle = choosePreferredOnly(elapsed, authorityMatrixV2[10], shm.Throttle, shmStamp, &result)
	result.Brake = choosePreferredOnly(elapsed, authorityMatrixV2[11], shm.Brake, shmStamp, &result)
	result.Clutch = choosePreferredOnly(elapsed, authorityMatrixV2[12], shm.Clutch, shmStamp, &result)
	result.PlayerPosition = choosePreferredOnly(elapsed, authorityMatrixV2[13], rest.PlayerPosition.Field, timedStamp(rest.PlayerPosition, fusion.rest.received), &result)
	result.CompletedLaps = choosePreferredOnly(elapsed, authorityMatrixV2[14], rest.CompletedLaps.Field, timedStamp(rest.CompletedLaps, fusion.rest.received), &result)
	result.PitStopCount = choosePreferredOnly(elapsed, authorityMatrixV2[15], rest.PitStopCount.Field, timedStamp(rest.PitStopCount, fusion.rest.received), &result)
	result.InPit = choosePreferredOnly(elapsed, authorityMatrixV2[16], shm.InPit, shmStamp, &result)
	return result
}

func timedStamp[T comparable](field TimedField[T], fallback monotonicStamp) monotonicStamp {
	if field.updatedMono.set {
		return field.updatedMono
	}
	return fallback
}

func chooseField[T comparable](elapsed time.Duration, rule AuthorityRule, preferred schema.Field[T], preferredAt monotonicStamp, alternative schema.Field[T], alternativeAt monotonicStamp, result *Observation) schema.Field[T] {
	preferred = fieldAt(elapsed, preferredAt, rule.PreferredTTL, preferred)
	alternative = fieldAt(elapsed, alternativeAt, rule.AlternativeTTL, alternative)
	if validUsable(preferred) && validUsable(alternative) && fieldsDiffer(preferred, alternative) {
		appendConflict(result, ConflictDiagnostic{Signal: rule.Signal, Preferred: rule.Preferred, Alternative: rule.Alternative})
	}
	switch {
	case usable(preferred):
		appendDecision(result, rule, rule.Preferred, preferred.Freshness(), false)
		return preferred
	case rule.Equivalent && usable(alternative):
		appendDecision(result, rule, rule.Alternative, alternative.Freshness(), true)
		return alternative
	case validStale(preferred):
		appendDecision(result, rule, rule.Preferred, preferred.Freshness(), false)
		return preferred
	case rule.Equivalent && validStale(alternative):
		appendDecision(result, rule, rule.Alternative, alternative.Freshness(), true)
		return alternative
	case hasValue(preferred):
		appendDecision(result, rule, rule.Preferred, preferred.Freshness(), false)
		return preferred
	case rule.Equivalent && hasValue(alternative):
		appendDecision(result, rule, rule.Alternative, alternative.Freshness(), true)
		return alternative
	default:
		appendDecision(result, rule, SourceUnknown, schema.FreshnessMissing, false)
		return schema.MissingField[T]()
	}
}

func choosePreferredOnly[T comparable](elapsed time.Duration, rule AuthorityRule, field schema.Field[T], updated monotonicStamp, result *Observation) schema.Field[T] {
	field = fieldAt(elapsed, updated, rule.PreferredTTL, field)
	if hasValue(field) {
		appendDecision(result, rule, rule.Preferred, field.Freshness(), false)
		return field
	}
	appendDecision(result, rule, SourceUnknown, schema.FreshnessMissing, false)
	return schema.MissingField[T]()
}

func fieldAt[T comparable](elapsed time.Duration, updated monotonicStamp, ttl time.Duration, field schema.Field[T]) schema.Field[T] {
	if !updated.set || !hasValue(field) || field.Freshness() != schema.FreshnessFresh {
		return field
	}
	if elapsed < updated.elapsed || elapsed-updated.elapsed > ttl {
		return copyFreshness(field, schema.FreshnessStale)
	}
	return field
}

func usable[T comparable](field schema.Field[T]) bool {
	_, present := field.Value()
	return present && field.Freshness() == schema.FreshnessFresh
}

func validStale[T comparable](field schema.Field[T]) bool {
	_, present := field.Value()
	return present && field.Freshness() == schema.FreshnessStale
}

func validUsable[T comparable](field schema.Field[T]) bool { return usable(field) || validStale(field) }

func hasValue[T comparable](field schema.Field[T]) bool {
	_, present := field.Value()
	return present
}

func fieldsDiffer[T comparable](left, right schema.Field[T]) bool {
	leftValue, leftPresent := left.Value()
	rightValue, rightPresent := right.Value()
	return leftPresent != rightPresent || (leftPresent && leftValue != rightValue)
}

func appendDecision(result *Observation, rule AuthorityRule, source ObservationSource, freshness schema.Freshness, fallback bool) {
	result.Decisions = append(result.Decisions, FieldDecision{Signal: rule.Signal, Source: source, Freshness: freshness, Fallback: fallback})
}

func appendConflict(result *Observation, diagnostic ConflictDiagnostic) {
	if len(result.Conflicts) < maxConflictDiagnostics {
		result.Conflicts = append(result.Conflicts, diagnostic)
	}
}
