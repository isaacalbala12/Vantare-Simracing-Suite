package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestTelemetryAnalysisSelectedCopyRecoversSameSourceWithoutOriginal(t *testing.T) {
	svc, original, now := telemetryAnalysisTestService(t, true)
	defer svc.ServiceShutdown()
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		a, b := 10000.0, 10090.0
		columns := []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}
		return &telemetryAnalysisReaderStub{
			evidence: artifact.Evidence(),
			catalog:  telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{{Name: "Lap", Unit: "count", Columns: columns}}},
			rows: []telemetryanalysis.LMUDuckDBRow{
				{TimestampSeconds: &a, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}},
				{TimestampSeconds: &b, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}},
			},
		}, nil
	}
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	openedOriginal, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	originalBase, err := svc.PrepareCorrections(context.Background(), openedOriginal.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	copyResult, err := svc.SaveVerifiedCopy(context.Background(), TelemetryAnalysisCopyRequest{SessionID: openedOriginal.SessionID, DestinationDirectory: t.TempDir(), UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.CloseSession(openedOriginal.SessionID); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(original); err != nil {
		t.Fatal(err)
	}
	svc.cfg.StabilityWindow = 10 * time.Millisecond
	svc.now = time.Now
	selected, err := svc.SelectFile(context.Background(), TelemetryAnalysisSelectedFileRequest{Path: copyResult.Path, UserApproved: true})
	if err != nil || selected.State != string(telemetryanalysis.StateReady) {
		t.Fatalf("selected copy = %+v, %v", selected, err)
	}
	openedCopy, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: selected.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	if openedCopy.Session.ID != openedOriginal.Session.ID {
		t.Fatal("selected copy did not restore the exact source identity")
	}
	copyBase, err := svc.PrepareCorrections(context.Background(), openedCopy.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	if copyBase.Base != originalBase.Base || copyBase.BaseDigest != originalBase.BaseDigest || copyBase.BaseRevisionID != originalBase.BaseRevisionID {
		t.Fatal("selected copy changed the correction base or initial revision")
	}
}

func TestTelemetryAnalysisSelectedFileRejectsUnapprovedActiveAndChanged(t *testing.T) {
	svc, _, _ := telemetryAnalysisTestService(t, true)
	defer svc.ServiceShutdown()
	selected := filepath.Join(t.TempDir(), "saved.duckdb")
	if err := os.WriteFile(selected, []byte("stable telemetry"), 0o600); err != nil {
		t.Fatal(err)
	}
	request := TelemetryAnalysisSelectedFileRequest{Path: selected, UserApproved: true}
	if _, err := svc.SelectFile(context.Background(), TelemetryAnalysisSelectedFileRequest{Path: selected}); !errors.Is(err, ErrTelemetryAnalysisApprovalRequired) {
		t.Fatalf("unapproved selection = %v", err)
	}
	if err := os.WriteFile(selected+".wal", []byte("active"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SelectFile(context.Background(), request); !errors.Is(err, ErrTelemetryAnalysisNotReady) {
		t.Fatalf("WAL-active selection = %v", err)
	}
	if err := os.Remove(selected + ".wal"); err != nil {
		t.Fatal(err)
	}
	svc.cfg.StabilityWindow = 10 * time.Millisecond
	svc.now = time.Now
	candidate, err := svc.SelectFile(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(selected, []byte("changed telemetry"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true}); !errors.Is(err, ErrTelemetryAnalysisNotReady) {
		t.Fatalf("changed selected file = %v", err)
	}
}
