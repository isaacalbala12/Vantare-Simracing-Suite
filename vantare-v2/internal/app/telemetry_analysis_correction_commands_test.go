package app

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
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
