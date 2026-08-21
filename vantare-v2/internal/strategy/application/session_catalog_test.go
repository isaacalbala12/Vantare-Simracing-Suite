package application

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type sessionCatalogStub struct {
	entries []telemetryanalysis.CombinationCatalogEntry
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
