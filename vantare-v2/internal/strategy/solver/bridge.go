package solver

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
	// SolverProtocolV1 carries a race description in and a comparison out. The
	// editor sends what it knows; every assumption the solver adds comes back
	// with the answer rather than being applied silently.
	SolverProtocolV1   = "strategy.solver.v1"
	maxSolverJSONBytes = 1 << 20
)

var solverCommandIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type CompareCommandV1 struct {
	ProtocolVersion string      `json:"protocolVersion"`
	CommandID       string      `json:"commandId"`
	Input           Input       `json:"input"`
	Sensitivity     Sensitivity `json:"sensitivity"`
}

type CompareResultV1 struct {
	ProtocolVersion string     `json:"protocolVersion"`
	CommandID       string     `json:"commandId"`
	Result          Comparison `json:"result"`
}

// JSONBridge exposes the solver so the workspace shows plans it computed rather
// than plans someone typed.
type JSONBridge struct{}

func (JSONBridge) Execute(ctx context.Context, document []byte) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, solveError(ErrorInvalidInput, "command", "the comparison was cancelled")
	}
	if len(document) == 0 || len(document) > maxSolverJSONBytes {
		return nil, solveError(ErrorInvalidInput, "command", "solver command size is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	var command CompareCommandV1
	if err := decoder.Decode(&command); err != nil {
		return nil, solveError(ErrorInvalidInput, "command", "solver command is invalid")
	}
	if err := rejectSolverTrailingJSON(decoder); err != nil {
		return nil, err
	}
	if command.ProtocolVersion != SolverProtocolV1 {
		return nil, solveError(ErrorInvalidInput, "protocolVersion", "unsupported solver protocol")
	}
	if !solverCommandIDPattern.MatchString(command.CommandID) {
		return nil, solveError(ErrorInvalidInput, "commandId", "solver command identifier is invalid")
	}

	comparison, err := Compare(command.Input, command.Sensitivity)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(CompareResultV1{
		ProtocolVersion: SolverProtocolV1,
		CommandID:       command.CommandID,
		Result:          comparison,
	})
	if err != nil {
		return nil, solveError(ErrorOverflow, "result", "the comparison could not be encoded")
	}
	return encoded, nil
}

func rejectSolverTrailingJSON(decoder *json.Decoder) error {
	var trailing any
	err := decoder.Decode(&trailing)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err == nil {
		return solveError(ErrorInvalidInput, "command", "solver command contains trailing data")
	}
	return solveError(ErrorInvalidInput, "command", fmt.Sprintf("solver command trailing data is invalid: %v", err))
}
