package application

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
)

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
	if err := validateJSONDocument(document); err != nil {
		return err
	}
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
	decoder := json.NewDecoder(bytes.NewReader(document))
	if err := validateJSONValue(decoder); err != nil {
		return applicationError(ErrorInvalidCommand, "", err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		return applicationError(ErrorInvalidCommand, "", ErrInvalidCommand)
	}
	return nil
}

func validateJSONValue(decoder *json.Decoder) error {
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
		for decoder.More() {
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
			if err := validateJSONValue(decoder); err != nil {
				return err
			}
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim('}') {
			return ErrInvalidCommand
		}
	case '[':
		for decoder.More() {
			if err := validateJSONValue(decoder); err != nil {
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
