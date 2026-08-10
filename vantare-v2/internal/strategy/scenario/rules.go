// Package scenario implements race event rules and scenario analysis.
//
// A scenario is a race described by a solver.Input modified by a set of rules.
// Each rule declares a change to racing conditions: safety car periods, weather,
// damage, penalties, or race length changes. Every rule carries provenance
// so a scenario can explain its assumptions.
package scenario

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

const RuleSetVersionV1 = "strategy.rules.v1"

// ErrorCode is stable across implementations so a receiver can tell why a
// scenario was refused without matching on message text.
type ErrorCode string

const (
	ErrorInvalidInput            ErrorCode = "invalid_input"
	ErrorInvalidRule             ErrorCode = "invalid_rule"
	ErrorUnsupportedRulesVersion ErrorCode = "unsupported_rules_version"
	ErrorRuleWithoutOrigin       ErrorCode = "rule_without_origin"
	ErrorDuplicateRule           ErrorCode = "duplicate_rule"
	ErrorUnsupportedCapability   ErrorCode = "unsupported_capability"
)

// ErrRejected is the shared sentinel: every scenario failure wraps it, so a
// caller can tell "this scenario was refused" from "the disk failed".
var ErrRejected = errors.New("scenario rejected")

// ScenarioError is returned when a scenario is invalid.
type ScenarioError struct {
	Code    ErrorCode
	Field   string
	Message string
	Cause   error
}

func (err *ScenarioError) Error() string {
	if err.Field == "" {
		return fmt.Sprintf("%s: %s", err.Code, err.Message)
	}
	return fmt.Sprintf("%s (%s): %s", err.Code, err.Field, err.Message)
}

func (err *ScenarioError) Unwrap() []error {
	if err.Cause == nil {
		return []error{ErrRejected}
	}
	return []error{ErrRejected, err.Cause}
}

// HasErrorCode lets callers branch on why a scenario was refused.
func HasErrorCode(err error, code ErrorCode) bool {
	var scenarioErr *ScenarioError
	return errors.As(err, &scenarioErr) && scenarioErr.Code == code
}

func scenarioError(code ErrorCode, field, message string) error {
	return &ScenarioError{Code: code, Field: field, Message: message}
}

func wrapScenarioError(code ErrorCode, field, message string, cause error) error {
	return &ScenarioError{Code: code, Field: field, Message: message, Cause: cause}
}

// EffectKind names a category of change to race conditions.
type EffectKind string

const (
	EffectSafetyCar        EffectKind = "safety_car"
	EffectFullCourseYellow EffectKind = "full_course_yellow"
	EffectWeather          EffectKind = "weather"
	EffectDamage           EffectKind = "damage"
	EffectPenalty          EffectKind = "penalty"
	EffectRaceLength       EffectKind = "race_length"
)

// SafetyCarRule describes a period run behind the safety car or full course yellow.
// Laps is the count of laps run at reduced pace.
// LapTimeMultiplier (>=1) is the slowdown factor for those laps.
// PitLossMultiplier (0..1) is how much of the normal pit loss you pay when stopping.
type SafetyCarRule struct {
	Laps              int64   `json:"laps"`
	LapTimeMultiplier float64 `json:"lapTimeMultiplier"`
	PitLossMultiplier float64 `json:"pitLossMultiplier"`
}

// WeatherRule describes a weather change affecting lap times and tyre wear.
type WeatherRule struct {
	LapTimeMultiplier     float64 `json:"lapTimeMultiplier"`
	DegradationMultiplier float64 `json:"degradationMultiplier"`
	TyreLifeMultiplier    float64 `json:"tyreLifeMultiplier"`
}

// DamageRule describes vehicle damage requiring repair time and potentially
// additional pit stops.
type DamageRule struct {
	RepairSeconds      float64 `json:"repairSeconds"`
	AdditionalPitStops int64   `json:"additionalPitStops"`
}

// PenaltyRule describes a time penalty.
type PenaltyRule struct {
	AddedSeconds float64 `json:"addedSeconds"`
}

// RaceLengthRule describes a change to the race distance.
type RaceLengthRule struct {
	RaceLaps int64 `json:"raceLaps"`
}

// Rule is one declared change to the conditions a plan is solved under.
// Every rule carries provenance so its trustworthiness can be evaluated.
type Rule struct {
	ID         string              `json:"id"`
	Effect     EffectKind          `json:"effect"`
	Provenance contract.Provenance `json:"provenance"`
	SafetyCar  *SafetyCarRule      `json:"safetyCar,omitempty"`
	Weather    *WeatherRule        `json:"weather,omitempty"`
	Damage     *DamageRule         `json:"damage,omitempty"`
	Penalty    *PenaltyRule        `json:"penalty,omitempty"`
	RaceLength *RaceLengthRule     `json:"raceLength,omitempty"`
}

// RuleSet is a versioned, ordered collection of rules. Order matters and is
// part of the identity because multipliers compose.
type RuleSet struct {
	Version string `json:"version"`
	Rules   []Rule `json:"rules"`
}

// Validate checks that the rule set is well-formed.
func (set RuleSet) Validate() error {
	if set.Version != RuleSetVersionV1 {
		return scenarioError(ErrorUnsupportedRulesVersion, "version",
			fmt.Sprintf("version %q not supported", set.Version))
	}

	seenIDs := make(map[string]bool)

	for i, rule := range set.Rules {
		if rule.ID == "" {
			return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].id", i),
				"rule ID must be non-empty")
		}

		if seenIDs[rule.ID] {
			return scenarioError(ErrorDuplicateRule, fmt.Sprintf("rules[%d].id", i),
				fmt.Sprintf("duplicate rule ID %q", rule.ID))
		}
		seenIDs[rule.ID] = true

		// Validate provenance: must have a kind that is not unknown.
		if rule.Provenance.Kind == "" || rule.Provenance.Kind == contract.ProvenanceUnknown {
			return scenarioError(ErrorRuleWithoutOrigin, fmt.Sprintf("rules[%d].provenance", i),
				fmt.Sprintf("rule %q must have a provenance kind that is not unknown", rule.ID))
		}

		// Exactly one payload must be set and it must match the Effect.
		payloads := 0
		if rule.SafetyCar != nil {
			payloads++
		}
		if rule.Weather != nil {
			payloads++
		}
		if rule.Damage != nil {
			payloads++
		}
		if rule.Penalty != nil {
			payloads++
		}
		if rule.RaceLength != nil {
			payloads++
		}

		if payloads != 1 {
			return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d]", i),
				fmt.Sprintf("rule %q must have exactly one payload set, got %d", rule.ID, payloads))
		}

		// Validate payload matches effect.
		switch rule.Effect {
		case EffectSafetyCar, EffectFullCourseYellow:
			if rule.SafetyCar == nil {
				return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].safetyCar", i),
					fmt.Sprintf("rule %q has effect %q but no SafetyCarRule payload", rule.ID, rule.Effect))
			}
			if err := validateSafetyCarRule(rule.ID, i, rule.SafetyCar); err != nil {
				return err
			}

		case EffectWeather:
			if rule.Weather == nil {
				return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].weather", i),
					fmt.Sprintf("rule %q has effect %q but no WeatherRule payload", rule.ID, rule.Effect))
			}
			if err := validateWeatherRule(rule.ID, i, rule.Weather); err != nil {
				return err
			}

		case EffectDamage:
			if rule.Damage == nil {
				return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].damage", i),
					fmt.Sprintf("rule %q has effect %q but no DamageRule payload", rule.ID, rule.Effect))
			}
			if err := validateDamageRule(rule.ID, i, rule.Damage); err != nil {
				return err
			}

		case EffectPenalty:
			if rule.Penalty == nil {
				return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].penalty", i),
					fmt.Sprintf("rule %q has effect %q but no PenaltyRule payload", rule.ID, rule.Effect))
			}
			if err := validatePenaltyRule(rule.ID, i, rule.Penalty); err != nil {
				return err
			}

		case EffectRaceLength:
			if rule.RaceLength == nil {
				return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].raceLength", i),
					fmt.Sprintf("rule %q has effect %q but no RaceLengthRule payload", rule.ID, rule.Effect))
			}
			if err := validateRaceLengthRule(rule.ID, i, rule.RaceLength); err != nil {
				return err
			}

		default:
			return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].effect", i),
				fmt.Sprintf("unknown effect kind %q", rule.Effect))
		}
	}

	return nil
}

func validateSafetyCarRule(ruleID string, ruleIndex int, rule *SafetyCarRule) error {
	if rule.Laps <= 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].safetyCar.laps", ruleIndex),
			fmt.Sprintf("rule %q: laps must be > 0, got %d", ruleID, rule.Laps))
	}

	if math.IsNaN(rule.LapTimeMultiplier) || math.IsInf(rule.LapTimeMultiplier, 0) {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].safetyCar.lapTimeMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: lapTimeMultiplier must be a finite number, got %v", ruleID, rule.LapTimeMultiplier))
	}

	if rule.LapTimeMultiplier < 1 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].safetyCar.lapTimeMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: lapTimeMultiplier must be >= 1, got %v", ruleID, rule.LapTimeMultiplier))
	}

	if math.IsNaN(rule.PitLossMultiplier) || math.IsInf(rule.PitLossMultiplier, 0) {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].safetyCar.pitLossMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: pitLossMultiplier must be a finite number, got %v", ruleID, rule.PitLossMultiplier))
	}

	if rule.PitLossMultiplier < 0 || rule.PitLossMultiplier > 1 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].safetyCar.pitLossMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: pitLossMultiplier must be in [0, 1], got %v", ruleID, rule.PitLossMultiplier))
	}

	return nil
}

func validateWeatherRule(ruleID string, ruleIndex int, rule *WeatherRule) error {
	if math.IsNaN(rule.LapTimeMultiplier) || math.IsInf(rule.LapTimeMultiplier, 0) {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].weather.lapTimeMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: lapTimeMultiplier must be a finite number, got %v", ruleID, rule.LapTimeMultiplier))
	}

	if rule.LapTimeMultiplier <= 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].weather.lapTimeMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: lapTimeMultiplier must be > 0, got %v", ruleID, rule.LapTimeMultiplier))
	}

	if math.IsNaN(rule.DegradationMultiplier) || math.IsInf(rule.DegradationMultiplier, 0) {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].weather.degradationMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: degradationMultiplier must be a finite number, got %v", ruleID, rule.DegradationMultiplier))
	}

	if rule.DegradationMultiplier <= 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].weather.degradationMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: degradationMultiplier must be > 0, got %v", ruleID, rule.DegradationMultiplier))
	}

	if math.IsNaN(rule.TyreLifeMultiplier) || math.IsInf(rule.TyreLifeMultiplier, 0) {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].weather.tyreLifeMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: tyreLifeMultiplier must be a finite number, got %v", ruleID, rule.TyreLifeMultiplier))
	}

	if rule.TyreLifeMultiplier <= 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].weather.tyreLifeMultiplier", ruleIndex),
			fmt.Sprintf("rule %q: tyreLifeMultiplier must be > 0, got %v", ruleID, rule.TyreLifeMultiplier))
	}

	return nil
}

func validateDamageRule(ruleID string, ruleIndex int, rule *DamageRule) error {
	if math.IsNaN(rule.RepairSeconds) || math.IsInf(rule.RepairSeconds, 0) {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].damage.repairSeconds", ruleIndex),
			fmt.Sprintf("rule %q: repairSeconds must be a finite number, got %v", ruleID, rule.RepairSeconds))
	}

	if rule.RepairSeconds < 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].damage.repairSeconds", ruleIndex),
			fmt.Sprintf("rule %q: repairSeconds must be >= 0, got %v", ruleID, rule.RepairSeconds))
	}

	if rule.AdditionalPitStops < 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].damage.additionalPitStops", ruleIndex),
			fmt.Sprintf("rule %q: additionalPitStops must be >= 0, got %d", ruleID, rule.AdditionalPitStops))
	}

	return nil
}

func validatePenaltyRule(ruleID string, ruleIndex int, rule *PenaltyRule) error {
	if math.IsNaN(rule.AddedSeconds) || math.IsInf(rule.AddedSeconds, 0) {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].penalty.addedSeconds", ruleIndex),
			fmt.Sprintf("rule %q: addedSeconds must be a finite number, got %v", ruleID, rule.AddedSeconds))
	}

	if rule.AddedSeconds < 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].penalty.addedSeconds", ruleIndex),
			fmt.Sprintf("rule %q: addedSeconds must be >= 0, got %v", ruleID, rule.AddedSeconds))
	}

	return nil
}

func validateRaceLengthRule(ruleID string, ruleIndex int, rule *RaceLengthRule) error {
	if rule.RaceLaps <= 0 {
		return scenarioError(ErrorInvalidRule, fmt.Sprintf("rules[%d].raceLength.raceLaps", ruleIndex),
			fmt.Sprintf("rule %q: raceLaps must be > 0, got %d", ruleID, rule.RaceLaps))
	}

	return nil
}

// Hash identifies a rule set by its canonicalized JSON hash.
// It is stable across runs and independent of JSON key order.
func (set RuleSet) Hash() (string, error) {
	data, err := json.Marshal(set)
	if err != nil {
		return "", wrapScenarioError(ErrorInvalidRule, "",
			"failed to marshal rule set", err)
	}

	_, digest, err := contract.CanonicalizeAndHashJSONV1(data)
	if err != nil {
		return "", wrapScenarioError(ErrorInvalidRule, "",
			"failed to canonicalize rule set", err)
	}

	return digest, nil
}

// Stale reports whether a plan solved under solvedUnder must be recomputed
// because the current rule set differs.
func Stale(solvedUnder string, current RuleSet) (bool, error) {
	currentHash, err := current.Hash()
	if err != nil {
		return false, err
	}

	return solvedUnder != currentHash, nil
}
