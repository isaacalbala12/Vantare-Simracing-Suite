package app

import (
	"context"
	"errors"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"testing"
)

func TestCorrectionLapInspectionReauthorizesAndPinsExactRevision(t *testing.T) {
	svc, opened, refs, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	prepared, err := svc.PrepareCorrections(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	request := TelemetryAnalysisCorrectionLapRequest{SessionID: handle, Base: prepared.Base, RevisionID: refs[0].RevisionID, Start: 0, Limit: 50}
	original, err := svc.InspectCorrectionLaps(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	var family telemetryanalysis.LapFamilyUseCorrection
	for _, row := range original.Page.Laps {
		if row.Target == nil {
			continue
		}
		for _, capability := range row.Capabilities {
			if capability.Family != telemetryanalysis.FamilyCombinedStintPaceCurve || !capability.CanExclude {
				continue
			}
			for _, use := range row.Original.FamilyUse {
				if use.Family == capability.Family {
					family = telemetryanalysis.LapFamilyUseCorrection{Base: prepared.Base, Target: *row.Target, Family: use.Family, Expected: use, Included: false, Reason: "controlled inspection review"}
				}
			}
		}
	}
	if family.Family == "" {
		t.Fatal("fixture lacks editable lap")
	}
	saved, err := svc.SaveCorrections(ctx, TelemetryAnalysisCorrectionSaveRequest{SessionID: handle, Base: prepared.Base, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{family}, Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: original.HeadID, CommandID: "inspection-family", Reason: "test", LocalAuthorID: "test"}})
	if err != nil {
		t.Fatal(err)
	}
	old, err := svc.InspectCorrectionLaps(ctx, request)
	if err != nil || old.RevisionID != original.RevisionID || old.Page.SnapshotID != original.Page.SnapshotID || old.HeadID != saved.HeadID {
		t.Fatal("inspection adopted head", err)
	}
	request.RevisionID = saved.Revision.RevisionID
	current, err := svc.InspectCorrectionLaps(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, row := range current.Page.Laps {
		if row.Target == nil || !row.Target.Start.Equal(family.Target.Start) || row.Target.Number != family.Target.Number {
			continue
		}
		if row.Effective == nil {
			t.Fatal("effective lap missing")
		}
		for _, use := range row.Effective.FamilyUse {
			if use.Family == family.Family {
				found = use.CorrectionID != "" && !use.Included
			}
		}
	}
	if !found {
		t.Fatal("effective decision missing")
	}
	invalid := request
	invalid.RevisionID = ""
	if _, err := svc.InspectCorrectionLaps(ctx, invalid); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("implicit head allowed", err)
	}
	invalid = request
	invalid.Limit = 51
	if _, err := svc.InspectCorrectionLaps(ctx, invalid); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("page limit ignored", err)
	}
	invalid = request
	invalid.Base.AnalysisVersion = "other"
	if _, err := svc.InspectCorrectionLaps(ctx, invalid); !errors.Is(err, ErrTelemetryAnalysisCorrectionSourceChanged) {
		t.Fatal("changed base inspected", err)
	}
	svc.authorizer = &telemetryAnalysisAuthorizerStub{allowed: false}
	if _, err := svc.InspectCorrectionLaps(ctx, request); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("unauthorized inspection", err)
	}
}
