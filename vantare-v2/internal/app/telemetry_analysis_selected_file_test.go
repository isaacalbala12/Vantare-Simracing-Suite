package app

import (
	"bytes"
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
	svc.cfg.CorrectionRoot = t.TempDir()
	defer svc.ServiceShutdown()
	svc.runtimeReady = true
	factory := func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
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
	svc.readerFactory = factory
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
	if _, err := svc.recoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true}); !errors.Is(err, ErrTelemetryAnalysisOriginalPresent) {
		t.Fatalf("copy offered while original exists: %v", err)
	}
	if result, err := svc.RecoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true}); err != nil || result.Code != "original_present" || result.Candidate != nil {
		t.Fatalf("public recovery while original exists = %+v, %v", result, err)
	}
	if err := os.Remove(original); err != nil {
		t.Fatal(err)
	}
	svc.cfg.StabilityWindow = 10 * time.Millisecond
	svc.now = time.Now
	recovery, err := svc.RecoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true})
	if err != nil || recovery.Code != "ready" || recovery.Candidate == nil || recovery.Candidate.State != string(telemetryanalysis.StateReady) {
		t.Fatalf("selected copy = %+v, %v", recovery, err)
	}
	openedCopy, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: recovery.Candidate.ID, UserApproved: true})
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
	if err := svc.CloseSession(openedCopy.SessionID); err != nil {
		t.Fatal(err)
	}
	if err := svc.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	restarted, err := NewTelemetryAnalysisService(svc.cfg, telemetryAnalysisAuthorizerStub{allowed: true})
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.ServiceShutdown()
	restarted.runtimeReady = true
	restarted.readerFactory = factory
	restarted.now = time.Now
	afterRestart, err := restarted.recoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := restarted.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: afterRestart.ID, UserApproved: true})
	if err != nil || reopened.Session.ID != openedOriginal.Session.ID {
		t.Fatalf("restarted recovery = %+v, %v", reopened, err)
	}
	if err := restarted.CloseSession(reopened.SessionID); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(copyResult.Path+".wal", []byte("active"), 0o600); err != nil {
		t.Fatal(err)
	}
	if result, err := restarted.RecoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true}); err != nil || result.Code != "not_ready" {
		t.Fatalf("WAL-active recovery = %+v, %v", result, err)
	}
	if err := os.Remove(copyResult.Path + ".wal"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(copyResult.Path, bytes.Repeat([]byte{'x'}, int(copyResult.SizeBytes)), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.recoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true}); !errors.Is(err, ErrTelemetryAnalysisCopyChanged) {
		t.Fatalf("changed copy recovery = %v", err)
	}
	if result, err := restarted.RecoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true}); err != nil || result.Code != "copy_changed" || result.Candidate != nil {
		t.Fatalf("public changed-copy recovery = %+v, %v", result, err)
	}
	if err := os.Remove(copyResult.Path); err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.recoverCopy(context.Background(), TelemetryAnalysisRecoverCopyRequest{SourceID: openedOriginal.Session.ID, UserApproved: true}); !errors.Is(err, ErrTelemetryAnalysisCopyUnavailable) {
		t.Fatalf("missing copy recovery = %v", err)
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

func TestTelemetryAnalysisRecoveryRejectsCancelledAndDamagedRegistry(t *testing.T) {
	svc, _, _ := telemetryAnalysisTestService(t, true)
	defer svc.ServiceShutdown()
	svc.cfg.CorrectionRoot = t.TempDir()
	request := TelemetryAnalysisRecoverCopyRequest{SourceID: "a" + string(bytes.Repeat([]byte{'0'}, 63)), UserApproved: true}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := svc.recoverCopy(cancelled, request); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled recovery = %v", err)
	}
	directory := filepath.Join(svc.cfg.CorrectionRoot, "source-copies")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "damaged.json"), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.recoverCopy(context.Background(), request); !errors.Is(err, ErrTelemetryAnalysisCopyRegistryFailure) {
		t.Fatalf("damaged registry recovery = %v", err)
	}
}
