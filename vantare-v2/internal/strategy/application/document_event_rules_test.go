package application

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
)

func TestEventRulesPersistThroughCommandsAndReload(t *testing.T) {
	for _, withRules := range []bool{false, true} {
		t.Run(map[bool]string{false: "edit existing", true: "create with rules"}[withRules], func(t *testing.T) {
			ctx := context.Background()
			root := t.TempDir()
			repo, err := repository.Open[testPayload](root, repository.Options{})
			if err != nil {
				t.Fatal(err)
			}
			service := NewService[testPayload](repo)
			event := validEvent("event-rules", []document.Driver{{ID: "driver-1", Order: 0}})
			minimum := 2
			rules := sourcedValue(solver.EventRules{MinPitStops: &minimum, RequiredWindows: []solver.PitWindow{{FromLap: 10, ToLap: 20}}})
			if withRules {
				event.Rules = &rules
			}
			now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
			result, err := service.CreateEvent(ctx, CreateEventCommand{CommandHeader: documentHeader("create-rules", OperationCreateEvent, 0), Event: event, UpdatedAt: now})
			if err != nil {
				t.Fatal(err)
			}
			if !withRules {
				if result.StrategyDocument.SchemaVersion != document.SchemaVersionV2 {
					t.Fatal("unnecessary schema change")
				}
				event.Rules = &rules
				result, err = service.EditEvent(ctx, EditEventCommand{CommandHeader: documentHeader("add-rules", OperationEditEvent, result.RepositoryVersion), Event: event, UpdatedAt: now.Add(time.Minute)})
				if err != nil {
					t.Fatal(err)
				}
			}
			if result.StrategyDocument.SchemaVersion != document.SchemaVersionV2Rules {
				t.Fatal("missing schema promotion")
			}
			reopened, err := repository.Open[testPayload](root, repository.Options{})
			if err != nil {
				t.Fatal(err)
			}
			service = NewService[testPayload](reopened)
			listed, err := service.ListEvents(ctx, ListEventsCommand{CommandHeader: documentHeader("reload-rules", OperationListEvents, result.RepositoryVersion)})
			if err != nil {
				t.Fatal(err)
			}
			if len(listed.Events) != 1 || !reflect.DeepEqual(listed.Events[0].Rules, &rules) {
				t.Fatal("rules or evidence lost after reload")
			}
			event.Rules = nil
			removed, err := service.EditEvent(ctx, EditEventCommand{CommandHeader: documentHeader("remove-rules", OperationEditEvent, listed.RepositoryVersion), Event: event, UpdatedAt: now.Add(2 * time.Minute)})
			if err != nil {
				t.Fatal(err)
			}
			if removed.StrategyDocument.SchemaVersion != document.SchemaVersionV2Rules || removed.StrategyDocument.Events[0].Rules != nil {
				t.Fatal("removal downgraded schema or retained rules")
			}
		})
	}
}
