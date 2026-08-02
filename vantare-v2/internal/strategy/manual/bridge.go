package manual

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
	ManualProtocolV1   = "strategy.manual.v1"
	maxManualJSONBytes = 8 << 20
)

var manualCommandIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type ManualCommandV1 struct {
	ProtocolVersion string          `json:"protocolVersion"`
	CommandID       string          `json:"commandId"`
	Input           ManualPlanInput `json:"input"`
}

type ManualResultV1 struct {
	ProtocolVersion string           `json:"protocolVersion"`
	CommandID       string           `json:"commandId"`
	Result          ManualPlanResult `json:"result"`
}

type JSONBridge struct{}

func (JSONBridge) Execute(ctx context.Context, document []byte) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, wrapCalculationError(ErrorInvalidInput, "command", "manual calculation was cancelled", err)
	}
	if len(document) == 0 || len(document) > maxManualJSONBytes {
		return nil, calculationError(ErrorInvalidInput, "command", "manual command size is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	var command ManualCommandV1
	if err := decoder.Decode(&command); err != nil {
		return nil, wrapCalculationError(ErrorInvalidInput, "command", "manual command is invalid", err)
	}
	if err := rejectManualTrailingJSON(decoder); err != nil {
		return nil, err
	}
	if command.ProtocolVersion != ManualProtocolV1 {
		return nil, calculationError(ErrorInvalidInput, "protocolVersion", "unsupported manual protocol")
	}
	if !manualCommandIDPattern.MatchString(command.CommandID) {
		return nil, calculationError(ErrorInvalidInput, "commandId", "manual command identifier is invalid")
	}
	result, err := CalculateManualPlan(command.Input)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(ManualResultV1{
		ProtocolVersion: ManualProtocolV1,
		CommandID:       command.CommandID,
		Result:          result,
	})
	if err != nil {
		return nil, wrapCalculationError(ErrorOverflow, "result", "manual result could not be encoded", err)
	}
	return encoded, nil
}

func rejectManualTrailingJSON(decoder *json.Decoder) error {
	var trailing any
	err := decoder.Decode(&trailing)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err == nil {
		return calculationError(ErrorInvalidInput, "command", "manual command contains trailing data")
	}
	return wrapCalculationError(ErrorInvalidInput, "command", "manual command trailing data is invalid", fmt.Errorf("decode trailing JSON: %w", err))
}
