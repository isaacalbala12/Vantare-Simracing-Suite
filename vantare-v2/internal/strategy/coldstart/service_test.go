package coldstart

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type importerStub struct{ calls int }

func (stub *importerStub) Import(_ context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	stub.calls++
	return telemetryanalysis.AuthorizedSessionModel{Session: telemetryanalysis.HistoricalSession{ID: candidate.Locator}}, nil
}

type stagingFixtureImporter struct{ root string }

func (importer stagingFixtureImporter) Import(ctx context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	artifact, err := telemetryanalysis.BuildAuthorizedHistoricalArtifact(ctx, telemetryanalysis.OSContentSource{}, candidate, telemetryanalysis.ImportOptions{
		Storage: telemetryanalysis.StorageReference, Access: telemetryanalysis.AccessUserApproved, MaxBytes: 1024,
		ParserID: telemetryanalysis.LMUDuckDBParserID, ParserVersion: telemetryanalysis.LMUDuckDBParserVersion,
		Provenance: telemetryanalysis.Provenance{Kind: telemetryanalysis.ProvenanceUser, EvidenceID: "cold-start-fixture"},
	})
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, err
	}
	staged, err := telemetryanalysis.StageAuthorizedHistoricalArtifact(ctx, telemetryanalysis.OSContentSource{}, candidate, artifact, importer.root)
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, err
	}
	defer staged.Cleanup()
	return telemetryanalysis.AuthorizedSessionModel{Artifact: artifact, Session: telemetryanalysis.HistoricalSession{ID: candidate.Locator}}, nil
}

type sessionStoreStub struct {
	models []telemetryanalysis.AuthorizedSessionModel
}

func (store *sessionStoreStub) Add(_ context.Context, model telemetryanalysis.AuthorizedSessionModel) error {
	store.models = append(store.models, model)
	return nil
}

func (store *sessionStoreStub) ListAuthorizedSessions(context.Context) ([]telemetryanalysis.AuthorizedSessionModel, error) {
	return append([]telemetryanalysis.AuthorizedSessionModel(nil), store.models...), nil
}

func TestServiceShowsOnceImportsWithProgressAndPopulatesSessionSource(t *testing.T) {
	discover := func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}, {Locator: "lmu://two"}}, nil
	}
	importer := &importerStub{}
	store := &sessionStoreStub{}
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "cold-start.json"), Discover: discover, Importer: importer, Store: store})

	status, err := service.Status(context.Background())
	if err != nil || !status.ShouldShow || status.Found != 2 || status.Decision != DecisionPending {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	first, err := service.ImportNext(context.Background())
	if err != nil || first.Imported != 1 || first.Total != 2 || first.Done {
		t.Fatalf("first=%+v err=%v", first, err)
	}
	second, err := service.ImportNext(context.Background())
	if err != nil || second.Imported != 2 || second.Total != 2 || !second.Done || len(store.models) != 2 {
		t.Fatalf("second=%+v models=%d err=%v", second, len(store.models), err)
	}
	reopened := NewService(ServiceOptions{StatePath: filepath.Join(filepath.Dir(service.options.StatePath), "cold-start.json"), Discover: discover, Importer: importer, Store: store})
	settled, err := reopened.Status(context.Background())
	if err != nil || settled.ShouldShow || settled.Decision != DecisionAccepted {
		t.Fatalf("settled=%+v err=%v", settled, err)
	}
}

func TestServicePersistsRejectionWithoutImporting(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "cold-start.json")
	importer := &importerStub{}
	discover := func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}}, nil
	}
	service := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: &sessionStoreStub{}})
	if err := service.Reject(context.Background()); err != nil {
		t.Fatal(err)
	}
	reopened := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: &sessionStoreStub{}})
	status, err := reopened.Status(context.Background())
	if err != nil || status.ShouldShow || status.Decision != DecisionRejected || importer.calls != 0 {
		t.Fatalf("status=%+v calls=%d err=%v", status, importer.calls, err)
	}
}

func TestServiceImportProgressesWhenStagingRootIsMissing(t *testing.T) {
	sourceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(sourceRoot, "fixture.duckdb"), []byte("synthetic duckdb fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	candidates, err := DiscoverStandardLMU(context.Background(), sourceRoot, time.Millisecond)
	if err != nil || len(candidates) != 1 {
		t.Fatalf("DiscoverStandardLMU() candidates=%d error=%v", len(candidates), err)
	}
	stagingRoot := filepath.Join(t.TempDir(), "missing", "telemetry-staging")
	service := NewService(ServiceOptions{
		StatePath: filepath.Join(t.TempDir(), "cold-start.json"),
		Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
			return candidates, nil
		},
		Importer: stagingFixtureImporter{root: stagingRoot},
		Store:    &sessionStoreStub{},
	})

	progress, err := service.ImportNext(context.Background())
	if err != nil || progress.Imported != 1 || progress.Total != 1 || !progress.Done {
		t.Fatalf("ImportNext() progress=%+v error=%v", progress, err)
	}
	if info, err := os.Stat(stagingRoot); err != nil || !info.IsDir() {
		t.Fatalf("staging root was not created: info=%v error=%v", info, err)
	}
}
