package app

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestCorrectionLapInspectionReauthorizesAndPinsExactRevision(t *testing.T) {
	svc, opened, refs, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	prepared, err := svc.PrepareCorrections(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	reader := svc.sessions[handle].reader.(*correctionCommandReader).telemetryAnalysisReaderStub
	reader.readErr = errors.New("cached inspection must not reread samples")
	request := TelemetryAnalysisCorrectionLapRequest{SessionID: handle, Base: prepared.Base, RevisionID: refs[0].RevisionID, Start: 0, Limit: 50}
	original, err := svc.InspectCorrectionLaps(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	reader.readErr = nil
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
	var scalar telemetryanalysis.SampleValueCorrection
	for _, channel := range opened[0].Session.Channels {
		if channel.SourceName != "Lap Time" {
			continue
		}
		page, readErr := svc.ReadPage(ctx, TelemetryAnalysisPageRequest{SessionID: handle, ChannelID: channel.ID, Start: 1, Limit: 1})
		if readErr != nil {
			t.Fatal(readErr)
		}
		value := page.Samples[0].Values[0]
		replacement := value.Scalar
		replacement.Number++
		scalar = telemetryanalysis.SampleValueCorrection{Base: prepared.Base, Target: telemetryanalysis.SampleCorrectionTarget{
			ChannelID: channel.ID, Column: value.Column, SampleIndex: page.Samples[0].Index,
		}, Unit: channel.Unit, Expected: value, Replacement: replacement, Reason: "controlled pace correction"}
		break
	}
	if scalar.Target.ChannelID == "" {
		t.Fatal("fixture lacks Lap Time correction target")
	}
	saveRequest := TelemetryAnalysisCorrectionSaveRequest{
		SessionID: handle, Base: prepared.Base, Corrections: []telemetryanalysis.SampleValueCorrection{scalar},
		FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{family}, Classifications: []telemetryanalysis.ClassificationCorrection{},
		StintBoundaries: []telemetryanalysis.StintBoundaryCorrection{},
		Command:         telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: original.HeadID, CommandID: "inspection-family", Reason: "test", LocalAuthorID: "test"},
	}
	var materializedSnapshot telemetryanalysis.PreparedSampleCorrectionSnapshot
	if err := svc.withCorrectionInput(ctx, handle, func(_ context.Context, input telemetryanalysis.CorrectionInput) error {
		inputs, resolveErr := correctionInputsForRequests(input, saveRequest.Corrections)
		if resolveErr != nil {
			return resolveErr
		}
		observations, prepareErr := observationInputForRequests(input, inputs, saveRequest.FamilyUses, saveRequest.StintBoundaries)
		if prepareErr != nil {
			return prepareErr
		}
		observations.Session = input.Session
		observations.Classifications = saveRequest.Classifications
		oracle := telemetryanalysis.NewCorrectionStore(t.TempDir())
		want, saveErr := oracle.SaveObservations(ctx, input.Base, observations, saveRequest.Command)
		if saveErr != nil {
			return saveErr
		}
		materializedSnapshot = want.Revision.Snapshot
		return nil
	}); err != nil {
		t.Fatal("materialized mixed save oracle", err)
	}
	saved, err := svc.SaveRecoverableCorrections(ctx, saveRequest)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(saved.Revision.Snapshot, materializedSnapshot) {
		t.Fatal("paged mixed save changed the exact snapshot")
	}
	if err := svc.AcknowledgeCorrectionCommand(ctx, TelemetryAnalysisCorrectionPendingRequest{SessionID: handle, Base: prepared.Base, CommandID: saveRequest.Command.CommandID}); err != nil {
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
	svc.authorizer = &telemetryAnalysisAuthorizerStub{allowed: true}
	reader.evidence.ContentSHA256 = "changed"
	if _, err := svc.InspectCorrectionLaps(ctx, request); !errors.Is(err, ErrTelemetryAnalysisIncompatible) || !reader.isClosed() {
		t.Fatal("changed source retained an inspectable correction", err)
	}
}
