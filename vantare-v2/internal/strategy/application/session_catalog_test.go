package application

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type sessionCatalogStub struct {
	listing    telemetryanalysis.SessionCatalogListing
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

func (stub sessionCatalogStub) ListSessionCombinations(context.Context) (telemetryanalysis.SessionCatalogListing, error) {
	return stub.listing, nil
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
	catalog := sessionCatalogStub{listing: telemetryanalysis.SessionCatalogListing{
		Combinations: []telemetryanalysis.CombinationCatalogEntry{{
			Combination:  telemetryanalysis.CombinationIdentity{ID: "lmu:combo", SimID: "lmu", TrackName: "Fuji", TrackLayout: "Classic", CarName: "499P", CarClass: "Hypercar"},
			SessionCount: 1, RaceCount: 1, LastActivity: activity,
			ClimateBuckets: []telemetryanalysis.ClimateBucketCount{{Bucket: strategyprojection.ClimateBucketDry, Laps: 12}},
			Sessions:       []telemetryanalysis.SessionCatalogEntry{{SessionID: "race-1", Type: telemetryanalysis.SessionTypeRace, Status: telemetryanalysis.SessionStatusIdentifiedUsable, DefaultIncluded: true, LastActivity: activity}},
		}},
		Exclusions: []telemetryanalysis.SessionCatalogExclusion{{SessionID: "legacy-bad", Reason: "invalid historical session classification: missing SessionType"}},
	}}
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
	if len(result.SessionCatalogExclusions) != 1 || result.SessionCatalogExclusions[0].SessionID != "legacy-bad" || result.SessionCatalogExclusions[0].Reason != "invalid historical session classification: missing SessionType" {
		t.Fatalf("exclusions = %+v", result.SessionCatalogExclusions)
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

func TestPinnedSelectionCannotFallBackToUnversionedCatalog(t *testing.T) {
	ref := strategyprojection.AnalysisRevisionRef{SessionID: "race-1", BaseDigest: strings.Repeat("a", 64), RevisionID: strings.Repeat("b", 64), SnapshotID: strings.Repeat("c", 64)}
	doc := &strategydocument.StrategyDocumentV2{Events: []strategydocument.Event{{ID: "event-1", Combination: &strategydocument.CombinationReference{CombinationID: "combo", Sessions: []strategydocument.SessionSelection{{SessionID: "race-1", Included: true, Revision: &ref}}}}}}
	repo := &sessionCatalogRepository[any]{snapshot: repository.Snapshot[any]{Version: 9, StrategyDocument: doc}}
	var projected []string
	service := NewServiceWithSessionCatalog[any](repo, sessionCatalogStub{projected: &projected})
	_, err := service.GetEventPlanningInputs(context.Background(), GetEventPlanningInputsCommand{CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "pinned", Operation: OperationGetEventPlanningInputs, ExpectedRepositoryVersion: 9}, EventID: "event-1", GeneratedAt: time.Now().UTC()})
	if !errors.Is(err, ErrPinnedAnalysisProjectionUnavailable) {
		t.Fatalf("error=%v", err)
	}
	if len(projected) != 0 || repo.commitCalls != 0 {
		t.Fatalf("fallback or write occurred: %v / %d", projected, repo.commitCalls)
	}
	if doc.Events[0].Combination.Sessions[0].Revision != &ref {
		t.Fatal("selection changed")
	}
}

type revisionCatalogStub struct {
	sessionCatalogStub
	refs    *[]strategyprojection.AnalysisRevisionRef
	failure error
	cancel  context.CancelFunc
}

func (stub revisionCatalogStub) ProjectStrategyRevisionInputs(_ context.Context, _ string, refs []strategyprojection.AnalysisRevisionRef, _ time.Time) (strategyprojection.StrategyInputProjectionV2, error) {
	if stub.cancel != nil {
		stub.cancel()
	}
	*stub.refs = append([]strategyprojection.AnalysisRevisionRef(nil), refs...)
	return stub.projection, stub.failure
}
func TestPlanningInputsUsesAndChecksPinnedRevisionProducer(t *testing.T) {
	raw, err := os.ReadFile("../../telemetryanalysis/strategyprojection/testdata/strategyinputprojection_v2_new.json")
	if err != nil {
		t.Fatal(err)
	}
	var golden strategyprojection.StrategyInputProjectionV2
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"valid", "revision", "combination", "missing", "failure", "partial", "cancelled"} {
		t.Run(mode, func(t *testing.T) {
			ref := strategyprojection.AnalysisRevisionRef{SessionID: "race-1", BaseDigest: strings.Repeat("a", 64), RevisionID: strings.Repeat("b", 64), SnapshotID: strings.Repeat("c", 64)}
			projection := golden
			projection.SourceSessions = []string{ref.SessionID}
			projection.SourceRevisions = []strategyprojection.AnalysisRevisionRef{ref}
			if mode == "revision" {
				projection.SourceRevisions[0].RevisionID = strings.Repeat("d", 64)
			}
			if mode == "combination" {
				projection.CombinationID = "foreign"
			}
			if mode == "missing" {
				projection.SourceRevisions = nil
			}
			sessions := []strategydocument.SessionSelection{{SessionID: ref.SessionID, Included: true, Revision: &ref}, {SessionID: "excluded", Included: false}}
			if mode == "partial" {
				sessions[1].Included = true
			}
			override := strategydocument.NumericInputOverride{Value: 3.2, Presence: strategyprojection.PresenceValid, Provenance: strategyprojection.Provenance{Kind: strategyprojection.ProvenanceManual, SourceID: "test"}, Confidence: strategyprojection.Confidence{SampleSize: 1, ComputationVersion: "test"}}
			doc := &strategydocument.StrategyDocumentV2{Events: []strategydocument.Event{{ID: "event", Combination: &strategydocument.CombinationReference{CombinationID: golden.CombinationID, Sessions: sessions}, PlanningInputs: &strategydocument.PlanningInputs{Overrides: map[strategydocument.PlanningInputField]strategydocument.NumericInputOverride{strategydocument.PlanningInputFuelPerLap: override}}}}}
			repo := &sessionCatalogRepository[any]{snapshot: repository.Snapshot[any]{Version: 9, StrategyDocument: doc}}
			var legacy []string
			var gotRefs []strategyprojection.AnalysisRevisionRef
			catalog := revisionCatalogStub{sessionCatalogStub: sessionCatalogStub{projection: projection, projected: &legacy}, refs: &gotRefs}
			if mode == "failure" {
				catalog.failure = context.DeadlineExceeded
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if mode == "cancelled" {
				catalog.cancel = cancel
			}
			service := NewServiceWithSessionCatalog[any](repo, catalog)
			result, err := service.GetEventPlanningInputs(ctx, GetEventPlanningInputsCommand{CommandHeader: CommandHeader{ProtocolVersion: ProtocolVersionV1, CommandID: "exact", Operation: OperationGetEventPlanningInputs, ExpectedRepositoryVersion: 9}, EventID: "event", GeneratedAt: time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)})
			if mode == "valid" {
				if err != nil {
					t.Fatal(err)
				}
				if len(gotRefs) != 1 || gotRefs[0] != ref || result.PlanningInputStatus != PlanningInputAvailable || result.PlanningInputs.Projection.SourceRevisions[0] != ref {
					t.Fatal("wrong producer or revision")
				}
				if result.PlanningInputs.Overrides[strategydocument.PlanningInputFuelPerLap] != override {
					t.Fatal("override lost")
				}
			} else if err == nil || result.PlanningInputs != nil {
				t.Fatalf("%s accepted or returned partial inputs", mode)
			}
			if mode == "cancelled" && !errors.Is(err, context.Canceled) {
				t.Fatalf("cancellation lost: %v", err)
			}
			if mode == "failure" && !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("failure changed: %v", err)
			}
			if mode == "partial" && len(gotRefs) != 0 {
				t.Fatal("partial selection dispatched")
			}
			if len(legacy) != 0 || repo.commitCalls != 0 {
				t.Fatal("fallback or write")
			}
			if doc.Events[0].PlanningInputs.Projection != nil {
				t.Fatal("query changed document")
			}
		})
	}
}
