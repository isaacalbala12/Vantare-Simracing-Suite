package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	strategyapplication "github.com/vantare/overlays/v2/internal/strategy/application"
	"github.com/vantare/overlays/v2/internal/strategy/coldstart"
	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type recordedRealRepository struct{ snapshot repository.Snapshot[any] }

func (repo recordedRealRepository) Snapshot(context.Context) (repository.Snapshot[any], error) {
	return repo.snapshot, nil
}
func (repo recordedRealRepository) Commit(context.Context, uint64, repository.ChangeSet[any]) (repository.CommitResult[any], error) {
	return repository.CommitResult[any]{}, errors.New("unexpected write during real projection query")
}

// Explicit opt-in: real user bytes, production parser/trust/authorization gates,
// controlled eligible-license authorizer. This is not a Wails/login acceptance.
type selectedRealMetadata struct {
	telemetryanalysis.OSMetadataSource
	names map[string]struct{}
}

func (source selectedRealMetadata) ReadDir(ctx context.Context, root string) ([]telemetryanalysis.MetadataEntry, error) {
	entries, err := source.OSMetadataSource.ReadDir(ctx, root)
	if err != nil {
		return nil, err
	}
	selected := make([]telemetryanalysis.MetadataEntry, 0, len(source.names))
	for _, entry := range entries {
		if _, ok := source.names[entry.Name]; ok {
			selected = append(selected, entry)
		}
	}
	return selected, nil
}
func realSourceHash(t *testing.T, path string) string {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.New()
	_, readErr := io.Copy(hash, file)
	closeErr := file.Close()
	if err := errors.Join(readErr, closeErr); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(hash.Sum(nil))
}
func TestRecordedStrategyRealDuckDB(t *testing.T) {
	source, targetSource, runtimeApp := os.Getenv("ISA1088_REAL_SOURCE"), os.Getenv("ISA1104_REAL_TARGET_SOURCE"), os.Getenv("ISA1088_RUNTIME_APP")
	if source == "" || targetSource == "" || runtimeApp == "" {
		t.Skip("requires explicit primary and target real sources plus trusted runtime application directory")
	}
	source, targetSource, runtimeApp = filepath.Clean(source), filepath.Clean(targetSource), filepath.Clean(runtimeApp)
	if filepath.Base(source) == filepath.Base(targetSource) {
		t.Fatal("primary and target real sources have ambiguous equal basenames")
	}
	before, targetBefore := realSourceHash(t, source), realSourceHash(t, targetSource)
	t.Cleanup(func() {
		if after := realSourceHash(t, source); after != before {
			t.Errorf("original changed: %s != %s", after, before)
		} else {
			t.Logf("original hash unchanged: %s", before)
		}
		if after := realSourceHash(t, targetSource); after != targetBefore {
			t.Errorf("target original changed: %s != %s", after, targetBefore)
		} else {
			t.Logf("target original hash unchanged: %s", targetBefore)
		}
	})
	root := t.TempDir()
	lmuRoots := []string{filepath.Dir(source)}
	if filepath.Dir(targetSource) != filepath.Dir(source) {
		lmuRoots = append(lmuRoots, filepath.Dir(targetSource))
	}
	svc, err := NewTelemetryAnalysisService(TelemetryAnalysisConfig{
		LMURoots: lmuRoots, ApplicationDirectory: runtimeApp,
		StagingRoot: filepath.Join(root, "staging"), CorrectionRoot: filepath.Join(root, "corrections"),
		StabilityWindow: time.Second, MaxCandidates: 2, MaxSourceBytes: 2 << 30, MaxPageRows: 4096,
	}, telemetryAnalysisAuthorizerStub{allowed: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := svc.ServiceShutdown(); err != nil {
			t.Error(err)
		}
	})
	if !svc.runtimeReady {
		t.Fatal("production trusted runtime unavailable")
	}
	// Limit discovery to the two explicitly named originals, using real OS metadata.
	svc.metadata = selectedRealMetadata{names: map[string]struct{}{filepath.Base(source): {}, filepath.Base(targetSource): {}}}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	if _, err := svc.Discover(ctx); err != nil {
		t.Fatal(err)
	}
	// Real elapsed stability window, not a forged clock or bypassed gate.
	timer := time.NewTimer(1100 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	candidates, err := svc.Discover(ctx)
	if err != nil || len(candidates) != 2 {
		t.Fatalf("discover: %v, count %d", err, len(candidates))
	}
	primaryCandidate := recordedRealCandidateByDisplayName(t, candidates, filepath.Base(source))
	targetCandidate := recordedRealCandidateByDisplayName(t, candidates, filepath.Base(targetSource))
	if primaryCandidate.ID == targetCandidate.ID {
		t.Fatal("primary and target discovery resolved to the same candidate")
	}
	importer, err := coldstart.NewLMUImporter(runtimeApp, filepath.Join(root, "catalog-staging"))
	if err != nil {
		t.Fatal(err)
	}
	store, err := telemetryanalysis.OpenAuthorizedSessionStore(filepath.Join(root, "authorized-sessions.json"))
	if err != nil {
		t.Fatal(err)
	}
	models := make(map[string]telemetryanalysis.AuthorizedSessionModel, 2)
	for _, candidate := range []TelemetryAnalysisCandidate{primaryCandidate, targetCandidate} {
		record := svc.currentCandidate(candidate.ID)
		if record == nil {
			t.Fatalf("candidate %q no longer available", candidate.DisplayName)
		}
		model, importErr := importer.Import(ctx, record.candidate)
		if importErr != nil {
			t.Fatalf("import %q: %v", candidate.DisplayName, importErr)
		}
		if addErr := store.Add(ctx, model); addErr != nil {
			t.Fatalf("authorize %q: %v", candidate.DisplayName, addErr)
		}
		models[candidate.DisplayName] = model
	}
	// Export the already imported primary model before the correction-editor
	// checks. Long recordings can exceed that editor's independent safety cap.
	if exportPath := os.Getenv("ISA1088_EXPORT_CATALOG"); exportPath != "" {
		exportStore, err := telemetryanalysis.OpenAuthorizedSessionStore(filepath.Clean(exportPath))
		if err != nil {
			t.Fatal(err)
		}
		if err := exportStore.Add(ctx, models[primaryCandidate.DisplayName]); err != nil {
			t.Fatal(err)
		}
		t.Log("exported real observed model through existing importer")
	}
	if os.Getenv("ISA1208_IMPORT_ONLY") == "1" {
		t.Log("real import-only validation completed")
		return
	}
	sessionCatalog := telemetryanalysis.NewSessionCatalog(store)
	svc.cfg.SessionCatalog = sessionCatalog
	targetClassified, err := telemetryanalysis.ClassifyHistoricalSession(models[targetCandidate.DisplayName].Session)
	if err != nil {
		t.Fatalf("classify target: %v", err)
	}
	if resolved, resolveErr := sessionCatalog.ResolveCanonicalCombination(ctx, targetClassified.Combination.ID); resolveErr != nil || resolved != targetClassified.Combination {
		t.Fatalf("resolve real target combination: %+v, %v", resolved, resolveErr)
	}
	opened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: primaryCandidate.ID, UserApproved: true})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Logf("opened %d channels", len(opened.Session.Channels))
	if err := svc.withCorrectionInput(ctx, opened.SessionID, func(_ context.Context, input telemetryanalysis.CorrectionInput) error {
		qualities := make(map[string]int)
		for _, boundary := range input.Validity.Temporal.LapBoundaries {
			qualities[string(boundary.Quality)]++
		}
		segments := make(map[string]int)
		for _, segment := range input.Validity.Temporal.Segments {
			segments[string(segment.Presence)]++
		}
		t.Logf("lap validity: bridge=%+v events=%d resets=%d complete=%d boundaries=%v segments=%v gaps=%d", input.Validity.Diagnostics.TemporalBridge,
			input.Validity.Diagnostics.LapEventRows, input.Validity.Diagnostics.LapDistResets,
			input.Validity.Diagnostics.UsableLapTimeRows, qualities, segments, len(input.Validity.Temporal.Gaps))
		return nil
	}); err != nil {
		t.Fatalf("inspect real lap validity: %v", err)
	}
	prepared, err := svc.PrepareCorrections(ctx, opened.SessionID)
	if err != nil {
		t.Fatalf("prepare: %v", err)
	}
	request := TelemetryAnalysisCorrectionRevisionRequest{SessionID: opened.SessionID, Base: prepared.Base, RevisionID: prepared.BaseRevisionID}
	projection, err := svc.ProjectCorrection(ctx, request)
	if err != nil {
		t.Fatalf("project: %v", err)
	}
	if err := projection.Validate(); err != nil {
		t.Fatal(err)
	}
	saved, err := svc.SaveCorrections(ctx, TelemetryAnalysisCorrectionSaveRequest{SessionID: opened.SessionID, Base: prepared.Base, Command: telemetryanalysis.CorrectionSaveCommand{ExpectedRevision: prepared.BaseRevisionID, CommandID: "real-base-restore", Reason: "verify exact recorded revision", LocalAuthorID: "local-validation"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if saved.HeadID == prepared.BaseRevisionID {
		t.Fatal("head did not advance")
	}
	catalog := NewStrategyRevisionCatalog(sessionCatalog, svc)
	exact, err := catalog.ProjectStrategyRevisionInputs(ctx, projection.CombinationID, projection.SourceRevisions, time.Now().UTC().Truncate(time.Millisecond))
	if err != nil {
		t.Fatalf("joint producer: %v", err)
	}
	if len(exact.SourceRevisions) != 1 || exact.SourceRevisions[0] != projection.SourceRevisions[0] {
		t.Fatal("exact revision replaced by new head")
	}
	for bucket, pace := range exact.RepresentativePaceByClimateBucket {
		t.Logf("real projection %s pace: presence=%s median=%.3f samples=%d reason=%s", bucket, pace.Presence, pace.MedianLapSeconds, pace.Confidence.SampleSize, pace.Reason)
	}
	t.Logf("real projection fuel: presence=%s mean=%.3f samples=%d buckets=%v reason=%s", exact.FuelConsumption.Presence, exact.FuelConsumption.MeanPerLap, exact.FuelConsumption.Confidence.SampleSize, exact.FuelConsumption.ByClimateBucket, exact.FuelConsumption.Reason)
	t.Logf("real projection virtual energy: class=%s presence=%s mean=%.3f reason=%s", exact.SessionClassification.CarClass, exact.VirtualEnergyConsumption.Presence, exact.VirtualEnergyConsumption.MeanPerLap, exact.VirtualEnergyConsumption.Reason)
	if exact.SessionClassification.CarClass == "LMP2_ELMS" &&
		(exact.VirtualEnergyConsumption.Presence != "missing" || exact.VirtualEnergyConsumption.Reason != "virtual_energy_not_applicable") {
		t.Fatal("LMP2 virtual energy must not become a strategy resource")
	}
	t.Logf("exact revision retained: %s; combination: %s", exact.SourceRevisions[0].RevisionID, exact.CombinationID)
	ref := exact.SourceRevisions[0]
	if models[primaryCandidate.DisplayName].Session.ID != ref.SessionID {
		t.Fatal("imported/native source identity mismatch")
	}
	repo := recordedRealRepository{snapshot: repository.Snapshot[any]{Version: 1, StrategyDocument: &strategydocument.StrategyDocumentV2{
		Events: []strategydocument.Event{{ID: "real-event", Combination: &strategydocument.CombinationReference{CombinationID: exact.CombinationID, Sessions: []strategydocument.SessionSelection{{SessionID: ref.SessionID, Included: true, Revision: &ref}}}}},
	}}}
	strategy := strategyapplication.NewServiceWithSessionCatalog[any](repo, catalog)
	command := strategyapplication.GetEventPlanningInputsCommand{CommandHeader: strategyapplication.CommandHeader{ProtocolVersion: strategyapplication.ProtocolVersionV1, CommandID: "real-inputs", Operation: strategyapplication.OperationGetEventPlanningInputs, ExpectedRepositoryVersion: 1}, EventID: "real-event", GeneratedAt: time.Now().UTC().Truncate(time.Millisecond)}
	inputs, err := strategy.GetEventPlanningInputs(ctx, command)
	if err != nil || inputs.PlanningInputs == nil || inputs.PlanningInputs.Projection == nil {
		t.Fatalf("Strategy inputs: %v", err)
	}
	if inputs.PlanningInputs.Projection.SourceRevisions[0] != ref {
		t.Fatal("Strategy replaced exact revision")
	}
	pace, pacePresent := exact.RepresentativePaceByClimateBucket["dry"]
	if pacePresent && pace.Presence == "valid" && exact.FuelConsumption.Presence == "valid" {
		// Controlled event assumptions exercise the real projection-to-solver path;
		// they are not claimed to be the rules of this recorded LMU race.
		calculated, calculateErr := strategy.CalculateOrbit(ctx, strategyapplication.CalculateOrbitCommand{
			CommandHeader: strategyapplication.CommandHeader{ProtocolVersion: strategyapplication.ProtocolVersionV1, CommandID: "real-derived-calculate", Operation: strategyapplication.OperationCalculateOrbit, ExpectedRepositoryVersion: 1},
			Input: strategyapplication.OrbitCalculationInput{
				Event:           strategyapplication.OrbitCalculationEvent{DurationMinutes: 60, TankLiters: 90, PitLossSeconds: 40},
				Drivers:         []strategyapplication.OrbitCalculationDriver{{ID: "observed-driver", Dry: strategyapplication.OrbitCalculationPace{PaceSeconds: pace.MedianLapSeconds, FuelLitersPerLap: exact.FuelConsumption.MeanPerLap}}},
				Variants:        []strategyapplication.OrbitCalculationVariant{{ID: "real-source-plan", Mode: "dry", Order: []string{"observed-driver"}, Overrides: map[int]strategyapplication.OrbitCalculationOverride{}}},
				ActiveVariantID: "real-source-plan", PlanningInputs: inputs.PlanningInputs,
			},
		})
		if calculateErr != nil || calculated.OrbitCalculation == nil {
			t.Fatalf("real-source CalculateOrbit: %v", calculateErr)
		}
		plan := calculated.OrbitCalculation.Plans["real-source-plan"]
		if plan.TotalLaps <= 0 || math.Abs(plan.AveragePace-pace.MedianLapSeconds) > 1e-9 ||
			math.Abs(plan.AverageFuel-exact.FuelConsumption.MeanPerLap) > 1e-9 {
			t.Fatalf("calculation did not use exact real reference: %+v", plan)
		}
		t.Logf("real-reference Go calculation: laps=%d stops=%d optimality=%s", plan.TotalLaps, plan.Stops, plan.Optimality)
	}
	if err := svc.CloseSession(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := catalog.ProjectStrategyRevisionInputs(ctx, projection.CombinationID, projection.SourceRevisions, time.Now().UTC().Truncate(time.Millisecond)); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatalf("closed source: %v", err)
	}
	if _, err := strategy.GetEventPlanningInputs(ctx, command); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatalf("Strategy closed source: %v", err)
	}
	reopened, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: primaryCandidate.ID, UserApproved: true})
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	request.SessionID = reopened.SessionID
	restored, err := svc.ProjectCorrection(ctx, request)
	if err != nil || restored.SourceRevisions[0] != ref {
		t.Fatalf("exact revision after reopen: %v", err)
	}
	t.Log("prepare, projection, saved head, exact prior revision, Strategy inputs, closed-source rejection and explicit reopen verified")
	classifiedSessionID, classifiedHead := verifyRecordedRealClassificationRevision(t, ctx, svc, reopened, prepared.Base, saved.HeadID, primaryCandidate.ID)
	identitySessionID, identityHead := verifyRecordedRealIdentityRevision(t, ctx, svc, TelemetryAnalysisOpenedSession{SessionID: classifiedSessionID, Session: opened.Session}, prepared.Base, classifiedHead, primaryCandidate.ID, targetClassified.Combination)
	verifyRecordedRealFamilyRevision(t, ctx, svc, identitySessionID, primaryCandidate.ID, prepared.Base, identityHead)
}

func recordedRealCandidateByDisplayName(t *testing.T, candidates []TelemetryAnalysisCandidate, displayName string) TelemetryAnalysisCandidate {
	t.Helper()
	var matched []TelemetryAnalysisCandidate
	for _, candidate := range candidates {
		if candidate.DisplayName == displayName {
			matched = append(matched, candidate)
		}
	}
	if len(matched) != 1 {
		t.Fatalf("discover display name %q matched %d candidates", displayName, len(matched))
	}
	return matched[0]
}
