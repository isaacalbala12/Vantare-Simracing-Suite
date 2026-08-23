package coldstart

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type importerStub struct{ calls int }

func (stub *importerStub) Import(_ context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	stub.calls++
	return telemetryanalysis.AuthorizedSessionModel{Session: telemetryanalysis.HistoricalSession{ID: candidate.Locator}}, nil
}

type selectiveImporterStub struct {
	mu     sync.Mutex
	calls  map[string]int
	fail   map[string]error
	panics map[string]any
}

func (stub *selectiveImporterStub) Import(_ context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	stub.mu.Lock()
	stub.calls[candidate.Locator]++
	panicValue, mustPanic := stub.panics[candidate.Locator]
	importErr := stub.fail[candidate.Locator]
	stub.mu.Unlock()
	if mustPanic {
		panic(panicValue)
	}
	if importErr != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, importErr
	}
	return telemetryanalysis.AuthorizedSessionModel{Session: telemetryanalysis.HistoricalSession{ID: candidate.Locator}}, nil
}

func TestServiceImportConcurrencyDefaultsAndCaps(t *testing.T) {
	t.Parallel()

	tests := []struct {
		configured int
		want       int
	}{
		{configured: 0, want: defaultImportConcurrency},
		{configured: -1, want: defaultImportConcurrency},
		{configured: 3, want: 3},
		{configured: 99, want: maximumImportConcurrency},
	}
	for _, test := range tests {
		service := NewService(ServiceOptions{ImportConcurrency: test.configured})
		if got := service.importConcurrency(); got != test.want {
			t.Errorf("importConcurrency(%d) = %d, want %d", test.configured, got, test.want)
		}
	}
}

type stagingFixtureImporter struct{ root string }

func (importer stagingFixtureImporter) Import(ctx context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	artifact, err := telemetryanalysis.BuildAuthorizedHistoricalArtifact(ctx, telemetryanalysis.OSContentSource{}, candidate, telemetryanalysis.ImportOptions{
		Storage: telemetryanalysis.StorageReference, Access: telemetryanalysis.AccessUserApproved, MaxBytes: 1024,
		ParserID: telemetryanalysis.LMUDuckDBParserID, ParserVersion: telemetryanalysis.LMUDuckDBParserVersion,
		Provenance: telemetryanalysis.Provenance{Kind: telemetryanalysis.ProvenanceUser, EvidenceID: "cold-start-fixture"},
	})
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, err
	}
	staged, err := telemetryanalysis.StageAuthorizedHistoricalArtifact(ctx, telemetryanalysis.OSContentSource{}, candidate, artifact, importer.root)
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, err
	}
	defer staged.Cleanup()
	return telemetryanalysis.AuthorizedSessionModel{Artifact: artifact, Session: telemetryanalysis.HistoricalSession{ID: candidate.Locator}}, nil
}

type sessionStoreStub struct {
	mu     sync.Mutex
	models []telemetryanalysis.AuthorizedSessionModel
}

func (store *sessionStoreStub) Add(_ context.Context, model telemetryanalysis.AuthorizedSessionModel) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.models = append(store.models, model)
	return nil
}

func (store *sessionStoreStub) ListAuthorizedSessions(context.Context) ([]telemetryanalysis.AuthorizedSessionModel, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	return append([]telemetryanalysis.AuthorizedSessionModel(nil), store.models...), nil
}

type concurrentImporterStub struct {
	mu        sync.Mutex
	started   chan struct{}
	release   chan struct{}
	active    int
	maxActive int
}

func (stub *concurrentImporterStub) Import(ctx context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	stub.mu.Lock()
	stub.active++
	if stub.active > stub.maxActive {
		stub.maxActive = stub.active
	}
	stub.mu.Unlock()
	defer func() {
		stub.mu.Lock()
		stub.active--
		stub.mu.Unlock()
	}()
	stub.started <- struct{}{}
	select {
	case <-ctx.Done():
		return telemetryanalysis.AuthorizedSessionModel{}, ctx.Err()
	case <-stub.release:
	}
	return telemetryanalysis.AuthorizedSessionModel{Session: telemetryanalysis.HistoricalSession{ID: candidate.Locator}}, nil
}

func TestServiceImportsBoundedConcurrentBatchAndKeepsExactProgress(t *testing.T) {
	importer := &concurrentImporterStub{started: make(chan struct{}, 4), release: make(chan struct{})}
	service := NewService(ServiceOptions{
		StatePath: filepath.Join(t.TempDir(), "cold-start.json"),
		Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
			return []telemetryanalysis.Candidate{{Locator: "lmu://one"}, {Locator: "lmu://two"}, {Locator: "lmu://three"}, {Locator: "lmu://four"}}, nil
		},
		Importer:          importer,
		Store:             &sessionStoreStub{},
		ImportConcurrency: 3,
	})

	result := make(chan Progress, 1)
	errors := make(chan error, 1)
	go func() {
		progress, err := service.ImportNext(context.Background())
		result <- progress
		errors <- err
	}()
	for range 3 {
		select {
		case <-importer.started:
		case <-time.After(time.Second):
			t.Fatal("concurrent import batch did not start")
		}
	}
	close(importer.release)
	if err := <-errors; err != nil {
		t.Fatal(err)
	}
	first := <-result
	if first.Imported != 3 || first.Skipped != 0 || first.Total != 4 || first.Done {
		t.Fatalf("first progress = %+v", first)
	}
	importer.mu.Lock()
	maxActive := importer.maxActive
	importer.mu.Unlock()
	if maxActive != 3 {
		t.Fatalf("max concurrent imports = %d, want 3", maxActive)
	}

	second, err := service.ImportNext(context.Background())
	if err != nil || second.Imported != 4 || second.Total != 4 || !second.Done {
		t.Fatalf("second progress = %+v, error = %v", second, err)
	}
}

func TestServiceCancellationLeavesWholeBatchPendingAndResumeImportsIt(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "cold-start.json")
	importer := &concurrentImporterStub{started: make(chan struct{}, 4), release: make(chan struct{})}
	store := &sessionStoreStub{}
	discover := func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}, {Locator: "lmu://two"}, {Locator: "lmu://three"}, {Locator: "lmu://four"}}, nil
	}
	service := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: store})
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan Progress, 1)
	errCh := make(chan error, 1)
	go func() {
		progress, err := service.ImportNext(ctx)
		result <- progress
		errCh <- err
	}()
	for range 4 {
		select {
		case <-importer.started:
		case <-time.After(time.Second):
			t.Fatal("concurrent import batch did not start")
		}
	}
	cancel()
	if err := <-errCh; !errors.Is(err, context.Canceled) {
		t.Fatalf("ImportNext() error = %v, want context cancellation", err)
	}
	if progress := <-result; progress.Done || progress.Imported != 0 || progress.Skipped != 0 {
		t.Fatalf("cancelled progress = %+v", progress)
	}

	reopened := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: store})
	status, err := waitForStatus(reopened)
	if err != nil || status.Decision != DecisionPending || status.Imported != 0 || status.Skipped != 0 || len(status.Failures) != 0 {
		t.Fatalf("status after cancellation = %+v, error = %v", status, err)
	}
	close(importer.release)
	resumed, err := reopened.ImportNext(context.Background())
	if err != nil || !resumed.Done || resumed.Imported != 4 || resumed.Skipped != 0 || len(store.models) != 4 {
		t.Fatalf("resumed progress = %+v, models = %d, error = %v", resumed, len(store.models), err)
	}
}

func TestServiceShowsOnceImportsWithProgressAndPopulatesSessionSource(t *testing.T) {
	discover := func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}, {Locator: "lmu://two"}}, nil
	}
	importer := &importerStub{}
	store := &sessionStoreStub{}
	service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "cold-start.json"), Discover: discover, Importer: importer, Store: store, ImportConcurrency: 1})

	status, err := waitForStatus(service)
	if err != nil || !status.ShouldShow || status.Found != 2 || status.Decision != DecisionPending {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	first, err := service.ImportNext(context.Background())
	if err != nil || first.Imported != 1 || first.Total != 2 || first.Done {
		t.Fatalf("first=%+v err=%v", first, err)
	}
	second, err := service.ImportNext(context.Background())
	if err != nil || second.Imported != 2 || second.Total != 2 || !second.Done || len(store.models) != 2 {
		t.Fatalf("second=%+v models=%d err=%v", second, len(store.models), err)
	}
	reopened := NewService(ServiceOptions{StatePath: filepath.Join(filepath.Dir(service.options.StatePath), "cold-start.json"), Discover: discover, Importer: importer, Store: store})
	settled, err := reopened.Status(context.Background())
	if err != nil || settled.ShouldShow || settled.Decision != DecisionAccepted {
		t.Fatalf("settled=%+v err=%v", settled, err)
	}
}

func TestServiceContinuesAfterErrorsAndPanicsAndExplicitlyRetriesOnlyFailures(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "cold-start.json")
	discover := func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://bad"}, {Locator: "lmu://good"}, {Locator: "lmu://panic"}}, nil
	}
	importer := &selectiveImporterStub{
		calls:  map[string]int{},
		fail:   map[string]error{"lmu://bad": errors.New("invalid database")},
		panics: map[string]any{"lmu://panic": "invalid lap"},
	}
	store := &sessionStoreStub{}
	service := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: store})

	for {
		progress, err := service.ImportNext(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if progress.Done {
			if progress.Imported != 1 || progress.Skipped != 2 || len(progress.Failures) != 2 {
				t.Fatalf("progress=%+v", progress)
			}
			break
		}
	}
	reopened := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: store})
	status, err := reopened.Status(context.Background())
	if err != nil || !status.ShouldShow || status.Imported != 1 || status.Skipped != 2 || status.Decision != DecisionAccepted {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	if importer.calls["lmu://good"] != 1 || importer.calls["lmu://bad"] != 1 || importer.calls["lmu://panic"] != 1 {
		t.Fatalf("calls=%v", importer.calls)
	}
	if len(status.Failures) != 2 || status.Failures[0].Locator != "lmu://bad" || status.Failures[0].Reason != "invalid database" {
		t.Fatalf("failures=%+v", status.Failures)
	}

	delete(importer.fail, "lmu://bad")
	delete(importer.panics, "lmu://panic")
	unchanged, err := reopened.ImportNext(context.Background())
	if err != nil || !unchanged.Done || unchanged.Imported != 1 || unchanged.Skipped != 2 {
		t.Fatalf("implicit retry progress=%+v err=%v", unchanged, err)
	}
	if importer.calls["lmu://bad"] != 1 || importer.calls["lmu://panic"] != 1 {
		t.Fatalf("ImportNext retried failures without explicit request: calls=%v", importer.calls)
	}
	retrying, err := reopened.RetryFailures(context.Background())
	if err != nil || retrying.Done || retrying.Imported != 1 || retrying.Skipped != 0 {
		t.Fatalf("RetryFailures() progress=%+v err=%v", retrying, err)
	}
	for {
		progress, err := reopened.ImportNext(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if progress.Done {
			if progress.Imported != 3 || progress.Skipped != 0 {
				t.Fatalf("retried progress=%+v", progress)
			}
			break
		}
	}
	if importer.calls["lmu://good"] != 1 || importer.calls["lmu://bad"] != 2 || importer.calls["lmu://panic"] != 2 {
		t.Fatalf("retry calls=%v", importer.calls)
	}
}

func TestServiceDoesNotPersistUncatalogableSessionAndReportsRealCause(t *testing.T) {
	const locator = "lmu://uncatalogable"
	analysisErr := errors.New("analyze LMU lap validity: invalid lap validity input: no lap event or lap distance reset")
	importer := &selectiveImporterStub{
		calls: map[string]int{},
		fail:  map[string]error{locator: analysisErr},
	}
	store := &sessionStoreStub{}
	service := NewService(ServiceOptions{
		StatePath: filepath.Join(t.TempDir(), "cold-start.json"),
		Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
			return []telemetryanalysis.Candidate{{Locator: locator}}, nil
		},
		Importer: importer,
		Store:    store,
	})

	progress, err := service.ImportNext(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if progress.Imported != 0 || progress.Skipped != 1 || !progress.Done || len(store.models) != 0 {
		t.Fatalf("progress = %+v, models = %+v", progress, store.models)
	}
	if len(progress.Failures) != 1 || progress.Failures[0].Reason != analysisErr.Error() || progress.Failures[0].Reason == string(telemetryanalysis.UnusableReasonNoCompletedLap) {
		t.Fatalf("failures = %+v", progress.Failures)
	}
}

func TestServiceReopensPendingStateAndContinuesAfterImportedLocator(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "cold-start.json")
	discover := func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}, {Locator: "lmu://two"}}, nil
	}
	importer := &importerStub{}
	store := &sessionStoreStub{}
	firstService := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: store, ImportConcurrency: 1})
	first, err := firstService.ImportNext(context.Background())
	if err != nil || first.Imported != 1 || first.Done {
		t.Fatalf("first=%+v err=%v", first, err)
	}

	reopened := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: store})
	status, err := waitForStatus(reopened)
	if err != nil || !status.ShouldShow || status.Found != 2 || status.Imported != 1 || status.Decision != DecisionPending {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	second, err := reopened.ImportNext(context.Background())
	if err != nil || second.Imported != 2 || !second.Done || importer.calls != 2 || len(store.models) != 2 {
		t.Fatalf("second=%+v calls=%d models=%d err=%v", second, importer.calls, len(store.models), err)
	}
}

func TestServiceStatusDiscoversInBackgroundWithoutInventingAnEmptyResult(t *testing.T) {
	release := make(chan struct{})
	service := NewService(ServiceOptions{
		StatePath: filepath.Join(t.TempDir(), "cold-start.json"),
		Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
			<-release
			return []telemetryanalysis.Candidate{{Locator: "lmu://one"}}, nil
		},
		Importer: &importerStub{}, Store: &sessionStoreStub{},
	})

	checking, err := service.Status(context.Background())
	if err != nil || !checking.ShouldShow || !checking.Checking || checking.Found != 0 {
		t.Fatalf("checking=%+v err=%v", checking, err)
	}
	close(release)
	ready, err := waitForStatus(service)
	if err != nil || ready.Checking || !ready.ShouldShow || ready.Found != 1 {
		t.Fatalf("ready=%+v err=%v", ready, err)
	}
}

func waitForStatus(service *Service) (Status, error) {
	deadline := time.Now().Add(time.Second)
	for {
		status, err := service.Status(context.Background())
		if err != nil || !status.Checking {
			return status, err
		}
		if time.Now().After(deadline) {
			return status, errors.New("cold start status remained checking")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestServicePersistsRejectionWithoutImporting(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "cold-start.json")
	importer := &importerStub{}
	discover := func(context.Context) ([]telemetryanalysis.Candidate, error) {
		return []telemetryanalysis.Candidate{{Locator: "lmu://one"}}, nil
	}
	service := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: &sessionStoreStub{}})
	if err := service.Reject(context.Background()); err != nil {
		t.Fatal(err)
	}
	reopened := NewService(ServiceOptions{StatePath: statePath, Discover: discover, Importer: importer, Store: &sessionStoreStub{}})
	status, err := reopened.Status(context.Background())
	if err != nil || status.ShouldShow || status.Decision != DecisionRejected || importer.calls != 0 {
		t.Fatalf("status=%+v calls=%d err=%v", status, importer.calls, err)
	}
}

func TestServiceImportProgressesWhenStagingRootIsMissing(t *testing.T) {
	sourceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(sourceRoot, "fixture.duckdb"), []byte("synthetic duckdb fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	candidates, err := DiscoverStandardLMU(context.Background(), sourceRoot, time.Millisecond)
	if err != nil || len(candidates) != 1 {
		t.Fatalf("DiscoverStandardLMU() candidates=%d error=%v", len(candidates), err)
	}
	stagingRoot := filepath.Join(t.TempDir(), "missing", "telemetry-staging")
	service := NewService(ServiceOptions{
		StatePath: filepath.Join(t.TempDir(), "cold-start.json"),
		Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
			return candidates, nil
		},
		Importer: stagingFixtureImporter{root: stagingRoot},
		Store:    &sessionStoreStub{},
	})

	progress, err := service.ImportNext(context.Background())
	if err != nil || progress.Imported != 1 || progress.Total != 1 || !progress.Done {
		t.Fatalf("ImportNext() progress=%+v error=%v", progress, err)
	}
	if info, err := os.Stat(stagingRoot); err != nil || !info.IsDir() {
		t.Fatalf("staging root was not created: info=%v error=%v", info, err)
	}
}
