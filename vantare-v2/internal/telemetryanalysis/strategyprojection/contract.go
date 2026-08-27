package strategyprojection

import (
	"fmt"
	"strings"
	"time"
)

const (
	ContractVersionStrategyInputProjectionV2 ContractVersion = "strategyinputprojection.v2"
	ContractVersionObservedStrategyV1        ContractVersion = "observedstrategy.v1"
	ContractVersionTemporalSegmentsV1        ContractVersion = "temporalsegments.v1"
)

// ContractError es un error tipado minimo para no importar internal/strategy/contract.
type ContractError struct {
	Code    string
	Field   string
	Message string
	Cause   error
}

func (e *ContractError) Error() string {
	if e.Field == "" {
		return fmt.Sprintf("%s: %s", e.Code, e.Message)
	}
	return fmt.Sprintf("%s (%s): %s", e.Code, e.Field, e.Message)
}

func (e *ContractError) Unwrap() error { return e.Cause }

func contractError(code, field, message string) error {
	return &ContractError{Code: code, Field: field, Message: message}
}

func validateTimestamp(field string, value time.Time) error {
	if value.IsZero() {
		return contractError("invalid_document", field, "timestamp is required")
	}
	if value.Location() != time.UTC || value.Nanosecond()%int(time.Millisecond) != 0 {
		return contractError("invalid_document", field, "timestamp must use canonical UTC millisecond precision")
	}
	return nil
}

func validateIdentifier(field, value string) error {
	v := strings.TrimSpace(value)
	if v == "" || len(v) > 128 {
		return contractError("invalid_identifier", field, "must be 1-128 non-empty characters")
	}
	for _, r := range v {
		if r < 32 || r == 127 {
			return contractError("invalid_identifier", field, "must not contain control characters")
		}
	}
	return nil
}
