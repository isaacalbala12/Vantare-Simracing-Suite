package tyres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
)

const (
	// TyresProtocolV1 is the transport contract between the editor and this
	// domain. The editor mirrors the tyre shape, so a command carries the
	// inventory verbatim and needs no translation on the way in.
	TyresProtocolV1   = "strategy.tyres.v1"
	maxTyresJSONBytes = 8 << 20
)

var tyresCommandIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type ValidateInput struct {
	Maximum int         `json:"maximum"`
	Tyres   []Tyre      `json:"tyres"`
	Plan    []StintPlan `json:"plan"`
}

type ValidateResult struct {
	Valid      bool            `json:"valid"`
	Violations []PlanViolation `json:"violations"`
}

type ValidateCommandV1 struct {
	ProtocolVersion string        `json:"protocolVersion"`
	CommandID       string        `json:"commandId"`
	Input           ValidateInput `json:"input"`
}

type ValidateResultV1 struct {
	ProtocolVersion string         `json:"protocolVersion"`
	CommandID       string         `json:"commandId"`
	Result          ValidateResult `json:"result"`
}

// JSONBridge exposes the physical tyre domain as the authority the editor
// checks a plan against, so the rules live here rather than being reimplemented
// wherever a plan is displayed.
type JSONBridge struct{}

func (JSONBridge) Execute(ctx context.Context, document []byte) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, &InventoryError{Code: ErrorInvalidTyre, Message: "tyre validation was cancelled", Cause: err}
	}
	if len(document) == 0 || len(document) > maxTyresJSONBytes {
		return nil, inventoryError(ErrorInvalidTyre, "tyre command size is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	var command ValidateCommandV1
	if err := decoder.Decode(&command); err != nil {
		return nil, &InventoryError{Code: ErrorInvalidTyre, Message: "tyre command is invalid", Cause: err}
	}
	if err := rejectTyresTrailingJSON(decoder); err != nil {
		return nil, err
	}
	if command.ProtocolVersion != TyresProtocolV1 {
		return nil, inventoryError(ErrorInvalidTyre, "unsupported tyre protocol")
	}
	if !tyresCommandIDPattern.MatchString(command.CommandID) {
		return nil, inventoryError(ErrorInvalidTyre, "tyre command identifier is invalid")
	}

	inventory, err := NewInventory(command.Input.Maximum, command.Input.Tyres)
	if err != nil {
		return nil, err
	}
	violations := inventory.ValidatePlan(command.Input.Plan)
	encoded, err := json.Marshal(ValidateResultV1{
		ProtocolVersion: TyresProtocolV1,
		CommandID:       command.CommandID,
		Result:          ValidateResult{Valid: len(violations) == 0, Violations: violations},
	})
	if err != nil {
		return nil, &InventoryError{Code: ErrorInvalidTyre, Message: "tyre result could not be encoded", Cause: err}
	}
	return encoded, nil
}

func rejectTyresTrailingJSON(decoder *json.Decoder) error {
	var trailing any
	err := decoder.Decode(&trailing)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err == nil {
		return inventoryError(ErrorInvalidTyre, "tyre command contains trailing data")
	}
	return &InventoryError{Code: ErrorInvalidTyre, Message: "tyre command trailing data is invalid", Cause: fmt.Errorf("decode trailing JSON: %w", err)}
}
