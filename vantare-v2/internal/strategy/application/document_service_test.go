package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"reflect"
	"testing"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

func TestDocumentApplicationAPI(t *testing.T) {
	ctx := context.Background()
	service := documentService(t)
	now := time.Date(2026, 8, 21, 16, 0, 0, 0, time.UTC)
	event := validEvent("event-1", []strategydocument.Driver{{ID: "driver-1", Order: 0}})

	created, err := service.CreateEvent(ctx, CreateEventCommand{
		CommandHeader: documentHeader("create-event", OperationCreateEvent, 0),
		Event:         event,
		UpdatedAt:     now,
	})
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name string
		run  func(version uint64) (Result[testPayload], error)
		want func(t *testing.T, result Result[testPayload])
	}{
		{
			name: "edit event",
			run: func(version uint64) (Result[testPayload], error) {
				edited := event
				edited.Name.Value = "Evento editado"
				return service.EditEvent(ctx, EditEventCommand{
					CommandHeader: documentHeader("edit-event", OperationEditEvent, version),
					Event:         edited,
					UpdatedAt:     now.Add(time.Minute),
				})
			},
			want: func(t *testing.T, result Result[testPayload]) {
				if result.StrategyDocument.Events[0].Name.Value != "Evento editado" {
					t.Fatalf("event edit not persisted: %+v", result.StrategyDocument.Events[0])
				}
			},
		},
		{
			name: "create driver",
			run: func(version uint64) (Result[testPayload], error) {
				return service.CreateDriver(ctx, CreateDriverCommand{
					CommandHeader: documentHeader("create-driver", OperationCreateDriver, version),
					EventID:       event.ID,
					Driver:        strategydocument.Driver{ID: "driver-2", Order: 1},
					UpdatedAt:     now.Add(2 * time.Minute),
				})
			},
			want: func(t *testing.T, result Result[testPayload]) {
				if len(result.StrategyDocument.Events[0].Drivers) != 2 {
					t.Fatalf("driver not created: %+v", result.StrategyDocument.Events[0].Drivers)
				}
			},
		},
		{
			name: "edit driver",
			run: func(version uint64) (Result[testPayload], error) {
				name := sourced("Piloto dos")
				return service.EditDriver(ctx, EditDriverCommand{
					CommandHeader: documentHeader("edit-driver", OperationEditDriver, version),
					EventID:       event.ID,
					Driver:        strategydocument.Driver{ID: "driver-2", Order: 0, Name: &name},
					UpdatedAt:     now.Add(3 * time.Minute),
				})
			},
			want: func(t *testing.T, result Result[testPayload]) {
				editedDriver := result.StrategyDocument.Events[0].Drivers[0]
				nameMatches := editedDriver.Name != nil && editedDriver.Name.Value == "Piloto dos"
				if editedDriver.ID != "driver-2" || !nameMatches {
					t.Fatalf("driver edit/order not persisted: %+v", result.StrategyDocument.Events[0].Drivers)
				}
			},
		},
		{
			name: "create variant",
			run: func(version uint64) (Result[testPayload], error) {
				return service.CreateVariant(ctx, CreateVariantCommand{
					CommandHeader: documentHeader("create-variant", OperationCreateVariant, version),
					EventID:       event.ID,
					Variant:       validVariant("variant-2", []strategydocument.DriverID{"driver-2", "driver-1"}),
					UpdatedAt:     now.Add(4 * time.Minute),
				})
			},
			want: func(t *testing.T, result Result[testPayload]) {
				if len(result.StrategyDocument.Events[0].Strategies) != 2 {
					t.Fatalf("variant not created: %+v", result.StrategyDocument.Events[0].Strategies)
				}
			},
		},
		{
			name: "edit variant",
			run: func(version uint64) (Result[testPayload], error) {
				edited := validVariant("variant-2", []strategydocument.DriverID{"driver-1", "driver-2"})
				edited.Mode = sourcedValue(strategydocument.VariantModeWet)
				return service.EditVariant(ctx, EditVariantCommand{
					CommandHeader: documentHeader("edit-variant", OperationEditVariant, version),
					EventID:       event.ID,
					Variant:       edited,
					UpdatedAt:     now.Add(5 * time.Minute),
				})
			},
			want: func(t *testing.T, result Result[testPayload]) {
				if result.StrategyDocument.Events[0].Strategies[1].Mode.Value != strategydocument.VariantModeWet {
					t.Fatalf("variant edit not persisted: %+v", result.StrategyDocument.Events[0].Strategies[1])
				}
			},
		},
	}

	version := created.RepositoryVersion
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := test.run(version)
			if err != nil {
				t.Fatal(err)
			}
			version = result.RepositoryVersion
			test.want(t, result)
		})
	}

	events, err := service.ListEvents(ctx, ListEventsCommand{CommandHeader: documentHeader("list-events", OperationListEvents, version)})
	if err != nil || len(events.Events) != 1 {
		t.Fatalf("ListEvents = %+v, %v", events.Events, err)
	}
	drivers, err := service.ListDrivers(ctx, ListDriversCommand{
		CommandHeader: documentHeader("list-drivers", OperationListDrivers, version),
		EventID:       event.ID,
	})
	if err != nil || len(drivers.Drivers) != 2 {
		t.Fatalf("ListDrivers = %+v, %v", drivers.Drivers, err)
	}
	variants, err := service.ListVariants(ctx, ListVariantsCommand{
		CommandHeader: documentHeader("list-variants", OperationListVariants, version),
		EventID:       event.ID,
	})
	if err != nil || len(variants.Variants) != 2 {
		t.Fatalf("ListVariants = %+v, %v", variants.Variants, err)
	}
	comparison, err := service.CompareVariants(ctx, CompareVariantsCommand{
		CommandHeader: documentHeader("compare", OperationCompareVariants, version),
		EventID:       event.ID,
		LeftVariantID: "variant-1", RightVariantID: "variant-2",
	})
	if err != nil {
		t.Fatal(err)
	}
	wantDifferent := []string{"name", "mode", "order"}
	if !reflect.DeepEqual(comparison.Comparison.DifferentFields, wantDifferent) {
		t.Fatalf("different fields = %v, want %v", comparison.Comparison.DifferentFields, wantDifferent)
	}
}

func TestDocumentApplicationRejectsInvalidAndMissingReferences(t *testing.T) {
	ctx := context.Background()
	service := documentService(t)
	now := time.Date(2026, 8, 21, 16, 0, 0, 0, time.UTC)
	tests := []struct {
		name     string
		run      func() error
		want     error
		wantCode ErrorCode
	}{
		{
			name: "invalid event",
			run: func() error {
				event := validEvent("event-1", []strategydocument.Driver{{ID: "driver-1", Order: 0}})
				event.Strategies[0].Order = []strategydocument.DriverID{"missing"}
				_, err := service.CreateEvent(ctx, CreateEventCommand{
					CommandHeader: documentHeader("invalid-event", OperationCreateEvent, 0),
					Event:         event,
					UpdatedAt:     now,
				})
				return err
			},
			want: ErrInvalidCommand, wantCode: ErrorInvalidCommand,
		},
		{
			name: "missing event",
			run: func() error {
				_, err := service.ListDrivers(ctx, ListDriversCommand{
					CommandHeader: documentHeader("missing-event", OperationListDrivers, 0),
					EventID:       "missing",
				})
				return err
			},
			want: ErrEventNotFound, wantCode: ErrorEventNotFound,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.run()
			if !errors.Is(err, test.want) {
				t.Fatalf("error = %v, want %v", err, test.want)
			}
			var applicationErr *ApplicationError
			if !errors.As(err, &applicationErr) || applicationErr.Code != test.wantCode {
				t.Fatalf("typed error = %#v, want %s", applicationErr, test.wantCode)
			}
		})
	}
}

func TestDeleteDriverPropertyNeverLeavesDanglingReferences(t *testing.T) {
	random := rand.New(rand.NewSource(729))
	for testCase := 0; testCase < 64; testCase++ {
		t.Run(fmt.Sprintf("case-%02d", testCase), func(t *testing.T) {
			driverCount := 1 + random.Intn(8)
			drivers := make([]strategydocument.Driver, driverCount)
			for index := range drivers {
				drivers[index] = strategydocument.Driver{ID: strategydocument.DriverID(fmt.Sprintf("driver-%d", index)), Order: index}
			}
			event := validEvent("event-1", drivers)
			event.Strategies = []strategydocument.Variant{}
			variantCount := 1 + random.Intn(6)
			for index := 0; index < variantCount; index++ {
				order := []strategydocument.DriverID{}
				for _, driver := range drivers {
					if random.Intn(2) == 0 {
						order = append(order, driver.ID)
					}
				}
				if len(order) == 0 {
					order = append(order, drivers[random.Intn(len(drivers))].ID)
				}
				event.Strategies = append(event.Strategies, validVariant(strategydocument.VariantID(fmt.Sprintf("variant-%d", index)), order))
			}

			service := documentService(t)
			now := time.Date(2026, 8, 21, 17, testCase, 0, 0, time.UTC)
			created, err := service.CreateEvent(context.Background(), CreateEventCommand{
				CommandHeader: documentHeader("create", OperationCreateEvent, 0),
				Event:         event,
				UpdatedAt:     now,
			})
			if err != nil {
				t.Fatal(err)
			}
			removedID := drivers[random.Intn(len(drivers))].ID
			deleted, deleteErr := service.DeleteDriver(context.Background(), DeleteDriverCommand{
				CommandHeader: documentHeader("delete", OperationDeleteDriver, created.RepositoryVersion),
				EventID:       event.ID,
				DriverID:      removedID,
				UpdatedAt:     now.Add(time.Minute),
			})
			if deleteErr != nil && !errors.Is(deleteErr, ErrDriverInUse) {
				t.Fatalf("unexpected delete error: %v", deleteErr)
			}
			listed, err := service.ListEvents(context.Background(), ListEventsCommand{
				CommandHeader: documentHeader("list", OperationListEvents, created.RepositoryVersion),
			})
			if err != nil {
				t.Fatal(err)
			}
			if deleteErr == nil {
				listed = deleted
			}
			if err := listed.StrategyDocument.Validate(); err != nil {
				t.Fatalf("operation left invalid document: %v", err)
			}
			persisted := listed.StrategyDocument.Events[0]
			if deleteErr == nil {
				assertDriverAbsent(t, persisted, removedID)
			}
		})
	}
}

func TestJSONBridgeExposesDocumentOperationsStrictly(t *testing.T) {
	service := documentService(t)
	bridge := NewJSONBridge(service)
	event := validEvent("event-1", []strategydocument.Driver{{ID: "driver-1", Order: 0}})
	command := CreateEventCommand{
		CommandHeader: documentHeader("bridge-create", OperationCreateEvent, 0),
		Event:         event,
		UpdatedAt:     time.Date(2026, 8, 21, 18, 0, 0, 0, time.UTC),
	}
	raw, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := bridge.Execute(context.Background(), raw); err != nil {
		t.Fatalf("bridge create_event: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	fields["unexpected"] = json.RawMessage(`true`)
	invalid, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := bridge.Execute(context.Background(), invalid); !errors.Is(err, ErrInvalidCommand) {
		t.Fatalf("unknown field error = %v, want invalid command", err)
	}
}

func TestDocumentV2CoexistsWithDraftRevisionAndActivePlanLifecycle(t *testing.T) {
	ctx := context.Background()
	service := documentService(t)
	now := time.Date(2026, 8, 21, 20, 0, 0, 0, time.UTC)
	event := validEvent("event-1", []strategydocument.Driver{{ID: "driver-1", Order: 0}})
	documentCreated, err := service.CreateEvent(ctx, CreateEventCommand{
		CommandHeader: documentHeader("event", OperationCreateEvent, 0),
		Event:         event,
		UpdatedAt:     now,
	})
	if err != nil {
		t.Fatal(err)
	}
	draft := validDraft("draft-1", "plan-1", 42)
	created, err := service.Create(ctx, CreateCommand[testPayload]{
		CommandHeader: commandHeader("draft", OperationCreate, documentCreated.RepositoryVersion),
		Draft:         draft,
	})
	if err != nil {
		t.Fatal(err)
	}
	saved, err := service.SaveRevision(ctx, SaveRevisionCommand[testPayload]{
		CommandHeader: commandHeader("revision", OperationSaveRevision, created.RepositoryVersion),
		Draft:         draft,
		RevisionID:    "revision-1",
		CreatedAt:     now.Add(time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	activated, err := service.Activate(ctx, ActivateCommand{
		CommandHeader: commandHeader("activate", OperationActivate, saved.RepositoryVersion),
		Revision:      saved.Revision.Ref(),
		ActivationID:  "activation-1",
		ActivatedAt:   now.Add(2 * time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	if activated.ActivePlan == nil || activated.ActivePlan.Revision != saved.Revision.Ref() {
		t.Fatalf("active plan = %#v", activated.ActivePlan)
	}
	listed, err := service.ListEvents(ctx, ListEventsCommand{
		CommandHeader: documentHeader("events", OperationListEvents, activated.RepositoryVersion),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(listed.Events) != 1 || listed.Events[0].ID != event.ID {
		t.Fatalf("lifecycle lost event document: %+v", listed.Events)
	}
}

func documentService(t *testing.T) *Service[testPayload] {
	t.Helper()
	repo, err := repository.Open[testPayload](t.TempDir(), repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	return NewService[testPayload](repo)
}

func documentHeader(id CommandID, operation Operation, version uint64) CommandHeader {
	return CommandHeader{
		ProtocolVersion:           ProtocolVersionV1,
		CommandID:                 id,
		Operation:                 operation,
		ExpectedRepositoryVersion: version,
	}
}

func validEvent(id strategydocument.EventID, drivers []strategydocument.Driver) strategydocument.Event {
	order := make([]strategydocument.DriverID, len(drivers))
	for index, driver := range drivers {
		order[index] = driver.ID
	}
	return strategydocument.Event{
		ID:             id,
		Name:           sourced("Evento"),
		Source:         sourcedValue(strategydocument.EventSourceCustom),
		Track:          sourced("Spa"),
		Class:          sourced("LMGT3"),
		DurationMin:    sourcedValue(120),
		StartAt:        sourcedValue[*time.Time](nil),
		Drivers:        drivers,
		TankLiters:     sourcedValue(90.0),
		PitLossSeconds: sourcedValue(60.0),
		Strategies:     []strategydocument.Variant{validVariant("variant-1", order)},
		Availability:   map[strategydocument.DriverID][]strategydocument.AvailabilityWindow{},
		FillMode:       sourcedValue(strategydocument.FillModeManual),
		TyreInventory: strategydocument.TyreInventory{
			Sets:       []strategydocument.TyreSet{},
			ByCompound: map[strategydocument.TyreCompound]int{},
		},
	}
}

func validVariant(id strategydocument.VariantID, order []strategydocument.DriverID) strategydocument.Variant {
	return strategydocument.Variant{
		ID:        id,
		Name:      sourced(string(id)),
		Note:      sourced(""),
		Mode:      sourcedValue(strategydocument.VariantModeDry),
		Order:     order,
		State:     sourcedValue(strategydocument.VariantStateDraft),
		Overrides: map[string]json.RawMessage{},
		Tyres:     map[string]json.RawMessage{},
	}
}

func sourced(value string) strategydocument.Sourced[string] {
	return sourcedValue(value)
}

func sourcedValue[T any](value T) strategydocument.Sourced[T] {
	return strategydocument.Sourced[T]{
		Value: value,
		Evidence: strategydocument.Evidence{
			Provenance: strategydocument.Provenance{Kind: strategydocument.ProvenanceManual, SourceID: "test"},
			Confidence: strategydocument.Confidence{Level: strategydocument.ConfidenceHigh, Basis: "test"},
		},
	}
}

func assertDriverAbsent(t *testing.T, event strategydocument.Event, driverID strategydocument.DriverID) {
	t.Helper()
	for _, driver := range event.Drivers {
		if driver.ID == driverID {
			t.Fatalf("deleted driver %q remains in drivers", driverID)
		}
	}
	if _, exists := event.Availability[driverID]; exists {
		t.Fatalf("deleted driver %q remains in availability", driverID)
	}
	for _, variant := range event.Strategies {
		for _, candidate := range variant.Order {
			if candidate == driverID {
				t.Fatalf("deleted driver %q remains in variant %q", driverID, variant.ID)
			}
		}
	}
}
