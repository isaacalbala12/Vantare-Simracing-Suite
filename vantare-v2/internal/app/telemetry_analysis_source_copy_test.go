package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestTelemetryAnalysisVerifiedCopyKeepsOriginalAndSurvivesClose(t *testing.T) {
	svc, originalPath, now := telemetryAnalysisTestService(t, true)
	defer svc.ServiceShutdown()
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		return telemetryAnalysisSuccessfulReader(artifact), nil
	}
	opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(originalPath)
	if err != nil {
		t.Fatal(err)
	}
	destination := t.TempDir()
	request := TelemetryAnalysisCopyRequest{SessionID: opened.SessionID, DestinationDirectory: destination, UserApproved: true}
	if _, err := svc.SaveVerifiedCopy(context.Background(), TelemetryAnalysisCopyRequest{SessionID: opened.SessionID, DestinationDirectory: destination}); !errors.Is(err, ErrTelemetryAnalysisApprovalRequired) {
		t.Fatalf("unapproved copy error = %v", err)
	}
	copyResult, err := svc.SaveVerifiedCopy(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(copyResult.Path) != destination || filepath.Ext(copyResult.Path) != ".duckdb" || copyResult.SizeBytes != int64(len(before)) {
		t.Fatalf("unexpected verified copy metadata: %+v", copyResult)
	}
	if err := svc.CloseSession(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	copyBytes, err := os.ReadFile(copyResult.Path)
	if err != nil || !bytes.Equal(copyBytes, before) {
		t.Fatalf("retained copy differs from original: %v", err)
	}
	after, err := os.ReadFile(originalPath)
	if err != nil || !bytes.Equal(after, before) {
		t.Fatalf("original changed: %v", err)
	}
	if err := os.Remove(originalPath); err != nil {
		t.Fatal(err)
	}
	if retained, err := os.ReadFile(copyResult.Path); err != nil || !bytes.Equal(retained, before) {
		t.Fatalf("copy unavailable after original removed: %v", err)
	}
	sum := sha256.Sum256(before)
	if copyResult.ContentSHA256 != hex.EncodeToString(sum[:]) {
		t.Fatal("copy hash differs from original")
	}
	if _, err := svc.SaveVerifiedCopy(context.Background(), request); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatalf("closed-session copy error = %v", err)
	}
}
