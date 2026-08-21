package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

func (service *Service[T]) CreateEvent(ctx context.Context, command CreateEventCommand) (Result[T], error) {
	if err := validateDocumentCommand(command.CommandHeader, OperationCreateEvent, command.UpdatedAt); err != nil {
		return Result[T]{}, err
	}
	return service.changeDocument(ctx, command.CommandHeader, command.UpdatedAt, func(value *strategydocument.StrategyDocumentV2) error {
		if existing, ok := eventByID(value.Events, command.Event.ID); ok {
			if reflect.DeepEqual(existing, command.Event) {
				return nil
			}
			return applicationError(ErrorEventConflict, "event.id", ErrEventConflict)
		}
		value.Events = append(value.Events, command.Event)
		return nil
	})
}

func (service *Service[T]) EditEvent(ctx context.Context, command EditEventCommand) (Result[T], error) {
	if err := validateDocumentCommand(command.CommandHeader, OperationEditEvent, command.UpdatedAt); err != nil {
		return Result[T]{}, err
	}
	if err := validateDocumentIdentifier("event.id", string(command.Event.ID)); err != nil {
		return Result[T]{}, err
	}
	return service.changeDocument(ctx, command.CommandHeader, command.UpdatedAt, func(value *strategydocument.StrategyDocumentV2) error {
		index := eventIndex(value.Events, command.Event.ID)
		if index < 0 {
			return applicationError(ErrorEventNotFound, "event.id", ErrEventNotFound)
		}
		value.Events[index] = command.Event
		return nil
	})
}

func (service *Service[T]) ListEvents(ctx context.Context, command ListEventsCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationListEvents); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result := documentResult[T](command.CommandID, snapshot)
	if snapshot.StrategyDocument != nil {
		result.Events = append([]strategydocument.Event{}, snapshot.StrategyDocument.Events...)
	}
	return result, nil
}

func (service *Service[T]) CreateDriver(ctx context.Context, command CreateDriverCommand) (Result[T], error) {
	if err := validateDocumentCommand(command.CommandHeader, OperationCreateDriver, command.UpdatedAt); err != nil {
		return Result[T]{}, err
	}
	return service.changeEvent(ctx, command.CommandHeader, command.EventID, command.UpdatedAt, func(event *strategydocument.Event) error {
		if existing, ok := driverByID(event.Drivers, command.Driver.ID); ok {
			if reflect.DeepEqual(existing, command.Driver) {
				return nil
			}
			return applicationError(ErrorDriverConflict, "driver.id", ErrDriverConflict)
		}
		return insertDriver(&event.Drivers, command.Driver)
	})
}

func (service *Service[T]) EditDriver(ctx context.Context, command EditDriverCommand) (Result[T], error) {
	if err := validateDocumentCommand(command.CommandHeader, OperationEditDriver, command.UpdatedAt); err != nil {
		return Result[T]{}, err
	}
	if err := validateDocumentIdentifier("driver.id", string(command.Driver.ID)); err != nil {
		return Result[T]{}, err
	}
	return service.changeEvent(ctx, command.CommandHeader, command.EventID, command.UpdatedAt, func(event *strategydocument.Event) error {
		index := driverIndex(event.Drivers, command.Driver.ID)
		if index < 0 {
			return applicationError(ErrorDriverNotFound, "driver.id", ErrDriverNotFound)
		}
		event.Drivers = append(event.Drivers[:index], event.Drivers[index+1:]...)
		for order := range event.Drivers {
			event.Drivers[order].Order = order
		}
		return insertDriver(&event.Drivers, command.Driver)
	})
}

func (service *Service[T]) DeleteDriver(ctx context.Context, command DeleteDriverCommand) (Result[T], error) {
	if err := validateDocumentCommand(command.CommandHeader, OperationDeleteDriver, command.UpdatedAt); err != nil {
		return Result[T]{}, err
	}
	if err := validateDocumentIdentifier("driverId", string(command.DriverID)); err != nil {
		return Result[T]{}, err
	}
	return service.changeEvent(ctx, command.CommandHeader, command.EventID, command.UpdatedAt, func(event *strategydocument.Event) error {
		index := driverIndex(event.Drivers, command.DriverID)
		if index < 0 {
			return applicationError(ErrorDriverNotFound, "driverId", ErrDriverNotFound)
		}
		for variantIndex := range event.Strategies {
			order, removed := withoutDriver(event.Strategies[variantIndex].Order, command.DriverID)
			if removed && len(order) == 0 {
				return applicationError(ErrorDriverInUse, "driverId", ErrDriverInUse)
			}
			event.Strategies[variantIndex].Order = order
		}
		event.Drivers = append(event.Drivers[:index], event.Drivers[index+1:]...)
		sort.SliceStable(event.Drivers, func(left, right int) bool {
			return event.Drivers[left].Order < event.Drivers[right].Order
		})
		for order := range event.Drivers {
			event.Drivers[order].Order = order
		}
		delete(event.Availability, command.DriverID)
		return nil
	})
}

func (service *Service[T]) ListDrivers(ctx context.Context, command ListDriversCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationListDrivers); err != nil {
		return Result[T]{}, err
	}
	snapshot, event, err := service.readEvent(ctx, command.EventID)
	if err != nil {
		return Result[T]{}, err
	}
	result := documentResult[T](command.CommandID, snapshot)
	result.Drivers = append([]strategydocument.Driver{}, event.Drivers...)
	sort.SliceStable(result.Drivers, func(left, right int) bool {
		return result.Drivers[left].Order < result.Drivers[right].Order
	})
	return result, nil
}

func (service *Service[T]) CreateVariant(ctx context.Context, command CreateVariantCommand) (Result[T], error) {
	if err := validateDocumentCommand(command.CommandHeader, OperationCreateVariant, command.UpdatedAt); err != nil {
		return Result[T]{}, err
	}
	return service.changeEvent(ctx, command.CommandHeader, command.EventID, command.UpdatedAt, func(event *strategydocument.Event) error {
		if existing, ok := variantByID(event.Strategies, command.Variant.ID); ok {
			if reflect.DeepEqual(existing, command.Variant) {
				return nil
			}
			return applicationError(ErrorVariantConflict, "variant.id", ErrVariantConflict)
		}
		event.Strategies = append(event.Strategies, command.Variant)
		return nil
	})
}

func (service *Service[T]) EditVariant(ctx context.Context, command EditVariantCommand) (Result[T], error) {
	if err := validateDocumentCommand(command.CommandHeader, OperationEditVariant, command.UpdatedAt); err != nil {
		return Result[T]{}, err
	}
	if err := validateDocumentIdentifier("variant.id", string(command.Variant.ID)); err != nil {
		return Result[T]{}, err
	}
	return service.changeEvent(ctx, command.CommandHeader, command.EventID, command.UpdatedAt, func(event *strategydocument.Event) error {
		index := variantIndex(event.Strategies, command.Variant.ID)
		if index < 0 {
			return applicationError(ErrorVariantNotFound, "variant.id", ErrVariantNotFound)
		}
		event.Strategies[index] = command.Variant
		return nil
	})
}

func (service *Service[T]) ListVariants(ctx context.Context, command ListVariantsCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationListVariants); err != nil {
		return Result[T]{}, err
	}
	snapshot, event, err := service.readEvent(ctx, command.EventID)
	if err != nil {
		return Result[T]{}, err
	}
	result := documentResult[T](command.CommandID, snapshot)
	result.Variants = append([]strategydocument.Variant{}, event.Strategies...)
	return result, nil
}

func (service *Service[T]) CompareVariants(ctx context.Context, command CompareVariantsCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationCompareVariants); err != nil {
		return Result[T]{}, err
	}
	if command.LeftVariantID == command.RightVariantID {
		return Result[T]{}, applicationError(ErrorInvalidCommand, "rightVariantId", ErrInvalidCommand)
	}
	if err := validateDocumentIdentifier("leftVariantId", string(command.LeftVariantID)); err != nil {
		return Result[T]{}, err
	}
	if err := validateDocumentIdentifier("rightVariantId", string(command.RightVariantID)); err != nil {
		return Result[T]{}, err
	}
	snapshot, event, err := service.readEvent(ctx, command.EventID)
	if err != nil {
		return Result[T]{}, err
	}
	left, leftFound := variantByID(event.Strategies, command.LeftVariantID)
	if !leftFound {
		return Result[T]{}, applicationError(ErrorVariantNotFound, "leftVariantId", ErrVariantNotFound)
	}
	right, rightFound := variantByID(event.Strategies, command.RightVariantID)
	if !rightFound {
		return Result[T]{}, applicationError(ErrorVariantNotFound, "rightVariantId", ErrVariantNotFound)
	}
	comparison := VariantComparison{
		EventID:         event.ID,
		Left:            left,
		Right:           right,
		DifferentFields: differentVariantFields(left, right),
	}
	result := documentResult[T](command.CommandID, snapshot)
	result.Comparison = &comparison
	return result, nil
}

func (service *Service[T]) changeEvent(
	ctx context.Context,
	header CommandHeader,
	eventID strategydocument.EventID,
	updatedAt time.Time,
	change func(*strategydocument.Event) error,
) (Result[T], error) {
	if err := validateDocumentIdentifier("eventId", string(eventID)); err != nil {
		return Result[T]{}, err
	}
	return service.changeDocument(ctx, header, updatedAt, func(value *strategydocument.StrategyDocumentV2) error {
		index := eventIndex(value.Events, eventID)
		if index < 0 {
			return applicationError(ErrorEventNotFound, "eventId", ErrEventNotFound)
		}
		return change(&value.Events[index])
	})
}

func (service *Service[T]) changeDocument(
	ctx context.Context,
	header CommandHeader,
	updatedAt time.Time,
	change func(*strategydocument.StrategyDocumentV2) error,
) (Result[T], error) {
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	if snapshot.Version != header.ExpectedRepositoryVersion {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", ErrStaleCommand)
	}
	value := strategydocument.StrategyDocumentV2{
		ContractVersion: strategydocument.ContractVersionV2,
		SchemaVersion:   strategydocument.SchemaVersionV2,
		Events:          []strategydocument.Event{},
	}
	var original *strategydocument.StrategyDocumentV2
	if snapshot.StrategyDocument != nil {
		value, err = cloneStrategyDocument(*snapshot.StrategyDocument)
		if err != nil {
			return Result[T]{}, err
		}
		originalValue, err := cloneStrategyDocument(value)
		if err != nil {
			return Result[T]{}, err
		}
		original = &originalValue
	}
	if err := change(&value); err != nil {
		return Result[T]{}, err
	}
	if original != nil && reflect.DeepEqual(*original, value) {
		return documentResult[T](header.CommandID, snapshot), nil
	}
	value.GeneratedAt = updatedAt
	if err := value.Validate(); err != nil {
		return Result[T]{}, applicationError(ErrorInvalidCommand, "strategyDocument", err)
	}
	commit, err := service.repository.Commit(ctx, header.ExpectedRepositoryVersion, repository.ChangeSet[T]{
		StrategyDocument: &value,
	})
	if err == nil {
		return documentResult[T](header.CommandID, commit.Snapshot), nil
	}
	if !errors.Is(err, repository.ErrStaleWrite) && !errors.Is(err, repository.ErrCommitUncertain) {
		return Result[T]{}, err
	}
	settled, snapshotErr := service.repository.Snapshot(ctx)
	if snapshotErr != nil {
		return Result[T]{}, errors.Join(err, snapshotErr)
	}
	if settled.StrategyDocument != nil && reflect.DeepEqual(*settled.StrategyDocument, value) {
		return documentResult[T](header.CommandID, settled), nil
	}
	if errors.Is(err, repository.ErrStaleWrite) {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", errors.Join(ErrStaleCommand, err))
	}
	return Result[T]{}, err
}

func (service *Service[T]) readEvent(
	ctx context.Context,
	eventID strategydocument.EventID,
) (repository.Snapshot[T], strategydocument.Event, error) {
	if err := validateDocumentIdentifier("eventId", string(eventID)); err != nil {
		return repository.Snapshot[T]{}, strategydocument.Event{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return repository.Snapshot[T]{}, strategydocument.Event{}, err
	}
	if snapshot.StrategyDocument == nil {
		return repository.Snapshot[T]{}, strategydocument.Event{}, applicationError(ErrorEventNotFound, "eventId", ErrEventNotFound)
	}
	event, found := eventByID(snapshot.StrategyDocument.Events, eventID)
	if !found {
		return repository.Snapshot[T]{}, strategydocument.Event{}, applicationError(ErrorEventNotFound, "eventId", ErrEventNotFound)
	}
	return snapshot, event, nil
}

func validateDocumentCommand(header CommandHeader, operation Operation, updatedAt time.Time) error {
	if err := validateHeader(header, operation); err != nil {
		return err
	}
	if updatedAt.IsZero() {
		return applicationError(ErrorInvalidCommand, "updatedAt", ErrInvalidCommand)
	}
	return nil
}

func validateDocumentIdentifier(field, value string) error {
	if strings.TrimSpace(value) == "" {
		return applicationError(ErrorInvalidCommand, field, ErrInvalidCommand)
	}
	return nil
}

func documentResult[T any](commandID CommandID, snapshot repository.Snapshot[T]) Result[T] {
	return Result[T]{
		ProtocolVersion:     ProtocolVersionV1,
		CommandID:           commandID,
		RepositoryVersion:   snapshot.Version,
		StrategyDocument:    snapshot.StrategyDocument,
		RecoveredFromBackup: snapshot.RecoveredFromBackup,
	}
}

func cloneStrategyDocument(value strategydocument.StrategyDocumentV2) (strategydocument.StrategyDocumentV2, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return strategydocument.StrategyDocumentV2{}, fmt.Errorf("clone strategy document: %w", err)
	}
	var clone strategydocument.StrategyDocumentV2
	if err := json.Unmarshal(raw, &clone); err != nil {
		return strategydocument.StrategyDocumentV2{}, fmt.Errorf("clone strategy document: %w", err)
	}
	return clone, nil
}

func eventIndex(events []strategydocument.Event, id strategydocument.EventID) int {
	for index := range events {
		if events[index].ID == id {
			return index
		}
	}
	return -1
}

func eventByID(events []strategydocument.Event, id strategydocument.EventID) (strategydocument.Event, bool) {
	index := eventIndex(events, id)
	if index < 0 {
		return strategydocument.Event{}, false
	}
	return events[index], true
}

func driverIndex(drivers []strategydocument.Driver, id strategydocument.DriverID) int {
	for index := range drivers {
		if drivers[index].ID == id {
			return index
		}
	}
	return -1
}

func driverByID(drivers []strategydocument.Driver, id strategydocument.DriverID) (strategydocument.Driver, bool) {
	index := driverIndex(drivers, id)
	if index < 0 {
		return strategydocument.Driver{}, false
	}
	return drivers[index], true
}

func variantIndex(variants []strategydocument.Variant, id strategydocument.VariantID) int {
	for index := range variants {
		if variants[index].ID == id {
			return index
		}
	}
	return -1
}

func variantByID(variants []strategydocument.Variant, id strategydocument.VariantID) (strategydocument.Variant, bool) {
	index := variantIndex(variants, id)
	if index < 0 {
		return strategydocument.Variant{}, false
	}
	return variants[index], true
}

func withoutDriver(order []strategydocument.DriverID, driverID strategydocument.DriverID) ([]strategydocument.DriverID, bool) {
	result := make([]strategydocument.DriverID, 0, len(order))
	removed := false
	for _, candidate := range order {
		if candidate == driverID {
			removed = true
			continue
		}
		result = append(result, candidate)
	}
	return result, removed
}

func insertDriver(drivers *[]strategydocument.Driver, driver strategydocument.Driver) error {
	if driver.Order < 0 || driver.Order > len(*drivers) {
		return applicationError(ErrorInvalidCommand, "driver.order", ErrInvalidCommand)
	}
	ordered := append([]strategydocument.Driver{}, (*drivers)...)
	sort.SliceStable(ordered, func(left, right int) bool {
		return ordered[left].Order < ordered[right].Order
	})
	ordered = append(ordered, strategydocument.Driver{})
	copy(ordered[driver.Order+1:], ordered[driver.Order:])
	ordered[driver.Order] = driver
	for order := range ordered {
		ordered[order].Order = order
	}
	*drivers = ordered
	return nil
}

func differentVariantFields(left, right strategydocument.Variant) []string {
	fields := []string{}
	for _, candidate := range []struct {
		name      string
		different bool
	}{
		{name: "name", different: !reflect.DeepEqual(left.Name, right.Name)},
		{name: "note", different: !reflect.DeepEqual(left.Note, right.Note)},
		{name: "mode", different: !reflect.DeepEqual(left.Mode, right.Mode)},
		{name: "order", different: !reflect.DeepEqual(left.Order, right.Order)},
		{name: "state", different: !reflect.DeepEqual(left.State, right.State)},
		{name: "overrides", different: !reflect.DeepEqual(left.Overrides, right.Overrides)},
		{name: "tyres", different: !reflect.DeepEqual(left.Tyres, right.Tyres)},
	} {
		if candidate.different {
			fields = append(fields, candidate.name)
		}
	}
	return fields
}
