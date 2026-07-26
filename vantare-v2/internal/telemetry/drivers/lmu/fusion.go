package lmu

import (
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

const MatrixVersion uint16 = 1

type FieldID string

const (
	FieldSourceTime     FieldID = "session.source-time"
	FieldTrackName      FieldID = "session.track-name"
	FieldSessionType    FieldID = "session.type"
	FieldVehicleCount   FieldID = "session.vehicle-count"
	FieldPlayerPresent  FieldID = "vehicle.player-present"
	FieldVehicleName    FieldID = "vehicle.name"
	FieldLapNumber      FieldID = "session.lap-number"
	FieldGear           FieldID = "vehicle.gear"
	FieldEngineRPM      FieldID = "vehicle.engine-rpm"
	FieldSpeedMPS       FieldID = "vehicle.speed-mps"
	FieldControls       FieldID = "controls.inputs"
	FieldPlayerPosition FieldID = "standings.player-position"
	FieldCompletedLaps  FieldID = "standings.completed-laps"
	FieldPitStopCount   FieldID = "pit.stop-count"
)

type AuthorityRule struct {
	Field          FieldID
	Preferred      ObservationSource
	Alternative    ObservationSource
	Equivalent     bool
	PreferredTTL   time.Duration
	AlternativeTTL time.Duration
}

var authorityMatrixV1 = [...]AuthorityRule{
	{FieldSourceTime, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{FieldTrackName, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{FieldSessionType, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{FieldVehicleCount, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{FieldPlayerPresent, SourceSharedMemory, SourceREST, true, defaultFreshnessLimit, defaultRESTTTL},
	{FieldVehicleName, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{FieldLapNumber, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{FieldGear, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{FieldEngineRPM, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{FieldSpeedMPS, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{FieldControls, SourceSharedMemory, SourceUnknown, false, defaultFreshnessLimit, 0},
	{FieldPlayerPosition, SourceREST, SourceUnknown, false, defaultRESTTTL, 0},
	{FieldCompletedLaps, SourceREST, SourceUnknown, false, defaultRESTTTL, 0},
	{FieldPitStopCount, SourceREST, SourceUnknown, false, defaultRESTTTL, 0},
}

func AuthorityMatrix() []AuthorityRule {
	result := make([]AuthorityRule, len(authorityMatrixV1))
	copy(result, authorityMatrixV1[:])
	return result
}

type FieldDecision struct {
	Field     FieldID
	Source    ObservationSource
	Freshness schema.Freshness
	Fallback  bool
}

type ConflictDiagnostic struct {
	Field       FieldID
	Preferred   ObservationSource
	Alternative ObservationSource
}

// Fusion is single-writer state owned by one Driver.Run. It retains only the
// latest typed observation from each source; it never retains raw payloads.
type Fusion struct {
	shared    Observation
	hasShared bool
	rest      Observation
	hasREST   bool
}

func (fusion *Fusion) Merge(now time.Time, inputs ...Observation) Observation {
	now = now.Round(0).UTC()
	for _, input := range inputs {
		switch input.Source {
		case SourceSharedMemory:
			if !fusion.hasShared || !input.ReceivedUTC.Before(fusion.shared.ReceivedUTC) {
				fusion.shared, fusion.hasShared = input, true
			}
		case SourceREST:
			if !fusion.hasREST || !input.ReceivedUTC.Before(fusion.rest.ReceivedUTC) {
				fusion.rest, fusion.hasREST = input, true
			}
		}
	}

	result := Observation{
		Source:        SourceCanonical,
		ReceivedUTC:   now,
		MatrixVersion: MatrixVersion,
		Decisions:     make([]FieldDecision, 0, len(authorityMatrixV1)),
		Conflicts:     make([]ConflictDiagnostic, 0, 5),
	}
	if fusion.hasShared {
		result.Compatibility = fusion.shared.Compatibility
		result.Fingerprint = fusion.shared.Fingerprint
		result.ClockChange = fusion.shared.ClockChange
	}
	result.SourceTime = chooseField(fusion, now, authorityMatrixV1[0], fusion.shared.SourceTime, fusion.shared.ReceivedUTC, fusion.rest.REST.SourceTime.Field, fusion.rest.REST.SourceTime.UpdatedUTC, &result)
	result.TrackName = chooseField(fusion, now, authorityMatrixV1[1], fusion.shared.TrackName, fusion.shared.ReceivedUTC, fusion.rest.REST.TrackName.Field, fusion.rest.REST.TrackName.UpdatedUTC, &result)
	result.SessionType = chooseField(fusion, now, authorityMatrixV1[2], fusion.shared.SessionType, fusion.shared.ReceivedUTC, fusion.rest.REST.SessionType.Field, fusion.rest.REST.SessionType.UpdatedUTC, &result)
	result.VehicleCount = chooseField(fusion, now, authorityMatrixV1[3], fusion.shared.VehicleCount, fusion.shared.ReceivedUTC, fusion.rest.REST.VehicleCount.Field, fusion.rest.REST.VehicleCount.UpdatedUTC, &result)
	result.PlayerPresent = chooseField(fusion, now, authorityMatrixV1[4], fusion.shared.PlayerPresent, fusion.shared.ReceivedUTC, fusion.rest.REST.PlayerPresent.Field, fusion.rest.REST.PlayerPresent.UpdatedUTC, &result)
	result.VehicleName = choosePreferredOnly(now, authorityMatrixV1[5], fusion.shared.VehicleName, fusion.shared.ReceivedUTC, fusion.hasShared, &result)
	result.LapNumber = choosePreferredOnly(now, authorityMatrixV1[6], fusion.shared.LapNumber, fusion.shared.ReceivedUTC, fusion.hasShared, &result)
	result.Gear = choosePreferredOnly(now, authorityMatrixV1[7], fusion.shared.Gear, fusion.shared.ReceivedUTC, fusion.hasShared, &result)
	result.EngineRPM = choosePreferredOnly(now, authorityMatrixV1[8], fusion.shared.EngineRPM, fusion.shared.ReceivedUTC, fusion.hasShared, &result)
	result.SpeedMPS = choosePreferredOnly(now, authorityMatrixV1[9], fusion.shared.SpeedMPS, fusion.shared.ReceivedUTC, fusion.hasShared, &result)
	result.Controls = choosePreferredOnly(now, authorityMatrixV1[10], fusion.shared.Controls, fusion.shared.ReceivedUTC, fusion.hasShared, &result)
	result.PlayerPosition = choosePreferredOnly(now, authorityMatrixV1[11], fusion.rest.REST.PlayerPosition.Field, fusion.rest.REST.PlayerPosition.UpdatedUTC, fusion.hasREST, &result)
	result.CompletedLaps = choosePreferredOnly(now, authorityMatrixV1[12], fusion.rest.REST.CompletedLaps.Field, fusion.rest.REST.CompletedLaps.UpdatedUTC, fusion.hasREST, &result)
	result.PitStopCount = choosePreferredOnly(now, authorityMatrixV1[13], fusion.rest.REST.PitStopCount.Field, fusion.rest.REST.PitStopCount.UpdatedUTC, fusion.hasREST, &result)
	return result
}

func chooseField[T comparable](fusion *Fusion, now time.Time, rule AuthorityRule, preferred schema.Field[T], preferredUTC time.Time, alternative schema.Field[T], alternativeUTC time.Time, result *Observation) schema.Field[T] {
	preferred = fieldAt(now, preferredUTC, rule.PreferredTTL, preferred, fusion.hasShared)
	alternative = fieldAt(now, alternativeUTC, rule.AlternativeTTL, alternative, fusion.hasREST)
	preferredUsable := usable(preferred)
	alternativeUsable := usable(alternative)
	if preferredUsable && alternativeUsable && fieldsDiffer(preferred, alternative) {
		result.Conflicts = append(result.Conflicts, ConflictDiagnostic{Field: rule.Field, Preferred: rule.Preferred, Alternative: rule.Alternative})
	}
	switch {
	case preferredUsable:
		appendDecision(result, rule, rule.Preferred, preferred.Freshness(), false)
		return preferred
	case rule.Equivalent && alternativeUsable:
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

func choosePreferredOnly[T comparable](now time.Time, rule AuthorityRule, field schema.Field[T], updated time.Time, sourcePresent bool, result *Observation) schema.Field[T] {
	field = fieldAt(now, updated, rule.PreferredTTL, field, sourcePresent)
	if hasValue(field) {
		appendDecision(result, rule, rule.Preferred, field.Freshness(), false)
		return field
	}
	appendDecision(result, rule, SourceUnknown, schema.FreshnessMissing, false)
	return schema.MissingField[T]()
}

func fieldAt[T comparable](now, updated time.Time, ttl time.Duration, field schema.Field[T], sourcePresent bool) schema.Field[T] {
	if !sourcePresent || !hasValue(field) || field.Freshness() != schema.FreshnessFresh {
		return field
	}
	if updated.IsZero() || now.Before(updated) || now.Sub(updated) > ttl {
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
	result.Decisions = append(result.Decisions, FieldDecision{Field: rule.Field, Source: source, Freshness: freshness, Fallback: fallback})
}
