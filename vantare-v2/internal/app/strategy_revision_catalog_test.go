package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func revisionCatalogFixture(t *testing.T) (*TelemetryAnalysisService, []TelemetryAnalysisOpenedSession, []strategyprojection.AnalysisRevisionRef, string) {
	t.Helper()
	svc, path, now := telemetryAnalysisTestService(t, true)
	t.Cleanup(func() {
		if err := svc.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	svc.corrections = telemetryanalysis.NewCorrectionStore(t.TempDir())
	if err := os.WriteFile(filepath.Join(filepath.Dir(path), "second.duckdb"), []byte("second controlled parser fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		a, b := 10000.0, 10090.0
		columns := []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}
		reader := &telemetryAnalysisReaderStub{evidence: artifact.Evidence(), catalog: telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{{Name: "Lap", Unit: "count", Columns: columns}, {Name: "Lap Time", Unit: "s", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "DOUBLE"}}}}}, rows: []telemetryanalysis.LMUDuckDBRow{{TimestampSeconds: &a, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}}, {TimestampSeconds: &b, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}}}}
		for key, value := range map[string]string{"TrackName": "Imola", "TrackLayout": "Grand Prix", "CarName": "Test Car", "CarClass": "Hypercar", "SessionType": "Race", "WeatherConditions": "Clear"} {
			reader.catalog.Metadata = append(reader.catalog.Metadata, telemetryanalysis.LMUDuckDBMetadata{Key: key, Value: value, Present: true, Quality: telemetryanalysis.QualityValid})
		}
		return &correctionCommandReader{reader}, nil
	}
	ctx := context.Background()
	if _, err := svc.Discover(ctx); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(2 * time.Second)
	candidates, err := svc.Discover(ctx)
	if err != nil || len(candidates) != 2 {
		t.Fatalf("candidates: %v %v", candidates, err)
	}
	var opened []TelemetryAnalysisOpenedSession
	var refs []strategyprojection.AnalysisRevisionRef
	var combination string
	for _, candidate := range candidates {
		session, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
		if err != nil {
			t.Fatal(err)
		}
		prepared, err := svc.PrepareCorrections(ctx, session.SessionID)
		if err != nil {
			t.Fatal(err)
		}
		projection, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: session.SessionID, Base: prepared.Base, RevisionID: prepared.BaseRevisionID})
		if err != nil {
			t.Fatal(err)
		}
		opened = append(opened, session)
		refs = append(refs, projection.SourceRevisions[0])
		combination = projection.CombinationID
	}
	return svc, opened, refs, combination
}

func TestRevisionCatalogProjectsOnlyExactAuthorizedInputs(t *testing.T) {
	svc, opened, refs, combination := revisionCatalogFixture(t)
	catalog := NewStrategyRevisionCatalog(telemetryanalysis.NewSessionCatalog(nil), svc)
	ctx := context.Background()
	at := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	prepared, err := svc.PrepareCorrections(ctx, opened[0].SessionID)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := svc.SaveCorrections(ctx, TelemetryAnalysisCorrectionSaveRequest{SessionID: opened[0].SessionID, Base: prepared.Base, Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: prepared.BaseRevisionID, CommandID: "new-head", Reason: "explicit base restoration", LocalAuthorID: "test"}})
	if err != nil {
		t.Fatal(err)
	}
	if saved.HeadID == refs[0].RevisionID {
		t.Fatal("head did not advance")
	}
	result, err := catalog.ProjectStrategyRevisionInputs(ctx, combination, refs, at)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.SourceRevisions) != 2 || len(result.SourceSessions) != 2 {
		t.Fatal("lost sources")
	}
	for i, ref := range refs {
		if result.SourceRevisions[i] != ref {
			t.Fatal("revision substituted")
		}
	}
	if result.GeneratedAt != at {
		t.Fatal("requested time lost")
	}
	for _, field := range []string{"base", "snapshot", "revision", "source"} {
		bad := append([]strategyprojection.AnalysisRevisionRef(nil), refs...)
		switch field {
		case "base":
			bad[0].BaseDigest = strings.Repeat("d", 64)
		case "snapshot":
			bad[0].SnapshotID = strings.Repeat("d", 64)
		case "revision":
			bad[0].RevisionID = strings.Repeat("d", 64)
		case "source":
			bad[0].SessionID = "missing"
		}
		got, err := catalog.ProjectStrategyRevisionInputs(ctx, combination, bad, at)
		if err == nil || got.ContractVersion != "" {
			t.Fatalf("%s accepted or partial result: %v", field, err)
		}
	}
	if _, err := catalog.ProjectStrategyRevisionInputs(ctx, "different", refs, at); err == nil {
		t.Fatal("foreign combination accepted")
	}
	if _, err := catalog.ProjectStrategyRevisionInputs(ctx, combination, []strategyprojection.AnalysisRevisionRef{refs[0], refs[0]}, at); err == nil {
		t.Fatal("duplicate accepted")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := catalog.ProjectStrategyRevisionInputs(cancelled, combination, refs, at); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel: %v", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: false}
	if _, err := catalog.ProjectStrategyRevisionInputs(ctx, combination, refs, at); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatalf("license: %v", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: true}
	candidates, err := svc.Discover(ctx)
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidates[0].ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := catalog.ProjectStrategyRevisionInputs(ctx, combination, refs, at); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatalf("ambiguous source: %v", err)
	}
	if err := svc.CloseSession(duplicate.SessionID); err != nil {
		t.Fatal(err)
	}
	if err := svc.CloseSession(opened[1].SessionID); err != nil {
		t.Fatal(err)
	}
	if got, err := catalog.ProjectStrategyRevisionInputs(ctx, combination, refs, at); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) || got.ContractVersion != "" {
		t.Fatalf("closed source produced partial result: %v", err)
	}
}
