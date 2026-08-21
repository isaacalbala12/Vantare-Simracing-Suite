package application

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

var requiredOperationFields = map[Operation][]string{
	OperationCreate:       {"draft"},
	OperationOpen:         {"draftId"},
	OperationEdit:         {"draft"},
	OperationSaveRevision: {"draft", "revisionId", "createdAt"},
	OperationDuplicate:    {"sourceDraft", "targetDraftId", "targetPlanId", "targetVariantId", "name", "updatedAt"},
	OperationActivate:     {"revision", "activationId", "activatedAt"},
	OperationDeactivate:   {"expectedActivationId"},
	OperationRestore:      {"draftId"},
	OperationList:         {},
	OperationExport:       {"plans", "provenance"},
	// dryRun is deliberately not required: omitting it means a real import,
	// and a caller that forgets the flag gets the explicit behaviour, not a
	// silently skipped one.
	OperationImport:          {"package"},
	OperationClose:           {"draft", "savedDraft", "discard"},
	OperationCreateEvent:     {"event", "updatedAt"},
	OperationEditEvent:       {"event", "updatedAt"},
	OperationListEvents:      {},
	OperationCreateDriver:    {"eventId", "driver", "updatedAt"},
	OperationEditDriver:      {"eventId", "driver", "updatedAt"},
	OperationDeleteDriver:    {"eventId", "driverId", "updatedAt"},
	OperationListDrivers:     {"eventId"},
	OperationCreateVariant:   {"eventId", "variant", "updatedAt"},
	OperationEditVariant:     {"eventId", "variant", "updatedAt"},
	OperationListVariants:    {"eventId"},
	OperationCompareVariants: {"eventId", "leftVariantId", "rightVariantId"},
}

// JSONBridge is transport-neutral. Wails or a future transport only forwards
// bytes; command validation and dispatch remain in this package.
type JSONBridge[T any] struct {
	service *Service[T]
}

func NewJSONBridge[T any](service *Service[T]) *JSONBridge[T] {
	return &JSONBridge[T]{service: service}
}

func (bridge *JSONBridge[T]) Execute(ctx context.Context, document []byte) ([]byte, error) {
	if bridge == nil || bridge.service == nil {
		return nil, fmt.Errorf("strategy application service is required")
	}
	if err := validateJSONDocument(document); err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(document, &fields); err != nil {
		return nil, applicationError(ErrorInvalidCommand, "", fmt.Errorf("decode command header: %w", err))
	}
	for _, required := range []string{"protocolVersion", "commandId", "operation", "expectedRepositoryVersion"} {
		if _, exists := fields[required]; !exists {
			return nil, applicationError(ErrorInvalidCommand, required, ErrInvalidCommand)
		}
	}
	var header CommandHeader
	if err := json.Unmarshal(document, &header); err != nil {
		return nil, applicationError(ErrorInvalidCommand, "", fmt.Errorf("decode command header: %w", err))
	}
	required, knownOperation := requiredOperationFields[header.Operation]
	if !knownOperation {
		return nil, applicationError(ErrorInvalidCommand, "operation", ErrInvalidCommand)
	}
	for _, field := range required {
		value, exists := fields[field]
		if !exists || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return nil, applicationError(ErrorInvalidCommand, field, ErrInvalidCommand)
		}
	}
	var result Result[T]
	var err error
	switch header.Operation {
	case OperationCreate:
		var command CreateCommand[T]
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Create(ctx, command)
		}
	case OperationOpen:
		var command OpenCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Open(ctx, command)
		}
	case OperationList:
		var command ListCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.List(ctx, command)
		}
	case OperationExport:
		var command ExportCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Export(ctx, command)
		}
	case OperationImport:
		var command ImportCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Import(ctx, command)
		}
	case OperationEdit:
		var command EditCommand[T]
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Edit(ctx, command)
		}
	case OperationSaveRevision:
		var command SaveRevisionCommand[T]
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.SaveRevision(ctx, command)
		}
	case OperationDuplicate:
		var command DuplicateCommand[T]
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Duplicate(ctx, command)
		}
	case OperationActivate:
		var command ActivateCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Activate(ctx, command)
		}
	case OperationDeactivate:
		var command DeactivateCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Deactivate(ctx, command)
		}
	case OperationRestore:
		var command RestoreCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Restore(ctx, command)
		}
	case OperationClose:
		var command CloseCommand[T]
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.Close(ctx, command)
		}
	case OperationCreateEvent:
		var command CreateEventCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.CreateEvent(ctx, command)
		}
	case OperationEditEvent:
		var command EditEventCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.EditEvent(ctx, command)
		}
	case OperationListEvents:
		var command ListEventsCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.ListEvents(ctx, command)
		}
	case OperationCreateDriver:
		var command CreateDriverCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.CreateDriver(ctx, command)
		}
	case OperationEditDriver:
		var command EditDriverCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.EditDriver(ctx, command)
		}
	case OperationDeleteDriver:
		var command DeleteDriverCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.DeleteDriver(ctx, command)
		}
	case OperationListDrivers:
		var command ListDriversCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.ListDrivers(ctx, command)
		}
	case OperationCreateVariant:
		var command CreateVariantCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.CreateVariant(ctx, command)
		}
	case OperationEditVariant:
		var command EditVariantCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.EditVariant(ctx, command)
		}
	case OperationListVariants:
		var command ListVariantsCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.ListVariants(ctx, command)
		}
	case OperationCompareVariants:
		var command CompareVariantsCommand
		if err = decodeStrict(document, &command); err == nil {
			result, err = bridge.service.CompareVariants(ctx, command)
		}
	default:
		err = applicationError(ErrorInvalidCommand, "operation", ErrInvalidCommand)
	}
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("encode strategy application result: %w", err)
	}
	return encoded, nil
}

func decodeStrict(document []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return applicationError(ErrorInvalidCommand, "", fmt.Errorf("decode command: %w", err))
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return applicationError(ErrorInvalidCommand, "", ErrInvalidCommand)
	}
	return nil
}

func validateJSONDocument(document []byte) error {
	if len(document) == 0 || len(document) > contract.MaxCanonicalJSONBytes {
		return applicationError(ErrorInvalidCommand, "", ErrInvalidCommand)
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	if err := validateJSONValue(decoder, 0); err != nil {
		return applicationError(ErrorInvalidCommand, "", err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		return applicationError(ErrorInvalidCommand, "", ErrInvalidCommand)
	}
	return nil
}

func validateJSONValue(decoder *json.Decoder, depth int) error {
	if depth > contract.MaxCanonicalDepth {
		return fmt.Errorf("%w: JSON nesting exceeds %d", ErrInvalidCommand, contract.MaxCanonicalDepth)
	}
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("decode command JSON: %w", err)
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		seen := make(map[string]struct{})
		items := 0
		for decoder.More() {
			items++
			if items > contract.MaxCanonicalContainerItems {
				return fmt.Errorf("%w: object exceeds %d fields", ErrInvalidCommand, contract.MaxCanonicalContainerItems)
			}
			keyToken, err := decoder.Token()
			if err != nil {
				return fmt.Errorf("decode command key: %w", err)
			}
			key, ok := keyToken.(string)
			if !ok {
				return ErrInvalidCommand
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("%w: duplicate field %q", ErrInvalidCommand, key)
			}
			seen[key] = struct{}{}
			if err := validateJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim('}') {
			return ErrInvalidCommand
		}
	case '[':
		items := 0
		for decoder.More() {
			items++
			if items > contract.MaxCanonicalContainerItems {
				return fmt.Errorf("%w: array exceeds %d items", ErrInvalidCommand, contract.MaxCanonicalContainerItems)
			}
			if err := validateJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim(']') {
			return ErrInvalidCommand
		}
	default:
		return ErrInvalidCommand
	}
	return nil
}
