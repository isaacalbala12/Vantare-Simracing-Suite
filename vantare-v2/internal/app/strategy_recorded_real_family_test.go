package app

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

// Runs only from the explicitly opted-in real-source bank. No fabricated laps,
// timestamps or values; the native inspector selects an actual eligible target.
func verifyRecordedRealFamilyRevision(t *testing.T, ctx context.Context, svc *TelemetryAnalysisService, sessionID, candidateID string, base telemetryanalysis.SourceAnalysisRef, head string) {
	t.Helper()
	request := TelemetryAnalysisCorrectionLapRequest{SessionID: sessionID, Base: base, RevisionID: head, Limit: 25}
	var chosen telemetryanalysis.CorrectionLapInspection
	found := false
	for {
		page, err := svc.InspectCorrectionLaps(ctx, request)
		if err != nil {
			t.Fatalf("real lap inspection: %v", err)
		}
		for _, row := range page.Page.Laps {
			if row.Target == nil || row.Effective == nil {
				continue
			}
			for _, capability := range row.Capabilities {
				if capability.Family == telemetryanalysis.FamilyCombinedStintPaceCurve && capability.CanExclude && capability.EffectiveIncluded != nil && *capability.EffectiveIncluded {
					chosen, found = row, true
					break
				}
			}
			if found {
				break
			}
		}
		if found || request.Start+len(page.Page.Laps) >= page.Page.Total {
			break
		}
		request.Start += 25
	}
	if !found {
		t.Fatal("real source has no uniquely resolved eligible pace lap for this bank")
	}
	var original telemetryanalysis.LapFamilyUse
	for _, use := range chosen.Original.FamilyUse {
		if use.Family == telemetryanalysis.FamilyCombinedStintPaceCurve {
			original = use
			break
		}
	}
	command := TelemetryAnalysisCorrectionSaveRequest{SessionID: sessionID, Base: base,
		FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{{Base: base, Target: *chosen.Target, Family: telemetryanalysis.FamilyCombinedStintPaceCurve, Expected: original, Included: false, Reason: "reversible validation of real recorded pace selection"}},
		Command:    telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: head, CommandID: "real-family-review", Reason: "validate recorded family revision roundtrip", LocalAuthorID: "local-validation"},
	}
	saved, err := svc.SaveCorrections(ctx, command)
	if err != nil {
		t.Fatalf("real family save: %v", err)
	}
	resolved, err := svc.ResolveCorrectionCommand(ctx, command)
	if err != nil || !resolved.Found || resolved.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatalf("real family resolve: %v, found %v", err, resolved.Found)
	}
	replay, err := svc.SaveCorrections(ctx, command)
	if err != nil || replay.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatalf("real family replay: %v", err)
	}
	request.RevisionID = saved.Revision.RevisionID
	inspect := func() telemetryanalysis.CorrectionLapInspection {
		t.Helper()
		page, err := svc.InspectCorrectionLaps(ctx, request)
		if err != nil {
			t.Fatalf("real saved lap inspection: %v", err)
		}
		for _, row := range page.Page.Laps {
			if row.Target != nil && row.Target.Number == chosen.Target.Number && row.Target.Start.Equal(chosen.Target.Start) && row.Target.End.Equal(chosen.Target.End) {
				return row
			}
		}
		t.Fatal("real target disappeared from its saved revision")
		return telemetryanalysis.CorrectionLapInspection{}
	}
	changed := inspect()
	if changed.Effective == nil {
		t.Fatal("saved effective lap unavailable")
	}
	for _, before := range chosen.Effective.FamilyUse {
		matched := false
		for _, after := range changed.Effective.FamilyUse {
			if after.Family != before.Family {
				continue
			}
			matched = true
			if after.Family == telemetryanalysis.FamilyCombinedStintPaceCurve {
				if after.Included || after.CorrectionID == "" {
					t.Fatal("pace exclusion/provenance not applied")
				}
			} else if !reflect.DeepEqual(before, after) {
				t.Fatalf("unrelated family changed: %s", before.Family)
			}
		}
		if !matched {
			t.Fatalf("family disappeared: %s", before.Family)
		}
	}
	projection, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: sessionID, Base: base, RevisionID: saved.Revision.RevisionID})
	if err != nil {
		t.Fatalf("real mixed projection: %v", err)
	}
	if len(projection.SourceRevisions) != 1 || projection.SourceRevisions[0].RevisionID != saved.Revision.RevisionID || projection.SourceRevisions[0].SnapshotID != saved.Revision.Snapshot.SnapshotID {
		t.Fatal("real mixed projection lost exact reference")
	}
	legacy := TelemetryAnalysisCorrectionSaveRequest{SessionID: sessionID, Base: base, Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "legacy-cannot-erase-family", Reason: "verify legacy guard", LocalAuthorID: "local-validation"}}
	if _, err := svc.SaveCorrections(ctx, legacy); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatalf("legacy mixed guard: %v", err)
	}
	legacy.FamilyUses = []telemetryanalysis.LapFamilyUseCorrection{}
	legacy.Command.CommandID = "real-family-restore"
	legacy.Command.Reason = "restore original automatic family use"
	restored, err := svc.SaveCorrections(ctx, legacy)
	if err != nil {
		t.Fatalf("real family restore: %v", err)
	}
	if len(restored.Revision.Snapshot.FamilyUses) != 0 {
		t.Fatal("explicit restoration retained family correction")
	}
	// Reopen the file, then inspect the older mixed revision: restoring the head
	// must neither rewrite history nor make the old exact source reference unusable.
	if err := svc.CloseSession(sessionID); err != nil {
		t.Fatal(err)
	}
	reopened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidateID, UserApproved: true})
	if err != nil {
		t.Fatalf("real family reopen: %v", err)
	}
	request.SessionID = reopened.SessionID
	again := inspect()
	if !reflect.DeepEqual(again.Effective, changed.Effective) {
		t.Fatal("mixed revision changed after restore/reopen")
	}
	request.RevisionID = restored.Revision.RevisionID
	automatic := inspect()
	if !reflect.DeepEqual(automatic.Effective, chosen.Effective) {
		t.Fatal("automatic restoration differs from original effective lap")
	}
	t.Logf("real family roundtrip verified: lap %d, mixed revision %s, independent families retained, explicit restore and reopen", chosen.Target.Number, saved.Revision.RevisionID)
}
