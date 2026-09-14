package app

import (
	"context"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type stintCommandReader struct{ *telemetryAnalysisReaderStub }

func (reader *stintCommandReader) ReadRows(_ context.Context, table string, start int64, limit int) ([]telemetryanalysis.LMUDuckDBRow, error) {
	seconds := func(value float64) *float64 { return &value }
	var rows []telemetryanalysis.LMUDuckDBRow
	switch {
	case strings.Contains(strings.ToLower(table), "in pits"):
		rows = []telemetryanalysis.LMUDuckDBRow{
			{TimestampSeconds: seconds(10010), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarBoolean, Boolean: false}}},
			{TimestampSeconds: seconds(10080), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarBoolean, Boolean: true}}},
			{TimestampSeconds: seconds(10100), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarBoolean, Boolean: false}}},
		}
	case strings.Contains(strings.ToLower(table), "lap time"):
		rows = []telemetryanalysis.LMUDuckDBRow{
			{TimestampSeconds: seconds(10000), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarNumber, Number: 0}}},
			{TimestampSeconds: seconds(10090), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarNumber, Number: 90}}},
			{TimestampSeconds: seconds(10180), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarNumber, Number: 90}}},
		}
	default:
		rows = []telemetryanalysis.LMUDuckDBRow{
			{TimestampSeconds: seconds(10000), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}},
			{TimestampSeconds: seconds(10090), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}},
			{TimestampSeconds: seconds(10180), Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 3}}},
		}
	}
	if start >= int64(len(rows)) {
		return nil, nil
	}
	end := min(len(rows), int(start)+limit)
	return append([]telemetryanalysis.LMUDuckDBRow(nil), rows[start:end]...), nil
}

func TestStintBoundaryCommandsUseExistingSaveLoadAndResolve(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	t.Cleanup(func() { _ = svc.ServiceShutdown() })
	svc.corrections = telemetryanalysis.NewCorrectionStore(t.TempDir())
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		columns := func(kind string) []telemetryanalysis.LMUDuckDBColumn {
			return []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: kind}}
		}
		stub := &telemetryAnalysisReaderStub{evidence: artifact.Evidence(), catalog: telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{
			{Name: "Lap", Unit: "count", Columns: columns("USMALLINT")},
			{Name: "Lap Time", Unit: "s", Columns: columns("DOUBLE")},
			{Name: "In Pits", Unit: "bool", Columns: columns("BOOLEAN")},
		}}}
		return &stintCommandReader{stub}, nil
	}
	ctx := context.Background()
	opened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := svc.PrepareCorrections(ctx, opened.SessionID)
	if err != nil || len(prepared.StintBoundaries) != 1 {
		t.Fatalf("stint options = %+v, %v", prepared.StintBoundaries, err)
	}
	original := prepared.StintBoundaries[0]
	request := TelemetryAnalysisCorrectionSaveRequest{
		SessionID: opened.SessionID, Base: prepared.Base,
		FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{}, Classifications: []telemetryanalysis.ClassificationCorrection{},
		StintBoundaries: []telemetryanalysis.StintBoundaryCorrection{{Operation: telemetryanalysis.StintBoundaryRemove, Base: prepared.Base, Target: telemetryanalysis.StintBoundaryTarget{StintNumber: original.StintNumber, Timestamp: original.Timestamp, Cause: original.Cause}, Expected: original, Reason: "false split"}},
		Command:         telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: prepared.BaseRevisionID, CommandID: "remove-stint", Reason: "reviewed", LocalAuthorID: "test"},
	}
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil || saved.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v5" || len(saved.Revision.Snapshot.StintBoundaries) != 1 {
		t.Fatalf("save = %+v, %v", saved, err)
	}
	resolved, err := svc.ResolveCorrectionCommand(ctx, request)
	if err != nil || !resolved.Found || resolved.Revision == nil || resolved.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatalf("resolve = %+v, %v", resolved, err)
	}
	loaded, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: opened.SessionID, Base: prepared.Base, RevisionID: saved.Revision.RevisionID})
	if err != nil || len(loaded.Revision.Snapshot.StintBoundaries) != 1 {
		t.Fatalf("load = %+v, %v", loaded, err)
	}
}
