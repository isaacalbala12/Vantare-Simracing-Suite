package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// identityCatalogSource is the controlled AuthorizedSessionSource for this
// cut: it returns only models authorized by fixture opening, or a read
// failure, and counts calls so tests can prove that guards resolve before
// any lookup and that replay/Resolve/Load/Project never consult the catalog.
type identityCatalogSource struct {
	models []telemetryanalysis.AuthorizedSessionModel
	err    error
	calls  int
}

func (source *identityCatalogSource) ListAuthorizedSessions(context.Context) ([]telemetryanalysis.AuthorizedSessionModel, error) {
	source.calls++
	return source.models, source.err
}

type identityCorrectionFixture struct {
	svc    *TelemetryAnalysisService
	source *identityCatalogSource
	handle string
	input  telemetryanalysis.CorrectionInput
	imola  telemetryanalysis.AuthorizedSessionModel
	monza  telemetryanalysis.AuthorizedSessionModel
	target telemetryanalysis.CombinationIdentity
}

// newIdentityCorrectionFixture builds both catalog models through the real
// service authorization gate: two controlled fixtures are discovered and
// opened, and the artifact received by readerFactory is what authorizes each
// model. The Imola RAW source and the Monza destination share layout, car and
// class, so a single TrackName correction stays coherent with the resolved
// canonical target whose ID comes from Monza's own classification.
func newIdentityCorrectionFixture(t *testing.T) identityCorrectionFixture {
	t.Helper()
	svc, imolaPath, now := telemetryAnalysisTestService(t, true)
	t.Cleanup(func() {
		if err := svc.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	svc.corrections = telemetryanalysis.NewCorrectionStore(t.TempDir())
	imolaContent, err := os.ReadFile(imolaPath)
	if err != nil {
		t.Fatal(err)
	}
	monzaContent := []byte("monza canonical destination fixture")
	if err := os.WriteFile(filepath.Join(filepath.Dir(imolaPath), "monza-destination.duckdb"), monzaContent, 0o600); err != nil {
		t.Fatal(err)
	}
	imolaDigest := sha256.Sum256(imolaContent)
	monzaDigest := sha256.Sum256(monzaContent)
	tracks := map[string]string{
		hex.EncodeToString(imolaDigest[:]): "Imola",
		hex.EncodeToString(monzaDigest[:]): "Monza",
	}
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		track, ok := tracks[artifact.Evidence().ContentSHA256]
		if !ok {
			return nil, errors.New("unauthorized fixture content")
		}
		a, b := 10000.0, 10090.0
		reader := &telemetryAnalysisReaderStub{evidence: artifact.Evidence(), catalog: telemetryanalysis.LMUDuckDBCatalog{Events: []telemetryanalysis.LMUDuckDBChannel{{Name: "Lap", Unit: "count", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}}}}, rows: []telemetryanalysis.LMUDuckDBRow{{TimestampSeconds: &a, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 1}}}, {TimestampSeconds: &b, Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarInteger, Integer: 2}}}}}
		for key, value := range map[string]string{"TrackName": track, "TrackLayout": "Grand Prix", "CarName": "Test Car", "CarClass": "Hypercar", "SessionType": "Race", "WeatherConditions": "Clear"} {
			reader.catalog.Metadata = append(reader.catalog.Metadata, telemetryanalysis.LMUDuckDBMetadata{Key: key, Value: value, Present: true, Quality: telemetryanalysis.QualityValid})
		}
		reader.catalog.Events = append(reader.catalog.Events, telemetryanalysis.LMUDuckDBChannel{Name: "Lap Time", Unit: "s", Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "DOUBLE"}}})
		return &correctionCommandReader{reader}, nil
	}
	ctx := context.Background()
	if _, err := svc.Discover(ctx); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(2 * time.Second)
	candidates, err := svc.Discover(ctx)
	if err != nil || len(candidates) != 2 {
		t.Fatalf("candidates: %v %v", candidates, err)
	}
	fixture := identityCorrectionFixture{svc: svc, source: &identityCatalogSource{}}
	for _, candidate := range candidates {
		opened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
		if err != nil {
			t.Fatal(err)
		}
		model := telemetryanalysis.AuthorizedSessionModel{Artifact: svc.sessions[opened.SessionID].artifact, Session: opened.Session}
		classified, err := telemetryanalysis.ClassifyHistoricalSession(opened.Session)
		if err != nil {
			t.Fatal(err)
		}
		switch classified.Combination.TrackName {
		case "Imola":
			fixture.imola, fixture.handle = model, opened.SessionID
		case "Monza":
			fixture.monza, fixture.target = model, classified.Combination
		default:
			t.Fatalf("unexpected fixture track %q", classified.Combination.TrackName)
		}
	}
	if fixture.handle == "" || fixture.target.ID == "" {
		t.Fatal("fixture missed an opened model")
	}
	fixture.source.models = []telemetryanalysis.AuthorizedSessionModel{fixture.imola, fixture.monza}
	svc.cfg.SessionCatalog = telemetryanalysis.NewSessionCatalog(fixture.source)
	input, _ := classificationCommandInput(t, svc, ctx, fixture.handle)
	fixture.input = input
	return fixture
}

// identitySaveRequest is the coherent TrackName command for this fixture:
// original Imola RAW byte to byte, the destination tuple referenced by its
// canonical ID and an explicit empty family group, as the mixed-set contract
// requires.
func identitySaveRequest(t *testing.T, base telemetryanalysis.SourceAnalysisRef, handle, commandID, targetID, replacement string) TelemetryAnalysisCorrectionSaveRequest {
	t.Helper()
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	return TelemetryAnalysisCorrectionSaveRequest{SessionID: handle, Base: base,
		FamilyUses: []telemetryanalysis.LapFamilyUseCorrection{},
		Classifications: []telemetryanalysis.ClassificationCorrection{
			{Base: base, Field: telemetryanalysis.ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: replacement, Reason: "controlled identity review", Provenance: telemetryanalysis.ClassificationProvenanceManual, CanonicalCombinationID: targetID},
		},
		Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: commandID, Reason: "controlled review", LocalAuthorID: "local-test"}}
}

func TestIdentityCorrectionSaveResolvesCatalogAndProjectsExactRevision(t *testing.T) {
	fixture := newIdentityCorrectionFixture(t)
	svc, source, handle, input, target := fixture.svc, fixture.source, fixture.handle, fixture.input, fixture.target
	ctx := context.Background()
	base := input.Base
	original, err := telemetryanalysis.ClassifyHistoricalSession(input.Session)
	if err != nil {
		t.Fatal(err)
	}
	request := identitySaveRequest(t, base, handle, "identity-save", target.ID, "Monza")
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := saved.Revision.Snapshot
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || snapshot.CanonicalCombination == nil || *snapshot.CanonicalCombination != target {
		t.Fatalf("wrong v4 revision: %+v", snapshot)
	}
	if len(snapshot.Classifications) != 1 || snapshot.Classifications[0].Original != "Imola" || snapshot.Classifications[0].Corrected != "Monza" {
		t.Fatalf("identity correction not stored: %+v", snapshot.Classifications)
	}
	if source.calls != 1 {
		t.Fatalf("resolver calls = %d, want exactly one under lease", source.calls)
	}
	lookup := TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base, RevisionID: saved.Revision.RevisionID}
	projection, err := svc.ProjectCorrection(ctx, lookup)
	if err != nil {
		t.Fatal(err)
	}
	if projection.CombinationID != target.ID || projection.SessionClassification.TrackName != "Monza" {
		t.Fatalf("projection lost canonical identity: %+v", projection.SessionClassification)
	}
	baseDigest, err := base.Digest()
	if err != nil {
		t.Fatal(err)
	}
	wantRef := strategyprojection.AnalysisRevisionRef{SessionID: base.SessionID, BaseDigest: baseDigest, RevisionID: saved.Revision.RevisionID, SnapshotID: snapshot.SnapshotID}
	if len(projection.SourceRevisions) != 1 || projection.SourceRevisions[0] != wantRef {
		t.Fatal("projection lost the exact revision reference")
	}
	prepared, err := svc.PrepareCorrections(ctx, handle)
	if err != nil || prepared.Combination == nil || prepared.Combination.TrackName != "Imola" || prepared.Combination.ID != original.Combination.ID {
		t.Fatal("original source combination changed by the correction", err)
	}

	// Replay, Resolve, Load and Project read the persisted v4 decision after
	// the destination leaves the catalog; the stored target is the authority.
	source.models = nil
	replay, err := svc.SaveCorrections(ctx, request)
	if err != nil || replay.Revision.RevisionID != saved.Revision.RevisionID || replay.HeadID != saved.HeadID {
		t.Fatal("identity replay duplicated or failed after destination removal", err)
	}
	resolved, err := svc.ResolveCorrectionCommand(ctx, request)
	if err != nil || !resolved.Found || resolved.Revision == nil || resolved.Revision.RevisionID != saved.Revision.RevisionID {
		t.Fatal("resolve lost the persisted identity command", err)
	}
	loaded, err := svc.LoadCorrection(ctx, lookup)
	if err != nil || loaded.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || loaded.Revision.Snapshot.CanonicalCombination == nil || *loaded.Revision.Snapshot.CanonicalCombination != target {
		t.Fatal("load lost the persisted v4 identity", err)
	}
	if _, err := svc.ProjectCorrection(ctx, lookup); err != nil {
		t.Fatal("project lost the persisted v4 identity", err)
	}
	if source.calls != 1 {
		t.Fatalf("historical operations consulted the catalog: %d calls", source.calls)
	}

	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: false}
	for name, op := range map[string]func() error{
		"save":    func() error { _, err := svc.SaveCorrections(ctx, request); return err },
		"resolve": func() error { _, err := svc.ResolveCorrectionCommand(ctx, request); return err },
		"load":    func() error { _, err := svc.LoadCorrection(ctx, lookup); return err },
		"project": func() error { _, err := svc.ProjectCorrection(ctx, lookup); return err },
	} {
		if err := op(); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
			t.Fatalf("%s bypassed source authorization: %v", name, err)
		}
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: true}

	withdraw := request
	withdraw.Classifications = []telemetryanalysis.ClassificationCorrection{}
	withdraw.Command.ExpectedRevision = saved.HeadID
	withdraw.Command.CommandID = "identity-withdraw"
	restored, err := svc.SaveCorrections(ctx, withdraw)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Revision.Snapshot.CanonicalCombination != nil || len(restored.Revision.Snapshot.Classifications) != 0 {
		t.Fatal("withdrawal kept identity state")
	}
	if source.calls != 1 {
		t.Fatalf("withdrawal without identity consulted the catalog: %d calls", source.calls)
	}
	old, err := svc.LoadCorrection(ctx, lookup)
	if err != nil || old.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || *old.Revision.Snapshot.CanonicalCombination != target || old.HeadID != restored.HeadID {
		t.Fatal("v4 revision lost after head advance", err)
	}
	oldProjection, err := svc.ProjectCorrection(ctx, lookup)
	if err != nil || oldProjection.CombinationID != target.ID {
		t.Fatal("exact v4 reference lost its projection", err)
	}
	restoredProjection, err := svc.ProjectCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base, RevisionID: restored.Revision.RevisionID})
	if err != nil {
		t.Fatal(err)
	}
	if restoredProjection.CombinationID != original.Combination.ID || restoredProjection.SessionClassification.TrackName != "Imola" {
		t.Fatal("restored projection adopted the corrected identity")
	}
}

func TestIdentityCorrectionSaveRejectsUnavailableUnknownAndBrokenCatalog(t *testing.T) {
	fixture := newIdentityCorrectionFixture(t)
	svc, source, handle, input, target := fixture.svc, fixture.source, fixture.handle, fixture.input, fixture.target
	ctx := context.Background()
	base := input.Base
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}

	svc.cfg.SessionCatalog = nil
	if _, err := svc.SaveCorrections(ctx, identitySaveRequest(t, base, handle, "identity-nil-catalog", target.ID, "Monza")); !errors.Is(err, ErrTelemetryAnalysisCanonicalCombinationUnavailable) {
		t.Fatalf("nil catalog = %v", err)
	} else if err.Error() != "the canonical combination catalog is unavailable" {
		t.Fatalf("public text moved: %q", err.Error())
	}
	if source.calls != 0 {
		t.Fatalf("nil receiver consulted the source: %d calls", source.calls)
	}

	imolaOnly := &identityCatalogSource{models: []telemetryanalysis.AuthorizedSessionModel{fixture.imola}}
	svc.cfg.SessionCatalog = telemetryanalysis.NewSessionCatalog(imolaOnly)
	if _, err := svc.SaveCorrections(ctx, identitySaveRequest(t, base, handle, "identity-unknown", target.ID, "Monza")); !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatalf("absent canonical combination = %v", err)
	}
	if imolaOnly.calls != 1 {
		t.Fatalf("unknown reference did not reach exactly one lookup: %d", imolaOnly.calls)
	}

	svc.cfg.SessionCatalog = telemetryanalysis.NewSessionCatalog(source)
	source.err = errors.New("private catalog read /secret/catalog.duckdb")
	_, err = svc.SaveCorrections(ctx, identitySaveRequest(t, base, handle, "identity-io", target.ID, "Monza"))
	if !errors.Is(err, ErrTelemetryAnalysisCorrectionStorage) || strings.Contains(err.Error(), "private") || strings.Contains(err.Error(), "catalog.duckdb") {
		t.Fatalf("catalog IO error not sanitized: %v", err)
	}
	source.err = nil

	denied := source.calls
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: false}
	if _, err := svc.SaveCorrections(ctx, identitySaveRequest(t, base, handle, "identity-denied", target.ID, "Monza")); !errors.Is(err, ErrTelemetryAnalysisUnauthorized) {
		t.Fatalf("save without authority = %v", err)
	}
	svc.authorizer = telemetryAnalysisAuthorizerStub{allowed: true}
	foreign := identitySaveRequest(t, base, handle, "identity-foreign-base", target.ID, "Monza")
	foreign.Base.AnalysisVersion = "other"
	if _, err := svc.SaveCorrections(ctx, foreign); !errors.Is(err, ErrTelemetryAnalysisCorrectionSourceChanged) {
		t.Fatalf("foreign base = %v", err)
	}
	if source.calls != denied {
		t.Fatalf("authorization/base guards consulted the catalog: %d != %d", source.calls, denied)
	}
	head, err := svc.LoadCorrection(ctx, TelemetryAnalysisCorrectionRevisionRequest{SessionID: handle, Base: base})
	if err != nil || head.HeadID != initial.SnapshotID {
		t.Fatal("rejected identity saves wrote a revision", err)
	}
}

func TestIdentityCorrectionMixedGroupsIgnoreConfiguredCatalog(t *testing.T) {
	fixture := newIdentityCorrectionFixture(t)
	svc, source, handle, input := fixture.svc, fixture.source, fixture.handle, fixture.input
	ctx := context.Background()
	initial, err := telemetryanalysis.PrepareSampleCorrectionSnapshot(input.Base, nil)
	if err != nil {
		t.Fatal(err)
	}
	request := classificationSaveRequest(input, "legacy-groups-no-identity")
	request.SessionID = handle
	request.Command.ExpectedRevision = initial.SnapshotID
	if len(request.Corrections) != 1 || len(request.FamilyUses) != 1 || len(request.Classifications) != 1 {
		t.Fatal("fixture lacks three-group targets")
	}
	saved, err := svc.SaveCorrections(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || saved.Revision.Snapshot.CanonicalCombination != nil {
		t.Fatalf("non-identity save gained canonical state: %+v", saved.Revision.Snapshot)
	}
	if source.calls != 0 {
		t.Fatalf("non-identity save consulted the catalog: %d calls", source.calls)
	}
}
