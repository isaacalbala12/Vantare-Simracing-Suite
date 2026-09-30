package coldstart

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func reconciliationModel(locator string) telemetryanalysis.AuthorizedSessionModel {
	return telemetryanalysis.AuthorizedSessionModel{Session: telemetryanalysis.HistoricalSession{ID: locator, Provenance: telemetryanalysis.HistoricalProvenance{Source: telemetryanalysis.ManifestSource{Locator: locator}}}}
}

func TestReconciliationReportsLostCatalogEntryAndAllowsRetry(t *testing.T) {
	importer := &importerStub{}
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), CatalogRecovered: true, Store: &sessionStoreStub{}, Importer: importer, Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://lost"}}, nil
	}})
	if err := service.writeState(persistedState{Decision: DecisionAccepted, ImportedLocators: []string{"lmu://lost"}, Total: 1}); err != nil {
		t.Fatal(err)
	}
	status, err := service.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.Imported != 0 || !status.ShouldShow || status.Decision != DecisionAccepted || len(status.Failures) != 1 || status.Failures[0].Reason != "catalog_entry_missing" {
		t.Fatalf("lost entry hidden: %+v", status)
	}
	if importer.calls != 0 {
		t.Fatal("status unexpectedly imported a source")
	}
	if _, err := service.RetryFailures(context.Background()); err != nil {
		t.Fatal(err)
	}
	progress, err := service.ImportNext(context.Background())
	if err != nil || !progress.Done || progress.Imported != 1 || importer.calls != 1 {
		t.Fatalf("retry=%+v calls=%d err=%v", progress, importer.calls, err)
	}
}

func TestReconciliationDoesNotReimportStoredCandidateAfterProgressRollback(t *testing.T) {
	importer := &importerStub{}
	store := &sessionStoreStub{models: []telemetryanalysis.AuthorizedSessionModel{reconciliationModel("lmu://one")}}
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Store: store, Importer: importer, Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}, {Locator: "lmu://two"}}, nil
	}})
	progress, err := service.ImportNext(context.Background())
	if err != nil || progress.Imported != 2 || !progress.Done || importer.calls != 1 || len(store.models) != 2 {
		t.Fatalf("duplicate import: %+v calls=%d models=%d err=%v", progress, importer.calls, len(store.models), err)
	}
}

type unavailableReconciliationStore struct {
	sessionStoreStub
	calls int
}

func (s *unavailableReconciliationStore) ListAuthorizedSessions(context.Context) ([]telemetryanalysis.AuthorizedSessionModel, error) {
	s.calls++
	return nil, errors.New("catalog unavailable")
}

func TestReconciliationPreservesRejectionWithoutReadingCatalog(t *testing.T) {
	store := &unavailableReconciliationStore{}
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Store: store})
	if err := service.writeState(persistedState{Decision: DecisionRejected, ImportedLocators: []string{"lmu://old"}, Total: 1}); err != nil {
		t.Fatal(err)
	}
	status, err := service.Status(context.Background())
	if err != nil || status.Decision != DecisionRejected || status.ShouldShow || store.calls != 0 {
		t.Fatalf("rejection changed: %+v err=%v", status, err)
	}
}

func TestReconciliationCatalogErrorIsNotAnEmptyLibrary(t *testing.T) {
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Store: &unavailableReconciliationStore{}})
	if err := service.writeState(persistedState{Decision: DecisionAccepted, ImportedLocators: []string{"lmu://old"}, Total: 1}); err != nil {
		t.Fatal(err)
	}
	status, err := service.Status(context.Background())
	if err != nil || status.Reason != "catalog_unavailable" {
		t.Fatalf("unavailable catalog hidden: %+v err=%v", status, err)
	}
	state, err := service.readState()
	if err != nil || len(state.ImportedLocators) != 1 || state.Decision != DecisionAccepted {
		t.Fatalf("state overwritten: %+v err=%v", state, err)
	}
}

func TestReconciliationCountsRetainedSessionsOutsideCurrentDiscovery(t *testing.T) {
	store := &sessionStoreStub{models: []telemetryanalysis.AuthorizedSessionModel{reconciliationModel("lmu://old")}}
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Store: store, Importer: &importerStub{}, ImportConcurrency: 1, Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}, {Locator: "lmu://two"}}, nil
	}})
	if err := service.writeState(persistedState{Decision: DecisionPending, ImportedLocators: []string{"lmu://old"}, Total: 1}); err != nil {
		t.Fatal(err)
	}
	first, err := service.ImportNext(context.Background())
	if err != nil || first.Done || first.Total != 3 || first.Imported != 2 {
		t.Fatalf("premature completion: %+v err=%v", first, err)
	}
	status, err := service.Status(context.Background())
	if err != nil || status.Found != 3 || status.Imported != 2 || status.Decision != DecisionPending {
		t.Fatalf("status differs from progress: %+v err=%v", status, err)
	}
	last, err := service.ImportNext(context.Background())
	if err != nil || !last.Done || last.Total != 3 || last.Imported != 3 {
		t.Fatalf("completion: %+v err=%v", last, err)
	}
}

func TestReconciliationClearsFailureOnlyWhenAuthorizedSessionExists(t *testing.T) {
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Store: &sessionStoreStub{models: []telemetryanalysis.AuthorizedSessionModel{reconciliationModel("lmu://one")}}})
	if err := service.writeState(persistedState{Decision: DecisionAccepted, Failures: []Failure{{Locator: "lmu://one", Reason: "old_failure"}}, Total: 1}); err != nil {
		t.Fatal(err)
	}
	status, err := service.Status(context.Background())
	if err != nil || status.Imported != 1 || status.Skipped != 0 || status.ShouldShow {
		t.Fatalf("stored session still failed: %+v err=%v", status, err)
	}
}
func TestReconciliationStatusNeverAcceptsAnUnconfirmedImport(t *testing.T) {
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Store: &sessionStoreStub{}, Importer: &importerStub{}, Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) { return nil, nil }})
	service.candidates = []telemetryanalysis.Candidate{}
	status, err := service.Status(context.Background())
	if err != nil || status.Decision != DecisionPending {
		t.Fatalf("status granted consent: %+v err=%v", status, err)
	}
}
