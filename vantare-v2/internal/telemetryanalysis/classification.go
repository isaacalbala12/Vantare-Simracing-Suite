package telemetryanalysis

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// SimIDLMU is the simulator identity used by LMU historical sessions.
const SimIDLMU = "lmu"

var (
	ErrInvalidSessionClassification = errors.New("invalid historical session classification")
	ErrUnsupportedSessionSimulator  = errors.New("unsupported historical session simulator")
)

type SessionType string

const (
	SessionTypePractice SessionType = "practice"
	SessionTypeQualify  SessionType = "qualify"
	SessionTypeRace     SessionType = "race"
)

type SessionIdentificationStatus string

const (
	SessionStatusIdentifiedUsable    SessionIdentificationStatus = "identified_usable"
	SessionStatusIdentifiedNotUsable SessionIdentificationStatus = "identified_not_usable"
)

type DerivationFamily string

const (
	FamilySessionClassification    DerivationFamily = "session_classification"
	FamilyLapValidity              DerivationFamily = "lap_validity"
	FamilyFuelConsumption          DerivationFamily = "fuel_consumption"
	FamilyVirtualEnergyConsumption DerivationFamily = "virtual_energy_consumption"
	FamilyCombinedStintPaceCurve   DerivationFamily = "combined_stint_pace_curve"
	FamilyTyreDegradation          DerivationFamily = "tyre_degradation"
	FamilyPit                      DerivationFamily = "pit"
	FamilySavingCost               DerivationFamily = "saving_cost"
	FamilyClimateBuckets           DerivationFamily = "climate_buckets"
	FamilyObservedStrategy         DerivationFamily = "observed_strategy"
)

type UnusableReason string

const (
	UnusableReasonNoCompletedLap UnusableReason = "no_completed_lap"
	UnusableReasonNotRace        UnusableReason = "session_type_not_race"
)

// CombinationIdentity is the stable track, layout, car and class identity of a session.
type CombinationIdentity struct {
	ID          string `json:"id"`
	SimID       string `json:"simId"`
	TrackName   string `json:"trackName"`
	TrackLayout string `json:"trackLayout"`
	CarName     string `json:"carName"`
	CarClass    string `json:"carClass"`
}

// FamilyUsability reports the preliminary completed-lap gate for a derivation family.
// A later derivation may still reject a session when its required channels are absent.
type FamilyUsability struct {
	Family DerivationFamily `json:"family"`
	Usable bool             `json:"usable"`
	Reason UnusableReason   `json:"reason,omitempty"`
}

// ClassifiedSession contains metadata-derived identity without storage or reader details.
type ClassifiedSession struct {
	SessionID         string                      `json:"sessionId"`
	Combination       CombinationIdentity         `json:"combination"`
	Type              SessionType                 `json:"type"`
	WeatherConditions string                      `json:"weatherConditions"`
	Status            SessionIdentificationStatus `json:"status"`
	Families          []FamilyUsability           `json:"families"`
}

// ClassifyHistoricalSession classifies one already-inspected historical model.
func ClassifyHistoricalSession(session HistoricalSession) (ClassifiedSession, error) {
	if strings.TrimSpace(session.ID) == "" {
		return ClassifiedSession{}, fmt.Errorf("%w: session id", ErrInvalidSessionClassification)
	}
	if session.Provenance.Source.Kind != SourceLMU {
		return ClassifiedSession{}, fmt.Errorf(
			"%w: %q",
			ErrUnsupportedSessionSimulator,
			session.Provenance.Source.Kind,
		)
	}

	metadata, err := classificationMetadata(session.Metadata)
	if err != nil {
		return ClassifiedSession{}, err
	}
	sessionType, err := parseSessionType(metadata["sessiontype"])
	if err != nil {
		return ClassifiedSession{}, err
	}

	combination := CombinationIdentity{
		SimID:       SimIDLMU,
		TrackName:   metadata["trackname"],
		TrackLayout: metadata["tracklayout"],
		CarName:     metadata["carname"],
		CarClass:    metadata["carclass"],
	}
	combination.ID = combinationID(combination)
	completeLap := hasCompletedLap(session.Laps)
	status := SessionStatusIdentifiedNotUsable
	if completeLap {
		status = SessionStatusIdentifiedUsable
	}

	return ClassifiedSession{
		SessionID:         session.ID,
		Combination:       combination,
		Type:              sessionType,
		WeatherConditions: metadata["weatherconditions"],
		Status:            status,
		Families:          familyUsability(sessionType, completeLap),
	}, nil
}

func classificationMetadata(entries []HistoricalMetadata) (map[string]string, error) {
	wanted := map[string]string{
		"trackname":         "TrackName",
		"tracklayout":       "TrackLayout",
		"carname":           "CarName",
		"carclass":          "CarClass",
		"sessiontype":       "SessionType",
		"weatherconditions": "WeatherConditions",
	}
	values := make(map[string]string, len(wanted))
	for _, entry := range entries {
		key := strings.ToLower(strings.TrimSpace(entry.Key))
		if _, required := wanted[key]; !required {
			continue
		}
		if _, duplicate := values[key]; duplicate {
			return nil, fmt.Errorf("%w: duplicate %s", ErrInvalidSessionClassification, wanted[key])
		}
		value := strings.TrimSpace(entry.Value)
		if !entry.Present || entry.Sensitive || entry.Redacted || entry.Quality != QualityValid || value == "" {
			return nil, fmt.Errorf("%w: unusable %s", ErrInvalidSessionClassification, wanted[key])
		}
		values[key] = value
	}
	for key, displayName := range wanted {
		if _, present := values[key]; !present {
			return nil, fmt.Errorf("%w: missing %s", ErrInvalidSessionClassification, displayName)
		}
	}
	return values, nil
}

func parseSessionType(value string) (SessionType, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "practice":
		return SessionTypePractice, nil
	case "qualify":
		return SessionTypeQualify, nil
	case "race":
		return SessionTypeRace, nil
	default:
		return "", fmt.Errorf("%w: unknown SessionType %q", ErrInvalidSessionClassification, value)
	}
}

func hasCompletedLap(laps []HistoricalLap) bool {
	for _, lap := range laps {
		if lap.EndSeconds != nil {
			return true
		}
	}
	return false
}

func familyUsability(sessionType SessionType, completeLap bool) []FamilyUsability {
	families := []DerivationFamily{
		FamilySessionClassification,
		FamilyLapValidity,
		FamilyFuelConsumption,
		FamilyVirtualEnergyConsumption,
		FamilyCombinedStintPaceCurve,
		FamilyTyreDegradation,
		FamilyPit,
		FamilySavingCost,
		FamilyClimateBuckets,
		FamilyObservedStrategy,
	}
	result := make([]FamilyUsability, 0, len(families))
	for _, family := range families {
		availability := FamilyUsability{Family: family, Usable: completeLap}
		switch {
		case family == FamilySessionClassification:
			availability.Usable = true
		case !completeLap:
			availability.Reason = UnusableReasonNoCompletedLap
		case family == FamilyObservedStrategy && sessionType != SessionTypeRace:
			availability.Usable = false
			availability.Reason = UnusableReasonNotRace
		}
		result = append(result, availability)
	}
	return result
}

func combinationID(combination CombinationIdentity) string {
	sum := sha256.Sum256([]byte(combinationKey(combination)))
	return SimIDLMU + ":" + hex.EncodeToString(sum[:])
}

func combinationKey(combination CombinationIdentity) string {
	parts := []string{
		combination.SimID,
		combination.TrackName,
		combination.TrackLayout,
		combination.CarName,
		combination.CarClass,
	}
	var key strings.Builder
	for _, part := range parts {
		key.WriteString(strconv.Itoa(len(part)))
		key.WriteByte(':')
		key.WriteString(part)
	}
	return key.String()
}
