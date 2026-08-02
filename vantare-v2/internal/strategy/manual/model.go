// Package manual contains the pure, deterministic calculations used by the
// manual Strategy Planner. It owns no persistence, UI, telemetry or simulator
// presets.
package manual

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"strconv"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type ErrorCode string

const (
	ErrorInvalidInput         ErrorCode = "invalid_input"
	ErrorOverflow             ErrorCode = "overflow"
	ErrorInsufficientCapacity ErrorCode = "insufficient_capacity"
)

type CalculationError struct {
	Code    ErrorCode
	Field   string
	Message string
	Cause   error
}

func (err *CalculationError) Error() string {
	if err.Field == "" {
		return fmt.Sprintf("%s: %s", err.Code, err.Message)
	}
	return fmt.Sprintf("%s (%s): %s", err.Code, err.Field, err.Message)
}

func (err *CalculationError) Unwrap() error { return err.Cause }

func calculationError(code ErrorCode, field, message string) error {
	return &CalculationError{Code: code, Field: field, Message: message}
}

func wrapCalculationError(code ErrorCode, field, message string, cause error) error {
	return &CalculationError{Code: code, Field: field, Message: message, Cause: cause}
}

func HasErrorCode(err error, code ErrorCode) bool {
	var calculationErr *CalculationError
	return errors.As(err, &calculationErr) && calculationErr.Code == code
}

type Evidence struct {
	Provenance contract.Provenance `json:"provenance"`
	Confidence contract.Confidence `json:"confidence"`
}

func (value Evidence) Validate() error {
	if err := value.Provenance.Validate(); err != nil {
		return err
	}
	return value.Confidence.Validate()
}

type Sourced[T any] struct {
	Value    T        `json:"value"`
	Evidence Evidence `json:"evidence"`
}

type Assumption struct {
	Field      string              `json:"field"`
	Unit       string              `json:"unit"`
	Value      string              `json:"value"`
	Provenance contract.Provenance `json:"provenance"`
	Confidence contract.Confidence `json:"confidence"`
}

func assumption(field, unit string, value any, evidence Evidence) Assumption {
	return Assumption{Field: field, Unit: unit, Value: fmt.Sprint(value), Provenance: cloneProvenance(evidence.Provenance), Confidence: evidence.Confidence}
}

func (value Assumption) Evidence() Evidence {
	return Evidence{Provenance: cloneProvenance(value.Provenance), Confidence: value.Confidence}
}

func cloneProvenance(value contract.Provenance) contract.Provenance {
	clone := value
	if value.ObservedAt != nil {
		observedAt := *value.ObservedAt
		clone.ObservedAt = &observedAt
	}
	return clone
}

func validateEvidence(field string, value Evidence) error {
	if err := value.Validate(); err != nil {
		return wrapCalculationError(ErrorInvalidInput, field, "invalid source evidence", err)
	}
	return nil
}

func validateFinite(field string, value float64) error {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return calculationError(ErrorInvalidInput, field, "must be finite and non-negative")
	}
	return nil
}

func checkedAdd(field string, values ...float64) (float64, error) {
	var total float64
	for _, value := range values {
		if err := validateFinite(field, value); err != nil {
			return 0, err
		}
		total += value
		if math.IsInf(total, 0) || math.IsNaN(total) {
			return 0, calculationError(ErrorOverflow, field, "calculation overflowed")
		}
	}
	return total, nil
}

func checkedMultiply(field string, left, right float64) (float64, error) {
	if err := validateFinite(field, left); err != nil {
		return 0, err
	}
	if err := validateFinite(field, right); err != nil {
		return 0, err
	}
	result := left * right
	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, calculationError(ErrorOverflow, field, "calculation overflowed")
	}
	return result, nil
}

func validateSourcedDuration(field string, value Sourced[contract.DurationSeconds]) error {
	if err := validateEvidence(field, value.Evidence); err != nil {
		return err
	}
	_, err := contract.NewDurationSeconds(value.Value.Value())
	if err != nil {
		return wrapCalculationError(ErrorInvalidInput, field, "invalid duration", err)
	}
	return nil
}

func validateSourcedLaps(field string, value Sourced[contract.LapCount]) error {
	if err := validateEvidence(field, value.Evidence); err != nil {
		return err
	}
	_, err := contract.NewLapCount(value.Value.Value())
	if err != nil {
		return wrapCalculationError(ErrorInvalidInput, field, "invalid lap count", err)
	}
	return nil
}

func duration(field string, value float64) (contract.DurationSeconds, error) {
	result, err := contract.NewDurationSeconds(value)
	if err != nil {
		return 0, wrapCalculationError(ErrorOverflow, field, "duration is outside the contract", err)
	}
	return result, nil
}

func laps(field string, value float64) (contract.LapCount, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > float64(contract.ManifestV1().MaxSafeInteger) {
		return 0, calculationError(ErrorOverflow, field, "lap count is outside the shared safe integer range")
	}
	result, err := contract.NewLapCount(int64(value))
	if err != nil {
		return 0, wrapCalculationError(ErrorOverflow, field, "lap count is outside the contract", err)
	}
	return result, nil
}

func stableWholeAndCeil(field string, total, excluded, denominator float64) (int64, int64, error) {
	if denominator <= 0 {
		return 0, 0, calculationError(ErrorInvalidInput, field, "divisor must be positive")
	}
	values := []float64{total, excluded, denominator}
	rationals := make([]*big.Rat, len(values))
	for index, value := range values {
		text := strconv.FormatFloat(value, 'g', -1, 64)
		rational, ok := new(big.Rat).SetString(text)
		if !ok {
			return 0, 0, calculationError(ErrorInvalidInput, field, "cannot represent decimal input")
		}
		rationals[index] = rational
	}
	numerator := new(big.Rat).Sub(rationals[0], rationals[1])
	if numerator.Sign() < 0 {
		return 0, 0, calculationError(ErrorInvalidInput, field, "excluded duration exceeds total duration")
	}
	quotient := new(big.Rat).Quo(numerator, rationals[2])
	whole := new(big.Int).Quo(quotient.Num(), quotient.Denom())
	ceiling := new(big.Int).Set(whole)
	if new(big.Int).Rem(quotient.Num(), quotient.Denom()).Sign() != 0 {
		ceiling.Add(ceiling, big.NewInt(1))
	}
	maxSafe := new(big.Int).SetUint64(contract.ManifestV1().MaxSafeInteger)
	if whole.Cmp(maxSafe) > 0 || ceiling.Cmp(maxSafe) > 0 {
		return 0, 0, calculationError(ErrorOverflow, field, "rounded count is outside the shared safe integer range")
	}
	return whole.Int64(), ceiling.Int64(), nil
}
