package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	strategyapplication "github.com/vantare/overlays/v2/internal/strategy/application"
	"github.com/vantare/overlays/v2/internal/strategy/coldstart"
	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type recordedRealRepository struct{ snapshot repository.Snapshot[any] }

func (repo recordedRealRepository) Snapshot(context.Context) (repository.Snapshot[any], error) {
	return repo.snapshot, nil
}
func (repo recordedRealRepository) Commit(context.Context, uint64, repository.ChangeSet[any]) (repository.CommitResult[any], error) {
	return repository.CommitResult[any]{}, errors.New("unexpected write during real projection query")
}

// Explicit opt-in: real user bytes, production parser/trust/authorization gates,
// controlled eligible-license authorizer. This is not a Wails/login acceptance.
type selectedRealMetadata struct {
	telemetryanalysis.OSMetadataSource
	name string
}

func (source selectedRealMetadata) ReadDir(ctx context.Context, root string) ([]telemetryanalysis.MetadataEntry, error) {
	entries, err := source.OSMetadataSource.ReadDir(ctx, root)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if entry.Name == source.name {
			return []telemetryanalysis.MetadataEntry{entry}, nil
		}
	}
	return nil, os.ErrNotExist
}
func realSourceHash(t *testing.T, path string) string {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.New()
	_, readErr := io.Copy(hash, file)
	closeErr := file.Close()
	if err := errors.Join(readErr, closeErr); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(hash.Sum(nil))
}
func TestRecordedStrategyRealDuckDB(t *testing.T) {
	source, runtimeApp := os.Getenv("ISA1088_REAL_SOURCE"), os.Getenv("ISA1088_RUNTIME_APP")
	if source == "" || runtimeApp == "" {
		t.Skip("requires explicit real source and trusted runtime application directory")
	}
	source, runtimeApp = filepath.Clean(source), filepath.Clean(runtimeApp)
	before := realSourceHash(t, source)
	t.Cleanup(func() {
		if after := realSourceHash(t, source); after != before {
			t.Errorf("original changed: %s != %s", after, before)
		} else {
			t.Logf("original hash unchanged: %s", before)
		}
	})
	root := t.TempDir()
	svc, err := NewTelemetryAnalysisService(TelemetryAnalysisConfig{
		LMURoots: []string{filepath.Dir(source)}, ApplicationDirectory: runtimeApp,
		StagingRoot: filepath.Join(root, "staging"), CorrectionRoot: filepath.Join(root, "corrections"),
		StabilityWindow: time.Second, MaxCandidates: 1, MaxSourceBytes: 2 << 30, MaxPageRows: 4096,
	}, telemetryAnalysisAuthorizerStub{allowed: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := svc.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	if !svc.runtimeReady {
		t.Fatal("production trusted runtime unavailable")
	}
	// Limit discovery to the explicitly named original, using real OS metadata.
	svc.metadata = selectedRealMetadata{name: filepath.Base(source)}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if _, err := svc.Discover(ctx); err != nil {
		t.Fatal(err)
	}
	// Real elapsed stability window, not a forged clock or bypassed gate.
	timer := time.NewTimer(1100 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	candidates, err := svc.Discover(ctx)
	if err != nil || len(candidates) != 1 {
		t.Fatalf("discover: %v, count %d", err, len(candidates))
	}
	opened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidates[0].ID, UserApproved: true})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Logf("opened %d channels", len(opened.Session.Channels))
	prepared, err := svc.PrepareCorrections(ctx, opened.SessionID)
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	request := TelemetryAnalysisCorrectionRevisionRequest{SessionID: opened.SessionID, Base: prepared.Base, RevisionID: prepared.BaseRevisionID}
	projection, err := svc.ProjectCorrection(ctx, request)
	if err != nil {
		t.Fatalf("project: %v", err)
	}
	if err := projection.Validate(); err != nil {
		t.Fatal(err)
	}
	saved, err := svc.SaveCorrections(ctx, TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: prepared.Base, Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: prepared.BaseRevisionID, CommandID: "real-base-restore", Reason: "verify exact recorded revision", LocalAuthorID: "local-validation"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if saved.HeadID == prepared.BaseRevisionID {
		t.Fatal("head did not advance")
	}
	catalog := NewStrategyRevisionCatalog(telemetryanalysis.NewSessionCatalog(nil), svc)
	exact, err := catalog.ProjectStrategyRevisionInputs(ctx, projection.CombinationID, projection.SourceRevisions, time.Now().UTC().Truncate(time.Millisecond))
	if err != nil {
		t.Fatalf("joint producer: %v", err)
	}
	if len(exact.SourceRevisions) != 1 || exact.SourceRevisions[0] != projection.SourceRevisions[0] {
		t.Fatal("exact revision replaced by new head")
	}
	t.Logf("exact revision retained: %s; combination: %s", exact.SourceRevisions[0].RevisionID, exact.CombinationID)
	ref := exact.SourceRevisions[0]
	repo := recordedRealRepository{snapshot: repository.Snapshot[any]{Version: 1, StrategyDocument: &strategydocument.StrategyDocumentV2{
		Events: []strategydocument.Event{{ID: "real-event", Combination: &strategydocument.CombinationReference{CombinationID: exact.CombinationID, Sessions: []strategydocument.SessionSelection{{SessionID: ref.SessionID, Included: true, Revision: &ref}}}}},
	}}}
	strategy := strategyapplication.NewServiceWithSessionCatalog[any](repo, catalog)
	command := strategyapplication.GetEventPlanningInputsCommand{CommandHeader: strategyapplication.CommandHeader{ProtocolVersion: strategyapplication.ProtocolVersionV1, CommandID: "real-inputs", Operation: strategyapplication.OperationGetEventPlanningInputs, ExpectedRepositoryVersion: 1}, EventID: "real-event", GeneratedAt: time.Now().UTC().Truncate(time.Millisecond)}
	inputs, err := strategy.GetEventPlanningInputs(ctx, command)
	if err != nil || inputs.PlanningInputs == nil || inputs.PlanningInputs.Projection == nil {
		t.Fatalf("Strategy inputs: %v", err)
	}
	if inputs.PlanningInputs.Projection.SourceRevisions[0] != ref {
		t.Fatal("Strategy replaced exact revision")
	}
	if err := svc.CloseSession(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := catalog.ProjectStrategyRevisionInputs(ctx, projection.CombinationID, projection.SourceRevisions, time.Now().UTC().Truncate(time.Millisecond)); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatalf("closed source: %v", err)
	}
	if _, err := strategy.GetEventPlanningInputs(ctx, command); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatalf("Strategy closed source: %v", err)
	}
	reopened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidates[0].ID, UserApproved: true})
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	request.SessionID = reopened.SessionID
	restored, err := svc.ProjectCorrection(ctx, request)
	if err != nil || restored.SourceRevisions[0] != ref {
		t.Fatalf("exact revision after reopen: %v", err)
	}
	t.Log("prepare, projection, saved head, exact prior revision, Strategy inputs, closed-source rejection and explicit reopen verified")
	verifyRecordedRealFamilyRevision(t, ctx, svc, reopened.SessionID, candidates[0].ID, prepared.Base, saved.HeadID)
	// Optional explicit export to an isolated diagnostic application's catalog.
	// This uses the existing importer, not handcrafted observed data.
	if exportPath := os.Getenv("ISA1088_EXPORT_CATALOG"); exportPath != "" {
		importer, err := coldstart.NewLMUImporter(runtimeApp, filepath.Join(root, "observed-staging"))
		if err != nil {
			t.Fatal(err)
		}
		candidate := svc.currentCandidate(candidates[0].ID)
		if candidate == nil {
			t.Fatal("candidate no longer available")
		}
		model, err := importer.Import(ctx, candidate.candidate)
		if err != nil {
			t.Fatalf("observed import: %v", err)
		}
		if model.Session.ID != ref.SessionID {
			t.Fatal("observed/native source identity mismatch")
		}
		store, err := telemetryanalysis.OpenAuthorizedSessionStore(filepath.Clean(exportPath))
		if err != nil {
			t.Fatal(err)
		}
		if err := store.Add(ctx, model); err != nil {
			t.Fatal(err)
		}
		t.Log("exported real observed model through existing importer")
	}
}
