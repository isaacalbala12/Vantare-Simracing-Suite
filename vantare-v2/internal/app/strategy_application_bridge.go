package app

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	strategyapplication "github.com/vantare/overlays/v2/internal/strategy/application"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	StrategyApplicationCommandEvent = "strategy:application:command"
	StrategyApplicationResultEvent  = "strategy:application:result"
	StrategyApplicationErrorEvent   = "strategy:application:error"
)

const invalidStrategyApplicationCommandID = "invalid-command"

type StrategyApplicationPublicErrorCode string

type StrategyApplicationErrorResponse struct {
	CommandID string                             `json:"commandId"`
	Code      StrategyApplicationPublicErrorCode `json:"code"`
	Field     string                             `json:"field"`
	Message   string                             `json:"message"`
}

type strategyApplicationExecutor interface {
	Execute(context.Context, []byte) ([]byte, error)
}

// StrategyApplicationBridge is the Wails boundary for the versioned Strategy
// application protocol. Domain validation and dispatch stay in application.JSONBridge.
type StrategyApplicationBridge struct {
	ctx      context.Context
	executor strategyApplicationExecutor
	emitter  EventEmitter
}

func NewStrategyApplicationBridge(
	ctx context.Context,
	executor strategyApplicationExecutor,
	emitter EventEmitter,
) *StrategyApplicationBridge {
	if ctx == nil {
		ctx = context.Background()
	}
	return &StrategyApplicationBridge{ctx: ctx, executor: executor, emitter: emitter}
}

func (bridge *StrategyApplicationBridge) RegisterHandlers(wailsApp *application.App) {
	if bridge == nil || wailsApp == nil {
		return
	}
	wailsApp.Event.On(StrategyApplicationCommandEvent, func(event *application.CustomEvent) {
		bridge.HandleCommand(event.Data)
	})
}

func (bridge *StrategyApplicationBridge) HandleCommand(data any) {
	if bridge == nil || bridge.emitter == nil {
		return
	}
	started := time.Now()
	result, failure := ExecuteStrategyApplicationCommand(bridge.ctx, bridge.executor, data)
	if failure != nil {
		log.Printf("strategy command refused: commandId=%s code=%s field=%s after=%s",
			failure.CommandID, failure.Code, failure.Field, time.Since(started).Round(time.Millisecond))
		bridge.emitter.Emit(StrategyApplicationErrorEvent, *failure)
		return
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		log.Printf("strategy command slow: after=%s", elapsed.Round(time.Millisecond))
	}
	bridge.emitter.Emit(StrategyApplicationResultEvent, result)
}

func ExecuteStrategyApplicationCommand(
	ctx context.Context,
	executor strategyApplicationExecutor,
	data any,
) (any, *StrategyApplicationErrorResponse) {
	document, err := json.Marshal(data)
	if err != nil {
		return nil, strategyApplicationFailure(invalidStrategyApplicationCommandID, strategyapplication.ErrorInvalidCommand, "")
	}
	commandID := strategyApplicationCommandID(document)
	if executor == nil {
		return nil, &StrategyApplicationErrorResponse{
			CommandID: commandID,
			Code:      StrategyApplicationPublicErrorCode(strategyapplication.ErrorInvalidCommand),
			Message:   "Strategy repository is unavailable.",
		}
	}
	encoded, err := executor.Execute(ctx, document)
	if err != nil {
		// El codigo publico colapsa causas distintas en invalid_command. Sin
		// esta traza local un fallo real queda indistinguible para quien
		// depura: es lo que dejo ciega la importacion en frio.
		log.Printf("strategy command failed: operation=%s commandId=%s err=%v",
			strategyApplicationOperation(document), commandID, err)
		return nil, strategyApplicationError(commandID, err)
	}
	var result any
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, &StrategyApplicationErrorResponse{
			CommandID: commandID,
			Code:      StrategyApplicationPublicErrorCode(strategyapplication.ErrorInvalidCommand),
			Message:   "The Strategy result was invalid.",
		}
	}
	return result, nil
}

func strategyApplicationCommandID(document []byte) string {
	var header struct {
		CommandID string `json:"commandId"`
	}
	if json.Unmarshal(document, &header) != nil || header.CommandID == "" {
		return invalidStrategyApplicationCommandID
	}
	return header.CommandID
}

func strategyApplicationOperation(document []byte) string {
	var header struct {
		Operation string `json:"operation"`
	}
	if json.Unmarshal(document, &header) != nil || header.Operation == "" {
		return "unknown"
	}
	return header.Operation
}

func strategyApplicationError(commandID string, err error) *StrategyApplicationErrorResponse {
	var applicationErr *strategyapplication.ApplicationError
	if errors.As(err, &applicationErr) && knownStrategyApplicationError(applicationErr.Code) {
		return strategyApplicationFailure(commandID, applicationErr.Code, applicationErr.Field)
	}
	var refused *strategyapplication.ImportRefusedError
	if errors.As(err, &refused) {
		return strategyApplicationFailure(commandID, strategyapplication.ErrorImportRefused, "")
	}
	var packagingErr *packaging.PackagingError
	if errors.As(err, &packagingErr) {
		return &StrategyApplicationErrorResponse{
			CommandID: commandID,
			Code:      StrategyApplicationPublicErrorCode(packagingErr.Code),
			Field:     packagingErr.Field,
			Message:   "The Strategy package was refused.",
		}
	}
	return strategyApplicationFailure(commandID, strategyapplication.ErrorInvalidCommand, "")
}

func strategyApplicationFailure(
	commandID string,
	code strategyapplication.ErrorCode,
	field string,
) *StrategyApplicationErrorResponse {
	return &StrategyApplicationErrorResponse{
		CommandID: commandID,
		Code:      StrategyApplicationPublicErrorCode(code),
		Field:     field,
		Message:   publicStrategyApplicationMessage(code),
	}
}

func knownStrategyApplicationError(code strategyapplication.ErrorCode) bool {
	switch code {
	case strategyapplication.ErrorInvalidCommand,
		strategyapplication.ErrorStaleCommand,
		strategyapplication.ErrorDraftNotFound,
		strategyapplication.ErrorDraftConflict,
		strategyapplication.ErrorRevisionNotFound,
		strategyapplication.ErrorActiveConflict,
		strategyapplication.ErrorUnsavedChanges,
		strategyapplication.ErrorPlanNotFound,
		strategyapplication.ErrorEventNotFound,
		strategyapplication.ErrorEventConflict,
		strategyapplication.ErrorDriverNotFound,
		strategyapplication.ErrorDriverConflict,
		strategyapplication.ErrorDriverInUse,
		strategyapplication.ErrorVariantNotFound,
		strategyapplication.ErrorVariantConflict,
		strategyapplication.ErrorLegacyMigrationConflict,
		strategyapplication.ErrorLegacyMigrationNotFound,
		strategyapplication.ErrorCalculationInvalid,
		strategyapplication.ErrorCalculationInfeasible,
		strategyapplication.ErrorCalculationOverflow,
		strategyapplication.ErrorCalculationTimeout,
		strategyapplication.ErrorImportRefused:
		return true
	default:
		return false
	}
}

func publicStrategyApplicationMessage(code strategyapplication.ErrorCode) string {
	switch code {
	case strategyapplication.ErrorStaleCommand:
		return "The Strategy document changed. Reopen it and try again."
	case strategyapplication.ErrorDraftNotFound:
		return "The Strategy draft was not found."
	case strategyapplication.ErrorDraftConflict:
		return "The Strategy draft conflicts with another saved document."
	case strategyapplication.ErrorRevisionNotFound:
		return "The Strategy revision was not found."
	case strategyapplication.ErrorActiveConflict:
		return "The active Strategy plan changed. Reopen it and try again."
	case strategyapplication.ErrorUnsavedChanges:
		return "The Strategy draft has unsaved changes."
	case strategyapplication.ErrorPlanNotFound:
		return "The Strategy plan was not found."
	case strategyapplication.ErrorEventNotFound:
		return "The Strategy event was not found."
	case strategyapplication.ErrorEventConflict:
		return "The Strategy event conflicts with another saved event."
	case strategyapplication.ErrorDriverNotFound:
		return "The Strategy driver was not found."
	case strategyapplication.ErrorDriverConflict:
		return "The Strategy driver conflicts with another saved driver."
	case strategyapplication.ErrorDriverInUse:
		return "The Strategy driver is required by a variant."
	case strategyapplication.ErrorVariantNotFound:
		return "The Strategy variant was not found."
	case strategyapplication.ErrorVariantConflict:
		return "The Strategy variant conflicts with another saved variant."
	case strategyapplication.ErrorLegacyMigrationConflict:
		return "The Orbit migration changed or conflicts with another migration. Run the preview again."
	case strategyapplication.ErrorLegacyMigrationNotFound:
		return "The Orbit migration journal was not found."
	case strategyapplication.ErrorCalculationInvalid:
		return "The Strategy calculation input is invalid."
	case strategyapplication.ErrorCalculationInfeasible:
		return "The Strategy cannot be completed with the current limits."
	case strategyapplication.ErrorCalculationOverflow:
		return "The Strategy calculation exceeded its safe limits."
	case strategyapplication.ErrorCalculationTimeout:
		return "The Strategy calculation reached its backend deadline. Adjust the inputs or retry."
	case strategyapplication.ErrorImportRefused:
		return "The Strategy package was refused."
	default:
		return "The Strategy request could not be completed."
	}
}
