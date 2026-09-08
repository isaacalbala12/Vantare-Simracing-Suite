package app

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestTelemetryAnalysisPreparesOnlyAuthorizedOpenCorrectionSource(t *testing.T) {
	svc, path, now := telemetryAnalysisTestService(t, true)
	t.Cleanup(func() {
		if err := svc.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	var reader *telemetryAnalysisReaderStub
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		// Controlled parser/permission contract fixture, not a real DuckDB bank.
		a, b := 10000.0, 10090.0
		reader = &telemetryAnalysisReaderStub{evidence: artifact.Evidence(), catalog: telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{{Name: "Lap", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}}}}, rows: []telemetryanalysis.LMUDuckDBRow{{TimestampSeconds: &a, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}}, {TimestampSeconds: &b, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}}}}
		return reader, nil
	}
	opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := svc.PrepareCorrections(context.Background(), opened.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Base.SessionID != opened.Session.ID || prepared.Base.SessionID == opened.SessionID || len(prepared.BaseRevisionID) != 64 {
		t.Fatal("handle used as content identity")
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("original changed")
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: false}
	reader.readErr = errors.New("must not read")
	if _, err := svc.PrepareCorrections(context.Background(), opened.SessionID); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("read without authority", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: true}
	reader.readErr = nil
	if _, err := svc.PrepareCorrections(context.Background(), path); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatal("accepted path", err)
	}
	svc.correctionReadMu.Lock()
	_, err = svc.PrepareCorrections(context.Background(), opened.SessionID)
	svc.correctionReadMu.Unlock()
	if !errors.Is(err, ErrTelemetryAnalysisBusy) {
		t.Fatal("unbounded concurrent analysis", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := svc.PrepareCorrections(ctx, opened.SessionID); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	reader.readErr = telemetryanalysis.ErrHistoricalSource
	if _, err := svc.PrepareCorrections(context.Background(), opened.SessionID); !errors.Is(err, ErrTelemetryAnalysisIncompatible) {
		t.Fatal(err)
	}
	if !reader.isClosed() {
		t.Fatal("failed reader not cleaned")
	}
	if _, err := svc.PrepareCorrections(context.Background(), opened.SessionID); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatal("retained failed handle", err)
	}
	reopened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	failTelemetryAnalysisStagingCleanupOnce(svc)
	reader.readErr = telemetryanalysis.ErrHistoricalSource
	if _, err := svc.PrepareCorrections(context.Background(), reopened.SessionID); !errors.Is(err, ErrTelemetryAnalysisCleanup) {
		t.Fatal("lost cleanup error", err)
	}
	if err := svc.CloseSession(reopened.SessionID); err != nil {
		t.Fatal("cleanup retry failed", err)
	}
}
