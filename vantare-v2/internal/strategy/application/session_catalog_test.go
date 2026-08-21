package application

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type sessionCatalogStub struct {
	entries    []telemetryanalysis.CombinationCatalogEntry
	projection strategyprojection.StrategyInputProjectionV2
	projected  *[]string
}

type sessionCatalogRepository[T any] struct {
	snapshot    repository.Snapshot[T]
	commitCalls int
}

func (repo *sessionCatalogRepository[T]) Snapshot(context.Context) (repository.Snapshot[T], error) {
	return repo.snapshot, nil
}

func (repo *sessionCatalogRepository[T]) Commit(context.Context, uint64, repository.ChangeSet[T]) (repository.CommitResult[T], error) {
	repo.commitCalls++
	return repository.CommitResult[T]{Snapshot: repo.snapshot}, nil
}

func (stub sessionCatalogStub) ListSessionCombinations(context.Context) ([]telemetryanalysis.CombinationCatalogEntry, error) {
	return stub.entries, nil
}

func (stub sessionCatalogStub) ProjectStrategyInputs(_ context.Context, _ string, sessions []string, _ time.Time) (strategyprojection.StrategyInputProjectionV2, error) {
	if stub.projected != nil {
		*stub.projected = append([]string(nil), sessions...)
	}
	return stub.projection, nil
}

func TestGetEventPlanningInputsUsesOnlyIncludedSessionsAndPreservesOverride(t *testing.T) {
	generatedAt := time.Date(2026, 8, 22, 12, 0, 0, 123456789, time.UTC)
	projection := strategyprojection.StrategyInputProjectionV2{CombinationID: "lmu:combo"}
	override := strategydocument.NumericInputOverride{
		Value: 3.2, Presence: strategyprojection.PresenceValid,
		Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: "orbit:event-1"},
		Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "orbit-input.v1"},
	}
	document := &strategydocument.StrategyDocumentV2{Events: []strategydocument.Event{{
		ID: "event-1",
		Combination: &strategydocument.CombinationReference{CombinationID: "lmu:combo", Sessions: []strategydocument.SessionSelection{
			{SessionID: "race-1", Included: true}, {SessionID: "practice-1", Included: false},
		}},
		PlanningInputs: &strategydocument.PlanningInputs{Overrides: map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{
			strategydocument.PlanningInputFuelPerLap: override,
		}},
	}}}
	repo := &sessionCatalogRepository[any]{snapshot: repository.Snapshot[any]{Version: 9, StrategyDocument: document}}
	var projected []string
	service := NewServiceWithSessionCatalog[any](repo, sessionCatalogStub{projection: projection, projected: &projected})
	result, err := service.GetEventPlanningInputs(context.Background(), GetEventPlanningInputsCommand{
		CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "inputs", Operation: OperationGetEventPlanningInputs, ExpectedRepositoryVersion: 9},
		EventID:       "event-1", GeneratedAt: generatedAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.PlanningInputStatus != PlanningInputAvailable || result.PlanningInputs == nil || result.PlanningInputs.Projection != &projection && result.PlanningInputs.Projection.CombinationID != projection.CombinationID {
		t.Fatalf("result = %+v", result)
	}
	if len(projected) != 1 || projected[0] != "race-1" {
		t.Fatalf("projected sessions = %v", projected)
	}
	if got := result.PlanningInputs.Overrides[strategydocument.PlanningInputFuelPerLap]; got != override {
		t.Fatalf("override = %+v", got)
	}
	if repo.commitCalls != 0 {
		t.Fatalf("query committed %d times", repo.commitCalls)
	}
}

func TestListSessionCombinationsAdaptsAnalysisAndKeepsRepositoryReadOnly(t *testing.T) {
	repo := &sessionCatalogRepository[any]{snapshot: repository.Snapshot[any]{Version: 7}}
	activity := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	catalog := sessionCatalogStub{entries: []telemetryanalysis.CombinationCatalogEntry{{
		Combination:  telemetryanalysis.CombinationIdentity{ID: "lmu:combo", SimID: "lmu", TrackName: "Fuji", TrackLayout: "Classic", CarName: "499P", CarClass: "Hypercar"},
		SessionCount: 1, RaceCount: 1, LastActivity: activity,
		ClimateBuckets: []telemetryanalysis.ClimateBucketCount{{Bucket: strategyprojection.ClimateBucketDry, Laps: 12}},
		Sessions:       []telemetryanalysis.SessionCatalogEntry{{SessionID: "race-1", Type: telemetryanalysis.SessionTypeRace, Status: telemetryanalysis.SessionStatusIdentifiedUsable, DefaultIncluded: true, LastActivity: activity}},
	}}}
	service := NewServiceWithSessionCatalog[any](repo, catalog)
	result, err := service.ListSessionCombinations(context.Background(), ListSessionCombinationsCommand{CommandHeader: CommandHeader{
		ProtocolVersion: ProtocolVersionV1, CommandID: "sessions", Operation: OperationListSessionCombinations, ExpectedRepositoryVersion: 7,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if result.RepositoryVersion != 7 || result.SessionCatalogStatus != SessionCatalogAvailable || len(result.SessionCombinations) != 1 {
		t.Fatalf("result = %+v", result)
	}
	if result.SessionCombinations[0].Sessions[0].SessionID != "race-1" || result.SessionCombinations[0].ClimateBuckets[0].Laps != 12 {
		t.Fatalf("combination = %+v", result.SessionCombinations[0])
	}
	if repo.commitCalls != 0 {
		t.Fatalf("query committed %d times", repo.commitCalls)
	}
}

func TestListSessionCombinationsReturnsHonestEmptyWithoutAuthorizedSource(t *testing.T) {
	repo := &sessionCatalogRepository[any]{snapshot: repository.Snapshot[any]{Version: 2}}
	result, err := NewService[any](repo).ListSessionCombinations(context.Background(), ListSessionCombinationsCommand{CommandHeader: CommandHeader{
		ProtocolVersion: ProtocolVersionV1, CommandID: "empty", Operation: OperationListSessionCombinations, ExpectedRepositoryVersion: 2,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if result.SessionCatalogStatus != SessionCatalogNoAuthorizedTelemetry || len(result.SessionCombinations) != 0 {
		t.Fatalf("result = %+v", result)
	}
}

func TestJSONBridgeListsSessionCombinations(t *testing.T) {
	repo := &sessionCatalogRepository[json.RawMessage]{snapshot: repository.Snapshot[json.RawMessage]{Version: 3}}
	bridge := NewJSONBridge(NewServiceWithSessionCatalog[json.RawMessage](repo, sessionCatalogStub{}))
	raw, err := bridge.Execute(context.Background(), []byte(`{"protocolVersion":"strategy.application.v1","commandId":"catalog","operation":"list_session_combinations","expectedRepositoryVersion":3}`))
	if err != nil {
		t.Fatal(err)
	}
	var result Result[json.RawMessage]
	if err := json.Unmarshal(raw, &result); err != nil || result.SessionCatalogStatus != SessionCatalogNoAuthorizedTelemetry {
		t.Fatalf("result = %s, error = %v", raw, err)
	}
}
