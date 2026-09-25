package app

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

// Explicit opt-in: exercises the production LMU reader on real bytes while
// removing only a disposable duplicate. The user's original is never changed.
func TestTelemetryAnalysisRealVerifiedCopyRecoversSavedRevision(t *testing.T) {
	sourcePath, runtimeApp := os.Getenv("ISA1373_REAL_SOURCE"), os.Getenv("ISA1088_RUNTIME_APP")
	if sourcePath == "" || runtimeApp == "" {
		t.Skip("requires an explicitly selected real LMU source and trusted runtime directory")
	}
	before := realSourceHash(t, sourcePath)
	t.Cleanup(func() {
		if after := realSourceHash(t, sourcePath); after != before {
			t.Errorf("real original changed: %s != %s", after, before)
		}
	})
	root := t.TempDir()
	scratchOriginal := filepath.Join(root, "scratch-original", "session.duckdb")
	if err := os.MkdirAll(filepath.Dir(scratchOriginal), 0o700); err != nil {
		t.Fatal(err)
	}
	source, err := os.Open(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	destination, err := os.OpenFile(scratchOriginal, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		source.Close()
		t.Fatal(err)
	}
	_, copyErr := io.Copy(destination, source)
	if err := errors.Join(copyErr, destination.Sync(), destination.Close(), source.Close()); err != nil {
		t.Fatal(err)
	}
	if realSourceHash(t, scratchOriginal) != before {
		t.Fatal("scratch source differs from real original")
	}
	config := TelemetryAnalysisConfig{
		ApplicationDirectory: runtimeApp,
		StagingRoot:          filepath.Join(root, "staging"), CorrectionRoot: filepath.Join(root, "corrections"),
		StabilityWindow: 10 * time.Millisecond, MaxCandidates: 1, MaxSourceBytes: 2 << 30, MaxPageRows: 4096,
	}
	service, err := NewTelemetryAnalysisService(config, telemetryAnalysisAuthorizerStub{allowed: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := service.ServiceShutdown(); err != nil {
			t.Errorf("close analysis service: %v", err)
		}
	})
	if !service.Status().Available {
		t.Fatal("trusted production LMU reader unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	candidate, err := service.SelectFile(ctx, TelemetryAnalysisSelectedFileRequest{Path: scratchOriginal, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	opened, err := service.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := service.PrepareCorrections(ctx, opened.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	inspectionRequest := TelemetryAnalysisCorrectionLapRequest{SessionID: opened.SessionID, Base: prepared.Base, RevisionID: prepared.BaseRevisionID, Limit: 50}
	var family telemetryanalysis.LapFamilyUseCorrection
	for {
		inspection, err := service.InspectCorrectionLaps(ctx, inspectionRequest)
		if err != nil {
			t.Fatal(err)
		}
		for _, lap := range inspection.Page.Laps {
			if lap.Target == nil {
				continue
			}
			for _, capability := range lap.Capabilities {
				if capability.Family != telemetryanalysis.FamilyCombinedStintPaceCurve || !capability.CanExclude || capability.EffectiveIncluded == nil || !*capability.EffectiveIncluded {
					continue
				}
				for _, use := range lap.Original.FamilyUse {
					if use.Family == capability.Family {
						family = telemetryanalysis.LapFamilyUseCorrection{Base: prepared.Base, Target: *lap.Target, Family: use.Family, Expected: use, Included: false, Reason: "verify real recovered correction"}
						break
					}
				}
			}
			if family.Family != "" {
				break
			}
		}
		if family.Family != "" || len(inspection.Page.Laps) == 0 || inspectionRequest.Start+len(inspection.Page.Laps) >= inspection.Page.Total {
			break
		}
		inspectionRequest.Start += len(inspection.Page.Laps)
	}
	if family.Family == "" {
		t.Fatal("real source has no editable pace lap")
	}
	saved, err := service.SaveCorrections(ctx, TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: prepared.Base,
		FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{family},
		Command:    telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: prepared.BaseRevisionID, CommandID: "real-copy-revision", Reason: "verify saved revision recovery", LocalAuthorID: "local-validation"}})
	if err != nil || saved.Revision.RevisionID == prepared.BaseRevisionID {
		t.Fatalf("save revision = %+v, %v", saved, err)
	}
	copyDirectory := filepath.Join(root, "retained")
	if err := os.MkdirAll(copyDirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	copyResult, err := service.SaveVerifiedCopy(ctx, TelemetryAnalysisCopyRequest{SessionID: opened.SessionID, DestinationDirectory: copyDirectory, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	if realSourceHash(t, copyResult.Path) != before {
		t.Fatalf("verified copy = %+v, %v", copyResult, err)
	}
	if err := service.CloseSession(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	if err := service.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(scratchOriginal); err != nil {
		t.Fatal(err)
	}
	restarted, err := NewTelemetryAnalysisService(config, telemetryAnalysisAuthorizerStub{allowed: true})
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.ServiceShutdown()
	recovered, err := restarted.RecoverCopy(ctx, TelemetryAnalysisRecoverCopyRequest{SourceID: opened.Session.ID, UserApproved: true})
	if err != nil || recovered.Code != "ready" || recovered.Candidate == nil {
		t.Fatalf("recovery = %+v, %v", recovered, err)
	}
	reopened, err := restarted.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: recovered.Candidate.ID, UserApproved: true})
	if err != nil || reopened.Session.ID != opened.Session.ID {
		t.Fatalf("reopened source = %+v, %v", reopened, err)
	}
	reprepared, err := restarted.PrepareCorrections(ctx, reopened.SessionID)
	if err != nil || reprepared.Base != prepared.Base || reprepared.BaseRevisionID != prepared.BaseRevisionID {
		t.Fatalf("reprepared base = %+v, %v", reprepared, err)
	}
	reloaded, err := restarted.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: reopened.SessionID, Base: prepared.Base, RevisionID: saved.Revision.RevisionID})
	if err != nil || reloaded.Revision.RevisionID != saved.Revision.RevisionID || len(reloaded.Revision.Snapshot.FamilyUses) != 1 || reloaded.Revision.Snapshot.FamilyUses[0].Request.Included {
		t.Fatalf("saved revision after restart = %+v, %v", reloaded, err)
	}
	if _, err := restarted.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: reopened.SessionID, Base: prepared.Base, RevisionID: saved.Revision.RevisionID}); err != nil {
		t.Fatalf("project saved revision after recovery: %v", err)
	}
	if err := restarted.CloseSession(reopened.SessionID); err != nil {
		t.Fatal(err)
	}
}
