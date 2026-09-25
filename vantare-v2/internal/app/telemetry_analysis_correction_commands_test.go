package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

type correctionCommandReader struct{ *telemetryAnalysisReaderStub }

func (r *correctionCommandReader) ReadRows(ctx context.Context, table string, start int64, limit int) ([]telemetryanalysis.LMUDuckDBRow, error) {
	rows, err := r.telemetryAnalysisReaderStub.ReadRows(ctx, table, start, limit)
	if err != nil {
		return nil, err
	}
	if strings.Contains(table, "Lap Time") {
		for i := range rows {
			value := 0.0
			if start+int64(i) > 0 {
				value = 90
			}
			rows[i].Values = []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarNumber, Number: value}}
		}
	}
	return rows, nil
}

func TestCorrectionCommandsReauthorizeReplayAndPinProjection(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	t.Cleanup(func() {
		if err := svc.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	svc.corrections = telemetryanalysis.NewCorrectionStore(t.TempDir())
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	var reader *telemetryAnalysisReaderStub
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		a, b := 10000.0, 10090.0
		reader = &telemetryAnalysisReaderStub{evidence: artifact.Evidence(), catalog: telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{{Name: "Lap", Unit: "count", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}}}}, rows: []telemetryanalysis.LMUDuckDBRow{{TimestampSeconds: &a, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}}, {TimestampSeconds: &b, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}}}}
		for key, value := range map[string]string{"TrackName": "Imola", "TrackLayout": "Grand Prix", "CarName": "Test Car", "CarClass": "Hypercar", "SessionType": "Race", "WeatherConditions": "Clear"} {
			reader.catalog.Metadata = append(reader.catalog.Metadata, telemetryanalysis.LMUDuckDBMetadata{Key: key, Value: value, Present: true, Quality: telemetryanalysis.QualityValid})
		}
		reader.catalog.Events = append(reader.catalog.Events, telemetryanalysis.LMUDuckDBChannel{Name: "Lap Time", Unit: "s", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "DOUBLE"}}})
		return &correctionCommandReader{reader}, nil
	}
	ctx := context.Background()
	opened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := svc.PrepareCorrections(ctx, opened.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	channel := opened.Session.Channels[0]
	page, err := svc.ReadPage(ctx, TelemetryAnalysisPageRequest{SessionID: opened.SessionID, ChannelID: channel.ID, Start: 1, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	value := page.Samples[0].Values[0]
	replacement := value.Scalar
	replacement.Integer = 3
	request := TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: prepared.Base, Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: prepared.BaseRevisionID, CommandID: "save-1", Reason: "test", LocalAuthorID: "local"}, Corrections: []telemetryanalysis.SampleValueCorrection{{Base: prepared.Base, Target: telemetryanalysis.SampleCorrectionTarget{ChannelID: channel.ID, Column: value.Column, SampleIndex: 1}, Unit: channel.Unit, Expected: value, Replacement: replacement, Reason: "test"}}}
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	var materializedPage telemetryanalysis.CorrectionLapPage
	if err := svc.withCorrectionInput(ctx, opened.SessionID, func(_ context.Context, input telemetryanalysis.CorrectionInput) error {
		var inspectErr error
		materializedPage, inspectErr = telemetryanalysis.InspectCorrectionLaps(input, saved.Revision.Snapshot, 0, telemetryanalysis.MaxCorrectionLapPage)
		return inspectErr
	}); err != nil {
		t.Fatal("materialized inspection oracle", err)
	}
	inspected, err := svc.InspectCorrectionLaps(ctx, TelemetryAnalysisCorrectionLapRequest{
		SessionID: opened.SessionID, Base: prepared.Base, RevisionID: saved.Revision.RevisionID, Start: 0, Limit: telemetryanalysis.MaxCorrectionLapPage,
	})
	if err != nil || !reflect.DeepEqual(inspected.Page, materializedPage) {
		t.Fatal("paged inspection differs from materialized correction", err)
	}
	replay, err := svc.SaveCorrections(ctx, request)
	if err != nil || replay.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal("non-idempotent replay", err)
	}
	resolved, err := svc.ResolveCorrectionCommand(ctx, request)
	if err != nil || !resolved.Found || resolved.Revision == nil || resolved.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal("could not resolve saved command", err)
	}
	unknownCommand := request
	unknownCommand.Command.CommandID = "not-saved"
	resolved, err = svc.ResolveCorrectionCommand(ctx, unknownCommand)
	if err != nil || resolved.Found || resolved.HeadID != saved.HeadID {
		t.Fatal("command absence lost current head", err)
	}
	foreignCommand := request
	foreignCommand.Base.AnalysisVersion = "different"
	if _, err := svc.ResolveCorrectionCommand(ctx, foreignCommand); !errors.Is(err, ErrTelemetryAnalysisCorrectionSourceChanged) {
		t.Fatal("resolved foreign source", err)
	}
	lookup := TelemetryAnalysisCorrectionRevisionRequest{SessionID: opened.SessionID, Base: prepared.Base, RevisionID: saved.Revision.RevisionID}
	loaded, err := svc.LoadCorrection(ctx, lookup)
	if err != nil || loaded.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal(err)
	}
	projection, err := svc.ProjectCorrection(ctx, lookup)
	if err != nil {
		t.Fatal(err)
	}
	if len(projection.SourceRevisions) != 1 || projection.SourceRevisions[0].RevisionID != saved.Revision.RevisionID {
		t.Fatal("projection lost revision")
	}
	if !containsFamily(projection.SessionClassification.UsableForFamilies, string(telemetryanalysis.FamilyFuelConsumption)) {
		t.Fatal("classification ignored derived complete lap")
	}
	var timeChannel telemetryanalysis.HistoricalChannel
	for _, candidate := range opened.Session.Channels {
		if candidate.SourceName == "Lap Time" {
			timeChannel = candidate
		}
	}
	timePage, err := svc.ReadPage(ctx, TelemetryAnalysisPageRequest{SessionID: opened.SessionID, ChannelID: timeChannel.ID, Start: 1, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	timeValue := timePage.Samples[0].Values[0]
	zero := timeValue.Scalar
	zero.Number = 0
	removeTime := request
	removeTime.Command = telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "remove-time", Reason: "test", LocalAuthorID: "local"}
	removeTime.Corrections = []telemetryanalysis.SampleValueCorrection{{Base: prepared.Base, Target: telemetryanalysis.SampleCorrectionTarget{ChannelID: timeChannel.ID, Column: timeValue.Column, SampleIndex: 1}, Unit: timeChannel.Unit, Expected: timeValue, Replacement: zero, Reason: "test"}}
	withoutTime, err := svc.SaveCorrections(ctx, removeTime)
	if err != nil {
		t.Fatal(err)
	}
	withoutTimeLookup := lookup
	withoutTimeLookup.RevisionID = withoutTime.Revision.RevisionID
	withoutTimeProjection, err := svc.ProjectCorrection(ctx, withoutTimeLookup)
	if err != nil {
		t.Fatal(err)
	}
	if containsFamily(withoutTimeProjection.SessionClassification.UsableForFamilies, string(telemetryanalysis.FamilyFuelConsumption)) {
		t.Fatal("classification retained removed complete lap")
	}
	conflict := request
	conflict.Command.CommandID = "save-2"
	if _, err := svc.SaveCorrections(ctx, conflict); !errors.Is(err, ErrTelemetryAnalysisCorrectionConflict) {
		t.Fatal("lost conflict", err)
	}
	changed := lookup
	changed.Base.AnalysisVersion = "changed"
	if _, err := svc.LoadCorrection(ctx, changed); !errors.Is(err, ErrTelemetryAnalysisCorrectionSourceChanged) {
		t.Fatal("accepted changed base", err)
	}
	missing := lookup
	missing.RevisionID = ""
	if _, err := svc.ProjectCorrection(ctx, missing); !errors.Is(err, ErrTelemetryAnalysisCorrectionMissing) {
		t.Fatal("accepted latest", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: false}
	if _, err := svc.ResolveCorrectionCommand(ctx, request); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("resolved without authority", err)
	}
	if _, err := svc.SaveCorrections(ctx, request); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("replayed without authority", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: true}
	reader.readErr = telemetryanalysis.ErrHistoricalSource
	if _, err := svc.SaveCorrections(ctx, request); !errors.Is(err, ErrTelemetryAnalysisIncompatible) {
		t.Fatal("replayed unavailable source", err)
	}
	if _, err := svc.ResolveCorrectionCommand(ctx, request); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatal("resolved retired source", err)
	}
}

func containsFamily(families []string, target string) bool {
	for _, family := range families {
		if family == target {
			return true
		}
	}
	return false
}

func TestProjectCorrectionUsesEffectiveClassification(t *testing.T) {
	svc, opened, _, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	var input telemetryanalysis.CorrectionInput
	if err := svc.withCorrectionInput(ctx, handle, func(_ context.Context, value telemetryanalysis.CorrectionInput) error {
		input = value
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	class := telemetryanalysis.ClassificationCorrection{Base: input.Base, Field: telemetryanalysis.ClassificationFieldSessionType, ExpectedOriginal: "Race", Replacement: "qualify", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual}
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(input.Base, nil)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := svc.corrections.SaveObservations(ctx, input.Base, telemetryanalysis.ObservationCorrectionInput{FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{}, Session: input.Session, Classifications: []telemetryanalysis.ClassificationCorrection{class}}, telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "classify", Reason: "test", LocalAuthorID: "local-test"})
	if err != nil {
		t.Fatal(err)
	}
	projection, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: input.Base, RevisionID: saved.Revision.RevisionID})
	if err != nil {
		t.Fatal(err)
	}
	if projection.SessionClassification.SessionType != "qualify" {
		t.Fatalf("projection lost effective classification: %+v", projection.SessionClassification)
	}
}

func TestCorrectionStorageConfigurationAndPublicErrors(t *testing.T) {
	base, _, _ := telemetryAnalysisTestService(t, false)
	t.Cleanup(func() {
		if err := base.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	cfg := base.cfg
	cfg.CorrectionRoot = t.TempDir()
	configured, err := NewTelemetryAnalysisService(cfg, telemetryAnalysisAuthorizerStub{allowed: false})
	if err != nil {
		t.Fatal(err)
	}
	if configured.corrections == nil {
		t.Fatal("native correction root ignored")
	}
	if err := configured.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	cfg.CorrectionRoot = "relative"
	if _, err := NewTelemetryAnalysisService(cfg, telemetryAnalysisAuthorizerStub{allowed: false}); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("accepted relative custody", err)
	}
	if got := publicCorrectionError(&os.PathError{Op: "write", Path: "private-storage-path", Err: os.ErrPermission}); !errors.Is(got, ErrTelemetryAnalysisCorrectionStorage) || strings.Contains(got.Error(), "private-storage-path") {
		t.Fatal("private storage error exposed")
	}
	if got := publicCorrectionError(telemetryanalysis.ErrCorrectionCommitUncertain); !errors.Is(got, ErrTelemetryAnalysisCorrectionUncertain) {
		t.Fatal("lost uncertain commit outcome")
	}
}

func TestFamilyCorrectionCommandsSaveResolveRestoreAndProjectExactRevision(t *testing.T) {
	svc, opened, _, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	var input telemetryanalysis.CorrectionInput
	if err := svc.withCorrectionInput(ctx, handle, func(_ context.Context, value telemetryanalysis.CorrectionInput) error { input = value; return nil }); err != nil {
		t.Fatal(err)
	}
	prepared, err := svc.PrepareCorrections(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	var family telemetryanalysis.LapFamilyUseCorrection
	for _, lap := range input.Validity.Laps {
		if lap.Start == nil || !lap.Complete {
			continue
		}
		for _, use := range lap.FamilyUse {
			if use.Family == telemetryanalysis.FamilyCombinedStintPaceCurve {
				family = telemetryanalysis.LapFamilyUseCorrection{Base: input.Base, Target: telemetryanalysis.LapCorrectionTarget{Number: lap.Number, Start: *lap.Start, End: lap.End}, Family: use.Family, Expected: use, Included: false, Reason: "controlled family review"}
				break
			}
		}
		if family.Family != "" {
			break
		}
	}
	if family.Family == "" {
		t.Fatal("fixture lacks lap target")
	}
	request := TelemetryAnalysisCorrectionSaveRequest{SessionID: handle, Base: input.Base, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{family}, Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: prepared.BaseRevisionID, CommandID: "family-save", Reason: "family review", LocalAuthorID: "local-test"}}
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Revision.Snapshot.FamilyUses) != 1 || saved.Revision.Snapshot.ContractVersion != "analysis.observation-snapshot.v2" {
		t.Fatal("family command reduced to scalar snapshot")
	}
	replay, err := svc.SaveCorrections(ctx, request)
	if err != nil || replay.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal("mixed replay duplicated", err)
	}
	resolution, err := svc.ResolveCorrectionCommand(ctx, request)
	if err != nil || !resolution.Found || resolution.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal("mixed resolve lost command", err)
	}
	changed := request
	changed.FamilyUses = append([]telemetryanalysis.LapFamilyUseCorrection(nil), request.FamilyUses...)
	changed.FamilyUses[0].Reason = "changed reason"
	if _, err := svc.ResolveCorrectionCommand(ctx, changed); !errors.Is(err, ErrTelemetryAnalysisCorrectionConflict) {
		t.Fatal("resolve ignored family payload", err)
	}
	legacy := request
	legacy.FamilyUses = nil
	legacy.Command.ExpectedRevision = saved.HeadID
	legacy.Command.CommandID = "legacy-overwrite"
	if _, err := svc.SaveCorrections(ctx, legacy); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("legacy silently removed family", err)
	}
	restore := legacy
	restore.FamilyUses = []telemetryanalysis.LapFamilyUseCorrection{}
	restore.Command.CommandID = "explicit-restore"
	restored, err := svc.SaveCorrections(ctx, restore)
	if err != nil || len(restored.Revision.Snapshot.FamilyUses) != 0 {
		t.Fatal("explicit restore failed", err)
	}
	projection, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: input.Base, RevisionID: saved.Revision.RevisionID})
	if err != nil {
		t.Fatal(err)
	}
	if len(projection.SourceRevisions) != 1 || projection.SourceRevisions[0].RevisionID != saved.Revision.RevisionID || projection.SourceRevisions[0].SnapshotID != saved.Revision.Snapshot.SnapshotID {
		t.Fatal("projection adopted newer head or scalar identity")
	}
	// A scalar lap-number correction cannot relocate a family decision.
	moved := request
	moved.Command.ExpectedRevision = restored.HeadID
	moved.Command.CommandID = "moved-target"
	for _, channel := range input.Session.Channels {
		if channel.SourceName != "Lap" {
			continue
		}
		for _, page := range input.Pages {
			if page.ChannelID != channel.ID {
				continue
			}
			for _, sample := range page.Samples {
				for _, value := range sample.Values {
					if value.Scalar.Kind == telemetryanalysis.ScalarInteger && value.Scalar.Integer == int64(family.Target.Number) {
						replacement := value.Scalar
						replacement.Integer += 10
						moved.Corrections = []telemetryanalysis.SampleValueCorrection{{Base: input.Base, Target: telemetryanalysis.SampleCorrectionTarget{ChannelID: channel.ID, SampleIndex: sample.Index, Column: value.Column}, Unit: channel.Unit, Expected: value, Replacement: replacement, Reason: "controlled changed target"}}
					}
				}
			}
		}
	}
	if len(moved.Corrections) != 1 {
		t.Fatal("fixture lacks boundary correction")
	}
	if _, err := svc.SaveCorrections(ctx, moved); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("mixed scalar silently moved family target", err)
	}
	head, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: input.Base})
	if err != nil || head.HeadID != restored.HeadID {
		t.Fatal("rejected target changed durable head", err)
	}
	svc.authorizer = &telemetryAnalysisAuthorizerStub{allowed: false}
	if _, err := svc.SaveCorrections(ctx, request); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("mixed save bypassed auth", err)
	}
	if _, err := svc.ResolveCorrectionCommand(ctx, request); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("mixed resolve bypassed auth", err)
	}
}

func classificationCommandInput(t *testing.T, svc *TelemetryAnalysisService, ctx context.Context, handle string) (telemetryanalysis.CorrectionInput, telemetryanalysis.SourceAnalysisRef) {
	t.Helper()
	var input telemetryanalysis.CorrectionInput
	if err := svc.withCorrectionInput(ctx, handle, func(_ context.Context, value telemetryanalysis.CorrectionInput) error {
		input = value
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	prepared, err := svc.PrepareCorrections(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Base != input.Base {
		t.Fatal("preparation moved base")
	}
	return input, prepared.Base
}

func classificationSaveRequest(input telemetryanalysis.CorrectionInput, commandID string) TelemetryAnalysisCorrectionSaveRequest {
	family := telemetryanalysis.LapFamilyUseCorrection{}
	for _, lap := range input.Validity.Laps {
		if lap.Start == nil || !lap.Complete {
			continue
		}
		for _, use := range lap.FamilyUse {
			if use.Family == telemetryanalysis.FamilyCombinedStintPaceCurve {
				family = telemetryanalysis.LapFamilyUseCorrection{Base: input.Base, Target: telemetryanalysis.LapCorrectionTarget{Number: lap.Number, Start: *lap.Start, End: lap.End}, Family: use.Family, Expected: use, Included: false, Reason: "controlled family review"}
				break
			}
		}
		if family.Family != "" {
			break
		}
	}
	var scalar *telemetryanalysis.SampleValueCorrection
outer:
	for _, channel := range input.Session.Channels {
		if channel.SourceName != "Lap Time" {
			continue
		}
		for _, page := range input.Pages {
			if page.ChannelID != channel.ID {
				continue
			}
			for _, sample := range page.Samples {
				if sample.Values[0].Scalar.Number <= 0 {
					continue
				}
				replacement := sample.Values[0].Scalar
				replacement.Number++
				scalar = &telemetryanalysis.SampleValueCorrection{Base: input.Base, Target: telemetryanalysis.SampleCorrectionTarget{ChannelID: channel.ID, Column: sample.Values[0].Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: sample.Values[0], Replacement: replacement, Reason: "controlled scalar review"}
				break outer
			}
		}
	}
	request := TelemetryAnalysisCorrectionSaveRequest{SessionID: "", Base: input.Base,
		FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{},
		Classifications: []telemetryanalysis.ClassificationCorrection{
			{Base: input.Base, Field: telemetryanalysis.ClassificationFieldSessionType, ExpectedOriginal: "Race", Replacement: "qualify", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual},
		},
		Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: "", CommandID: commandID, Reason: "controlled review", LocalAuthorID: "local-test"}}
	if family.Family != "" {
		request.FamilyUses = []telemetryanalysis.LapFamilyUseCorrection{family}
	}
	if scalar != nil {
		request.Corrections = []telemetryanalysis.SampleValueCorrection{*scalar}
	}
	return request
}

func TestRecoverableCorrectionCommandRequiresCurrentAuthorityAndExplicitAcknowledgement(t *testing.T) {
	svc, opened, _, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	input, base := classificationCommandInput(t, svc, ctx, handle)
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	request := classificationSaveRequest(input, "recoverable-class-save")
	request.SessionID = handle
	if _, err := svc.SaveRecoverableCorrections(ctx, request); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("recoverable save accepted an implicit correction group", err)
	}
	request.StintBoundaries = []telemetryanalysis.StintBoundaryCorrection{}
	request.Command.ExpectedRevision = initial.SnapshotID
	if _, err := svc.SaveRecoverableCorrections(ctx, request); err != nil {
		t.Fatal("recoverable save failed", err)
	}
	pendingRequest := TelemetryAnalysisCorrectionPendingRequest{SessionID: handle, Base: base}
	pending, err := svc.LoadPendingCorrectionCommand(ctx, pendingRequest)
	if err != nil || pending == nil || pending.Command.CommandID != request.Command.CommandID || pending.StintBoundaries == nil {
		t.Fatal("service lost the complete pending command", err)
	}
	foreign := pendingRequest
	foreign.Base.AnalysisVersion = "foreign"
	if _, err := svc.LoadPendingCorrectionCommand(ctx, foreign); !errors.Is(err, ErrTelemetryAnalysisCorrectionSourceChanged) {
		t.Fatal("loaded pending command for another base", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: false}
	if _, err := svc.LoadPendingCorrectionCommand(ctx, pendingRequest); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("loaded pending command without source authority", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: true}
	pendingRequest.CommandID = request.Command.CommandID
	if err := svc.AcknowledgeCorrectionCommand(ctx, pendingRequest); err != nil {
		t.Fatal("could not acknowledge delivered command", err)
	}
	if pending, err := svc.LoadPendingCorrectionCommand(ctx, pendingRequest); err != nil || pending != nil {
		t.Fatal("acknowledged command remained pending", err)
	}
	if err := svc.AcknowledgeCorrectionCommand(ctx, pendingRequest); err != nil {
		t.Fatal("acknowledgement was not idempotent", err)
	}
}

func TestClassificationCommandsSaveResolveGuardAndReplay(t *testing.T) {
	svc, opened, _, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	input, base := classificationCommandInput(t, svc, ctx, handle)
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	request := classificationSaveRequest(input, "class-save")
	request.SessionID = handle
	request.Command.ExpectedRevision = initial.SnapshotID
	if len(request.Corrections) != 1 || len(request.FamilyUses) != 1 || len(request.Classifications) != 1 {
		t.Fatal("fixture lacks three-group targets")
	}
	marshal := func(value any) string {
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	beforeRequest := marshal(request)
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := saved.Revision.Snapshot
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || len(snapshot.Corrections) != 1 || len(snapshot.FamilyUses) != 1 || len(snapshot.Classifications) != 1 {
		t.Fatalf("wrong v3 revision: %+v", snapshot)
	}
	saved.Revision.Snapshot.Classifications[0].Request.Reason = "caller mutation"
	if marshal(request) != beforeRequest {
		t.Fatal("save aliases caller request")
	}
	resolved, err := svc.ResolveCorrectionCommand(ctx, request)
	if err != nil || !resolved.Found || resolved.Revision == nil || resolved.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal("mixed resolve lost command", resolved, err)
	}
	replay, err := svc.SaveCorrections(ctx, request)
	if err != nil || replay.Revision.RevisionID != saved.Revision.RevisionID || replay.HeadID != saved.HeadID {
		t.Fatal("mixed replay duplicated", err)
	}
	changed := request
	changed.Classifications = append([]telemetryanalysis.ClassificationCorrection(nil), request.Classifications...)
	changed.Classifications[0].Reason = "changed reason"
	if _, err := svc.ResolveCorrectionCommand(ctx, changed); !errors.Is(err, ErrTelemetryAnalysisCorrectionConflict) {
		t.Fatal("resolve ignored classification payload", err)
	}
	legacy := request
	legacy.FamilyUses = nil
	legacy.Classifications = nil
	legacy.Command.ExpectedRevision = saved.HeadID
	legacy.Command.CommandID = "legacy-overwrite"
	if _, err := svc.SaveCorrections(ctx, legacy); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("legacy silently removed groups", err)
	}
	incomplete := request
	incomplete.FamilyUses = nil
	incomplete.Command.CommandID = "missing-families"
	if _, err := svc.SaveCorrections(ctx, incomplete); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("accepted classifications without family group", err)
	}
	if _, err := svc.ResolveCorrectionCommand(ctx, incomplete); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("resolved classifications without family group", err)
	}
	withdraw := request
	withdraw.FamilyUses = []telemetryanalysis.LapFamilyUseCorrection{}
	withdraw.Classifications = []telemetryanalysis.ClassificationCorrection{}
	withdraw.Command.ExpectedRevision = saved.HeadID
	withdraw.Command.CommandID = "withdraw-all"
	withdrawn, err := svc.SaveCorrections(ctx, withdraw)
	if err != nil {
		t.Fatal(err)
	}
	old, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base, RevisionID: saved.Revision.RevisionID})
	if err != nil || old.Revision.Snapshot.SnapshotID != snapshot.SnapshotID || old.HeadID != withdrawn.HeadID {
		t.Fatal("exact historical revision lost after head advance", err)
	}
	replayOld, err := svc.SaveCorrections(ctx, request)
	if err != nil || replayOld.Revision.RevisionID != saved.Revision.RevisionID || replayOld.HeadID != withdrawn.HeadID {
		t.Fatal("old command replay after head advance created revision or moved head", err)
	}
	resolvedOld, err := svc.ResolveCorrectionCommand(ctx, request)
	if err != nil || !resolvedOld.Found || resolvedOld.Revision == nil || resolvedOld.Revision.RevisionID != saved.Revision.RevisionID || resolvedOld.HeadID != withdrawn.HeadID {
		t.Fatal("old command resolve after head advance lost revision or head", resolvedOld, err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: false}
	if _, err := svc.SaveCorrections(ctx, request); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("classified save bypassed auth", err)
	}
	if _, err := svc.ResolveCorrectionCommand(ctx, request); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("classified resolve bypassed auth", err)
	}
	if _, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base, RevisionID: saved.Revision.RevisionID}); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatal("classified project bypassed auth", err)
	}
}

func TestClassificationProjectionLabelsGatesAndClimateStability(t *testing.T) {
	svc, opened, _, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	_, base := classificationCommandInput(t, svc, ctx, handle)
	root := t.TempDir()
	svc.corrections = telemetryanalysis.NewCorrectionStore(root)
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	classes := []telemetryanalysis.ClassificationCorrection{
		{Base: base, Field: telemetryanalysis.ClassificationFieldSessionType, ExpectedOriginal: "Race", Replacement: "qualify", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual},
		{Base: base, Field: telemetryanalysis.ClassificationFieldWeatherConditions, ExpectedOriginal: "Clear", Replacement: "Wet", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual},
	}
	request := TelemetryAnalysisCorrectionSaveRequest{SessionID: handle, Base: base, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{}, Classifications: classes,
		Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "classify-both", Reason: "controlled review", LocalAuthorID: "local-test"}}
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	project := func(revisionID string) strategyprojection.StrategyInputProjectionV2 {
		projection, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base, RevisionID: revisionID})
		if err != nil {
			t.Fatal(err)
		}
		return projection
	}
	classified := project(saved.Revision.RevisionID)
	if classified.SessionClassification.SessionType != "qualify" || classified.SessionClassification.WeatherConditions != "Wet" {
		t.Fatalf("projection lost labels: %+v", classified.SessionClassification)
	}
	if !containsFamily(classified.SessionClassification.UsableForFamilies, string(telemetryanalysis.FamilyFuelConsumption)) {
		t.Fatal("completed gate lost")
	}
	if containsFamily(classified.SessionClassification.UsableForFamilies, string(telemetryanalysis.FamilyObservedStrategy)) {
		t.Fatal("qualify kept observed preliminary usability")
	}
	familyClient := request
	familyClient.FamilyUses = []telemetryanalysis.LapFamilyUseCorrection{}
	familyClient.Classifications = nil
	familyClient.Command.ExpectedRevision = saved.HeadID
	familyClient.Command.CommandID = "family-client-overwrite"
	if _, err := svc.SaveCorrections(ctx, familyClient); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("family client silently removed classifications", err)
	}
	withdraw := request
	withdraw.Classifications = []telemetryanalysis.ClassificationCorrection{}
	withdraw.Command.ExpectedRevision = saved.HeadID
	withdraw.Command.CommandID = "withdraw-labels"
	restored, err := svc.SaveCorrections(ctx, withdraw)
	if err != nil {
		t.Fatal(err)
	}
	original := project(restored.Revision.RevisionID)
	if original.SessionClassification.SessionType != "race" || original.SessionClassification.WeatherConditions != "Clear" {
		t.Fatalf("withdrawal lost original labels: %+v", original.SessionClassification)
	}
	if !reflect.DeepEqual(classified.ClimateBuckets, original.ClimateBuckets) ||
		!reflect.DeepEqual(classified.FuelConsumption, original.FuelConsumption) ||
		!reflect.DeepEqual(classified.RepresentativePaceByClimateBucket, original.RepresentativePaceByClimateBucket) ||
		!reflect.DeepEqual(classified.CombinedStintPaceCurve, original.CombinedStintPaceCurve) ||
		!reflect.DeepEqual(classified.Pit, original.Pit) {
		t.Fatal("weather label changed physical metrics")
	}
	svc.corrections = telemetryanalysis.NewCorrectionStore(root)
	reopened := project(saved.Revision.RevisionID)
	if reopened.SessionClassification.SessionType != "qualify" || reopened.SessionClassification.WeatherConditions != "Wet" {
		t.Fatalf("reopen lost labels: %+v", reopened.SessionClassification)
	}
	if !reflect.DeepEqual(reopened.SourceRevisions, classified.SourceRevisions) {
		t.Fatal("reopen lost exact stored references")
	}
	head, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base})
	if err != nil || head.HeadID != restored.HeadID {
		t.Fatal("head moved after reopen", err)
	}
}

func TestClassificationCommandsRejectAtomicallyWithMappings(t *testing.T) {
	if got := publicCorrectionError(telemetryanalysis.ErrInvalidSessionClassification); !errors.Is(got, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatal("classification domain not mapped to invalid request", got)
	}
	if got := publicCorrectionError(telemetryanalysis.ErrUnsupportedSessionSimulator); !errors.Is(got, ErrTelemetryAnalysisIncompatible) {
		t.Fatal("simulator domain not mapped to incompatible", got)
	}
	svc, opened, _, _ := revisionCatalogFixture(t)
	ctx := context.Background()
	handle := opened[0].SessionID
	input, base := classificationCommandInput(t, svc, ctx, handle)
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	valid := classificationSaveRequest(input, "mapping-base")
	valid.SessionID = handle
	valid.Command.ExpectedRevision = initial.SnapshotID
	valid.Classifications = []telemetryanalysis.ClassificationCorrection{
		{Base: base, Field: telemetryanalysis.ClassificationFieldSessionType, ExpectedOriginal: "Race", Replacement: "qualify", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual},
	}
	mutate := func(f func(*TelemetryAnalysisCorrectionSaveRequest)) TelemetryAnalysisCorrectionSaveRequest {
		altered := valid
		altered.Classifications = append([]telemetryanalysis.ClassificationCorrection(nil), valid.Classifications...)
		altered.Command.CommandID += "-mutated"
		f(&altered)
		return altered
	}
	flood := valid
	flood.Classifications = make([]telemetryanalysis.ClassificationCorrection, telemetryanalysis.MaxSampleCorrections+1)
	for i := range flood.Classifications {
		flood.Classifications[i] = valid.Classifications[0]
	}
	flood.Command.CommandID = "flood"
	for _, tc := range []struct {
		name       string
		request    TelemetryAnalysisCorrectionSaveRequest
		want       error
		resolveErr error
		absent     bool
	}{
		{"classifications without families", mutate(func(r *TelemetryAnalysisCorrectionSaveRequest) { r.FamilyUses = nil }), ErrTelemetryAnalysisInvalidRequest, ErrTelemetryAnalysisInvalidRequest, false},
		{"quota", flood, ErrTelemetryAnalysisInvalidRequest, ErrTelemetryAnalysisInvalidRequest, false},
		{"foreign base", mutate(func(r *TelemetryAnalysisCorrectionSaveRequest) { r.Base.AnalysisVersion = "other" }), ErrTelemetryAnalysisCorrectionSourceChanged, ErrTelemetryAnalysisCorrectionSourceChanged, false},
		{"discordant original", mutate(func(r *TelemetryAnalysisCorrectionSaveRequest) { r.Classifications[0].ExpectedOriginal = "practice" }), ErrTelemetryAnalysisInvalidRequest, nil, true},
		{"unknown replacement", mutate(func(r *TelemetryAnalysisCorrectionSaveRequest) { r.Classifications[0].Replacement = "sprint" }), ErrTelemetryAnalysisInvalidRequest, ErrTelemetryAnalysisInvalidRequest, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := svc.SaveCorrections(ctx, tc.request)
			if !errors.Is(err, tc.want) || !reflect.DeepEqual(result, telemetryanalysis.CorrectionStoreResult{}) {
				t.Fatalf("got %+v, %v, want %v", result, err, tc.want)
			}
			resolved, err := svc.ResolveCorrectionCommand(ctx, tc.request)
			if tc.absent {
				if err != nil || resolved.Found || resolved.HeadID != initial.SnapshotID {
					t.Fatalf("unregistered payload must report absence: %+v, %v", resolved, err)
				}
			} else if !errors.Is(err, tc.resolveErr) || resolved.Found {
				t.Fatalf("got %+v, %v, want %v", resolved, err, tc.resolveErr)
			}
			head, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base})
			if err != nil || head.HeadID != initial.SnapshotID {
				t.Fatal("rejected save moved head", err)
			}
		})
	}
}

func TestClassificationPartialMetadataSavesButProjectStaysIncompatible(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	t.Cleanup(func() {
		if err := svc.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	svc.corrections = telemetryanalysis.NewCorrectionStore(t.TempDir())
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		a, b := 10000.0, 10090.0
		reader := &telemetryAnalysisReaderStub{evidence: artifact.Evidence(), catalog: telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{{Name: "Lap", Unit: "count", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}}}}, rows: []telemetryanalysis.LMUDuckDBRow{{TimestampSeconds: &a, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}}, {TimestampSeconds: &b, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}}}}
		for key, value := range map[string]string{"TrackName": "Imola", "TrackLayout": "Grand Prix", "CarName": "Test Car", "CarClass": "Hypercar", "SessionType": "Race"} {
			reader.catalog.Metadata = append(reader.catalog.Metadata, telemetryanalysis.LMUDuckDBMetadata{Key: key, Value: value, Present: true, Quality: telemetryanalysis.QualityValid})
		}
		return &correctionCommandReader{reader}, nil
	}
	ctx := context.Background()
	opened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := svc.PrepareCorrections(ctx, opened.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Combination != nil {
		t.Fatal("partial metadata offered combination")
	}
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(prepared.Base, nil)
	if err != nil {
		t.Fatal(err)
	}
	request := TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: prepared.Base, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{},
		Classifications: []telemetryanalysis.ClassificationCorrection{{Base: prepared.Base, Field: telemetryanalysis.ClassificationFieldSessionType, ExpectedOriginal: "Race", Replacement: "qualify", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual}},
		Command:         telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "partial-save", Reason: "controlled review", LocalAuthorID: "local-test"}}
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatal("valid field with missing weather rejected", err)
	}
	if len(saved.Revision.Snapshot.Classifications) != 1 {
		t.Fatal("partial correction not stored")
	}
	if _, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: opened.SessionID, Base: prepared.Base, RevisionID: saved.Revision.RevisionID}); !errors.Is(err, ErrTelemetryAnalysisIncompatible) {
		t.Fatal("projection with missing metadata not incompatible", err)
	}
}

func TestClassificationMultiSessionConsumerUsesEffectiveType(t *testing.T) {
	svc, opened, fixtureRefs, combination := revisionCatalogFixture(t)
	ctx := context.Background()
	refs := make([]strategyprojection.AnalysisRevisionRef, len(opened))
	for i, session := range opened {
		_, base := classificationCommandInput(t, svc, ctx, session.SessionID)
		initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(base, nil)
		if err != nil {
			t.Fatal(err)
		}
		classes := []telemetryanalysis.ClassificationCorrection{
			{Base: base, Field: telemetryanalysis.ClassificationFieldSessionType, ExpectedOriginal: "Race", Replacement: "qualify", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual},
		}
		if i == 0 {
			classes = append(classes, telemetryanalysis.ClassificationCorrection{Base: base, Field: telemetryanalysis.ClassificationFieldWeatherConditions, ExpectedOriginal: "Clear", Replacement: "Wet", Reason: "controlled review", Provenance: telemetryanalysis.ClassificationProvenanceManual})
		}
		saved, err := svc.SaveCorrections(ctx, TelemetryAnalysisCorrectionSaveRequest{SessionID: session.SessionID, Base: base, FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{}, Classifications: classes,
			Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "classify-multi", Reason: "controlled review", LocalAuthorID: "local-test"}})
		if err != nil {
			t.Fatal(err)
		}
		digest, err := base.Digest()
		if err != nil {
			t.Fatal(err)
		}
		refs[i] = strategyprojection.AnalysisRevisionRef{SessionID: fixtureRefs[i].SessionID, BaseDigest: digest, RevisionID: saved.Revision.RevisionID, SnapshotID: saved.Revision.Snapshot.SnapshotID}
	}
	catalog := NewStrategyRevisionCatalog(telemetryanalysis.NewSessionCatalog(nil), svc)
	at := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	result, err := catalog.ProjectStrategyRevisionInputs(ctx, combination, refs, at)
	if err != nil {
		t.Fatal(err)
	}
	if result.SessionClassification.SessionType != "qualify" {
		t.Fatalf("catalog lost effective type: %+v", result.SessionClassification)
	}
	if result.SessionClassification.WeatherConditions != "mixed" {
		t.Fatalf("catalog lost effective weather union: %+v", result.SessionClassification)
	}
	if !reflect.DeepEqual(result.SourceRevisions, refs) {
		t.Fatal("catalog substituted revisions")
	}
}
