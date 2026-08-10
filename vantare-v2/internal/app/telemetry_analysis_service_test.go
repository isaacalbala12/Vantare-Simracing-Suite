package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type telemetryAnalysisAuthorizerStub struct{ allowed bool }

func (stub telemetryAnalysisAuthorizerStub) AllowsTelemetryAnalysis() bool { return stub.allowed }

type telemetryAnalysisReaderStub struct {
	mu             sync.Mutex
	evidence       telemetryanalysis.HistoricalArtifactEvidence
	catalog        telemetryanalysis.LMUDuckDBCatalog
	rows           []telemetryanalysis.LMUDuckDBRow
	handshakeErr   error
	catalogErr     error
	readErr        error
	waitForContext bool
	catalogStarted chan struct{}
	readStarted    chan struct{}
	closed         bool
}

func (stub *telemetryAnalysisReaderStub) Handshake(context.Context) error { return stub.handshakeErr }

func (stub *telemetryAnalysisReaderStub) ArtifactEvidence(context.Context) (telemetryanalysis.HistoricalArtifactEvidence, error) {
	return stub.evidence, nil
}

func (stub *telemetryAnalysisReaderStub) Catalog(ctx context.Context) (telemetryanalysis.LMUDuckDBCatalog, error) {
	if stub.waitForContext {
		if stub.catalogStarted != nil {
			close(stub.catalogStarted)
		}
		<-ctx.Done()
		return telemetryanalysis.LMUDuckDBCatalog{}, ctx.Err()
	}
	return stub.catalog, stub.catalogErr
}

func (stub *telemetryAnalysisReaderStub) ReadRows(ctx context.Context, _ string, start int64, limit int) ([]telemetryanalysis.LMUDuckDBRow, error) {
	if stub.waitForContext {
		if stub.readStarted != nil {
			close(stub.readStarted)
		}
		<-ctx.Done()
		return nil, ctx.Err()
	}
	if stub.readErr != nil {
		return nil, stub.readErr
	}
	if start >= int64(len(stub.rows)) {
		return nil, nil
	}
	end := int(start) + limit
	if end > len(stub.rows) {
		end = len(stub.rows)
	}
	return append([]telemetryanalysis.LMUDuckDBRow(nil), stub.rows[start:end]...), nil
}

func (stub *telemetryAnalysisReaderStub) Close() error {
	stub.mu.Lock()
	stub.closed = true
	stub.mu.Unlock()
	return nil
}

func (stub *telemetryAnalysisReaderStub) isClosed() bool {
	stub.mu.Lock()
	defer stub.mu.Unlock()
	return stub.closed
}

func telemetryAnalysisTestService(t *testing.T, allowed bool) (*TelemetryAnalysisService, string, *time.Time) {
	t.Helper()
	root := t.TempDir()
	fixturePath := filepath.Join(root, "private-driver-session.duckdb")
	if err := os.WriteFile(fixturePath, []byte("synthetic telemetry analysis fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	applicationDirectory := t.TempDir()
	stagingRoot := filepath.Join(t.TempDir(), "staging")
	currentTime := time.Date(2026, 8, 11, 10, 0, 0, 0, time.UTC)
	svc, err := NewTelemetryAnalysisService(TelemetryAnalysisConfig{
		LMURoots:             []string{root},
		ApplicationDirectory: applicationDirectory,
		StagingRoot:          stagingRoot,
		StabilityWindow:      2 * time.Second,
		MaxCandidates:        8,
		MaxSourceBytes:       1024,
		MaxPageRows:          4,
	}, telemetryAnalysisAuthorizerStub{allowed: allowed})
	if err != nil {
		t.Fatalf("NewTelemetryAnalysisService() error = %v", err)
	}
	svc.now = func() time.Time { return currentTime }
	return svc, fixturePath, &currentTime
}

func telemetryAnalysisReadyCandidate(t *testing.T, svc *TelemetryAnalysisService, now *time.Time) TelemetryAnalysisCandidate {
	t.Helper()
	candidates, err := svc.Discover(context.Background())
	if err != nil || len(candidates) != 1 {
		t.Fatalf("Discover() = %#v, %v", candidates, err)
	}
	*now = now.Add(2 * time.Second)
	candidates, err = svc.Discover(context.Background())
	if err != nil || len(candidates) != 1 || candidates[0].State != string(telemetryanalysis.StateReady) {
		t.Fatalf("stable Discover() = %#v, %v", candidates, err)
	}
	return candidates[0]
}

func telemetryAnalysisSuccessfulReader(artifact telemetryanalysis.AuthorizedHistoricalArtifact) *telemetryAnalysisReaderStub {
	return &telemetryAnalysisReaderStub{
		evidence: artifact.Evidence(),
		catalog: telemetryanalysis.LMUDuckDBCatalog{Continuous: []telemetryanalysis.LMUDuckDBChannel{{
			Name: "Speed", FrequencyHz: 100, Unit: "km/h",
			Columns: []telemetryanalysis.LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
		}}},
		rows: []telemetryanalysis.LMUDuckDBRow{
			{Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarNumber, Number: 0}}},
			{Values: []telemetryanalysis.LMUDuckDBValue{{Kind: telemetryanalysis.ScalarNumber, Number: 123.5}}},
		},
	}
}

func TestTelemetryAnalysisInspectsAndPagesOnlyAnOpaqueDiscoveredCandidate(t *testing.T) {
	svc, privatePath, now := telemetryAnalysisTestService(t, true)
	defer svc.Close()
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	var reader *telemetryAnalysisReaderStub
	var stagedDirectory string
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		reader = telemetryAnalysisSuccessfulReader(artifact)
		stagedDirectory = staged.Directory()
		return reader, nil
	}

	encodedCandidate, err := json.Marshal(candidate)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encodedCandidate), privatePath) || strings.Contains(string(encodedCandidate), filepath.Base(privatePath)) {
		t.Fatalf("candidate leaked the private path: %s", encodedCandidate)
	}
	opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil || opened.SessionID == "" || len(opened.Session.Channels) != 1 {
		t.Fatalf("Open() = %#v, %v", opened, err)
	}
	if opened.Session.Provenance.Source.Locator != candidate.ID {
		t.Fatalf("session locator = %q, candidate = %q", opened.Session.Provenance.Source.Locator, candidate.ID)
	}
	page, err := svc.ReadPage(context.Background(), TelemetryAnalysisPageRequest{
		SessionID: opened.SessionID, ChannelID: opened.Session.Channels[0].ID, Start: 0, Limit: 2,
	})
	if err != nil || len(page.Samples) != 2 || page.Samples[0].Values[0].Scalar.Number != 0 ||
		page.Samples[1].Values[0].Scalar.Number != 123.5 {
		t.Fatalf("ReadPage() = %#v, %v", page, err)
	}
	if err := svc.CloseSession(opened.SessionID); err != nil {
		t.Fatalf("CloseSession() error = %v", err)
	}
	if !reader.isClosed() {
		t.Fatal("reader was not closed")
	}
	if _, err := os.Stat(stagedDirectory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("staging directory still exists: %v", err)
	}
}

func TestTelemetryAnalysisRejectsMissingAuthorityApprovalAndArbitraryPathsBeforeReading(t *testing.T) {
	tests := []struct {
		name      string
		allowed   bool
		request   func(string, string) TelemetryAnalysisOpenRequest
		wantErr   error
		needReady bool
	}{
		{name: "unauthorized discovery", allowed: false, wantErr: ErrTelemetryAnalysisUnauthorized},
		{name: "approval is explicit", allowed: true, needReady: true, request: func(id, _ string) TelemetryAnalysisOpenRequest { return TelemetryAnalysisOpenRequest{CandidateID: id} }, wantErr: ErrTelemetryAnalysisApprovalRequired},
		{name: "filesystem path is not a candidate id", allowed: true, needReady: true, request: func(_, path string) TelemetryAnalysisOpenRequest {
			return TelemetryAnalysisOpenRequest{CandidateID: path, UserApproved: true}
		}, wantErr: ErrTelemetryAnalysisCandidateUnknown},
		{name: "unknown opaque id", allowed: true, needReady: true, request: func(_, _ string) TelemetryAnalysisOpenRequest {
			return TelemetryAnalysisOpenRequest{CandidateID: "lmu://0000000000000000", UserApproved: true}
		}, wantErr: ErrTelemetryAnalysisCandidateUnknown},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			svc, privatePath, now := telemetryAnalysisTestService(t, test.allowed)
			defer svc.Close()
			if !test.allowed {
				if _, err := svc.Discover(context.Background()); !errors.Is(err, test.wantErr) {
					t.Fatalf("Discover() error = %v, want %v", err, test.wantErr)
				}
				return
			}
			candidate := telemetryAnalysisReadyCandidate(t, svc, now)
			factoryCalls := 0
			svc.runtimeReady = true
			svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
				factoryCalls++
				return telemetryAnalysisSuccessfulReader(artifact), nil
			}
			_, err := svc.Open(context.Background(), test.request(candidate.ID, privatePath))
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("Open() error = %v, want %v", err, test.wantErr)
			}
			if factoryCalls != 0 {
				t.Fatalf("reader factory called %d times", factoryCalls)
			}
		})
	}
}

func TestTelemetryAnalysisRevalidatesStabilityWALAndSourceChanges(t *testing.T) {
	t.Run("WAL blocks opening", func(t *testing.T) {
		svc, privatePath, _ := telemetryAnalysisTestService(t, true)
		defer svc.Close()
		if err := os.WriteFile(privatePath+".wal", []byte("active"), 0o600); err != nil {
			t.Fatal(err)
		}
		candidates, err := svc.Discover(context.Background())
		if err != nil || len(candidates) != 1 || candidates[0].State != string(telemetryanalysis.StateActive) {
			t.Fatalf("Discover() = %#v, %v", candidates, err)
		}
		_, err = svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidates[0].ID, UserApproved: true})
		if !errors.Is(err, ErrTelemetryAnalysisNotReady) {
			t.Fatalf("Open() error = %v, want not ready", err)
		}
	})

	t.Run("changed file restarts the gate", func(t *testing.T) {
		svc, privatePath, now := telemetryAnalysisTestService(t, true)
		defer svc.Close()
		candidates, err := svc.Discover(context.Background())
		if err != nil || len(candidates) != 1 {
			t.Fatal(err)
		}
		if err := os.WriteFile(privatePath, []byte("changed synthetic telemetry fixture"), 0o600); err != nil {
			t.Fatal(err)
		}
		*now = now.Add(3 * time.Second)
		_, err = svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidates[0].ID, UserApproved: true})
		if !errors.Is(err, ErrTelemetryAnalysisNotReady) {
			t.Fatalf("Open() error = %v, want not ready", err)
		}
	})
}

func TestTelemetryAnalysisRuntimeAbsenceDegradesOnlyTheModule(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	defer svc.Close()
	status := svc.Status()
	if status.Available || status.Code != "runtime_unavailable" {
		t.Fatalf("Status() = %#v", status)
	}
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	_, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if !errors.Is(err, ErrTelemetryAnalysisRuntimeUnavailable) {
		t.Fatalf("Open() error = %v, want runtime unavailable", err)
	}
}

func TestTelemetryAnalysisCleansStagingAndReaderOnOpenErrorCancellationAndShutdown(t *testing.T) {
	tests := []struct {
		name          string
		configure     func(*telemetryAnalysisReaderStub)
		context       func() (context.Context, context.CancelFunc)
		wantCancelled bool
	}{
		{name: "handshake error", configure: func(reader *telemetryAnalysisReaderStub) { reader.handshakeErr = errors.New("private runtime path") }},
		{name: "inspect error", configure: func(reader *telemetryAnalysisReaderStub) { reader.catalogErr = errors.New("private source path") }},
		{name: "cancelled inspect", configure: func(reader *telemetryAnalysisReaderStub) { reader.waitForContext = true }, context: func() (context.Context, context.CancelFunc) { return context.WithCancel(context.Background()) }, wantCancelled: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			svc, _, now := telemetryAnalysisTestService(t, true)
			defer svc.Close()
			candidate := telemetryAnalysisReadyCandidate(t, svc, now)
			var reader *telemetryAnalysisReaderStub
			var stagedDirectory string
			svc.runtimeReady = true
			svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
				reader = telemetryAnalysisSuccessfulReader(artifact)
				test.configure(reader)
				stagedDirectory = staged.Directory()
				return reader, nil
			}
			ctx := context.Background()
			var cancel context.CancelFunc
			if test.context != nil {
				ctx, cancel = test.context()
				cancel()
			}
			_, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
			if err == nil || strings.Contains(err.Error(), "private") {
				t.Fatalf("Open() error was not sanitized: %v", err)
			}
			if test.wantCancelled && !errors.Is(err, context.Canceled) {
				t.Fatalf("Open() error = %v, want cancellation", err)
			}
			if reader != nil && !reader.isClosed() {
				t.Fatal("reader was not closed after failed open")
			}
			if stagedDirectory != "" {
				if _, statErr := os.Stat(stagedDirectory); !errors.Is(statErr, os.ErrNotExist) {
					t.Fatalf("staging directory still exists: %v", statErr)
				}
			}
		})
	}

	t.Run("shutdown closes successful sessions", func(t *testing.T) {
		svc, _, now := telemetryAnalysisTestService(t, true)
		candidate := telemetryAnalysisReadyCandidate(t, svc, now)
		var reader *telemetryAnalysisReaderStub
		var stagedDirectory string
		svc.runtimeReady = true
		svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
			reader = telemetryAnalysisSuccessfulReader(artifact)
			stagedDirectory = staged.Directory()
			return reader, nil
		}
		if _, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true}); err != nil {
			t.Fatal(err)
		}
		if err := svc.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
		if !reader.isClosed() {
			t.Fatal("reader remained open after shutdown")
		}
		if _, err := os.Stat(stagedDirectory); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("staging directory still exists after shutdown: %v", err)
		}
		if _, err := svc.Discover(context.Background()); !errors.Is(err, ErrTelemetryAnalysisClosed) {
			t.Fatalf("Discover() after Close error = %v", err)
		}
	})
}

func TestTelemetryAnalysisCancellationDuringInspectCleansTransientResources(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	defer svc.Close()
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	started := make(chan struct{})
	readerReady := make(chan *telemetryAnalysisReaderStub, 1)
	stagedDirectory := make(chan string, 1)
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		reader := telemetryAnalysisSuccessfulReader(artifact)
		reader.waitForContext = true
		reader.catalogStarted = started
		readerReady <- reader
		stagedDirectory <- staged.Directory()
		return reader, nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
		result <- err
	}()
	reader := <-readerReady
	directory := <-stagedDirectory
	<-started
	cancel()
	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Fatalf("Open() error = %v, want context cancellation", err)
	}
	if !reader.isClosed() {
		t.Fatal("reader remained open after cancellation")
	}
	if _, err := os.Stat(directory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("staging directory remained after cancellation: %v", err)
	}
}

func TestTelemetryAnalysisCancellationDuringPageClosesTheSession(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	defer svc.Close()
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	var reader *telemetryAnalysisReaderStub
	var stagedDirectory string
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		reader = telemetryAnalysisSuccessfulReader(artifact)
		stagedDirectory = staged.Directory()
		return reader, nil
	}
	opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	reader.waitForContext = true
	reader.readStarted = make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, err := svc.ReadPage(ctx, TelemetryAnalysisPageRequest{
			SessionID: opened.SessionID, ChannelID: opened.Session.Channels[0].ID, Start: 0, Limit: 1,
		})
		result <- err
	}()
	<-reader.readStarted
	cancel()
	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Fatalf("ReadPage() error = %v, want context cancellation", err)
	}
	if !reader.isClosed() {
		t.Fatal("reader remained open after cancelled page")
	}
	if _, err := os.Stat(stagedDirectory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("staging directory remained after cancelled page: %v", err)
	}
	if err := svc.CloseSession(opened.SessionID); !errors.Is(err, ErrTelemetryAnalysisSessionUnknown) {
		t.Fatalf("cancelled session remained registered: %v", err)
	}
}

func TestTelemetryAnalysisEnforcesBackendOwnedPageLimit(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	defer svc.Close()
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		return telemetryAnalysisSuccessfulReader(artifact), nil
	}
	opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.ReadPage(context.Background(), TelemetryAnalysisPageRequest{
		SessionID: opened.SessionID, ChannelID: opened.Session.Channels[0].ID, Start: 0, Limit: 5,
	})
	if !errors.Is(err, ErrTelemetryAnalysisInvalidRequest) {
		t.Fatalf("ReadPage() error = %v, want invalid request", err)
	}
}

func TestTelemetryAnalysisBoundsConcurrentOpenSessions(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	defer svc.Close()
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	started := make(chan struct{}, maxTelemetryAnalysisOpenSessions)
	release := make(chan struct{})
	var factoryCalls atomic.Int32
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, _ telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		call := factoryCalls.Add(1)
		if call <= maxTelemetryAnalysisOpenSessions {
			started <- struct{}{}
			<-release
		}
		return telemetryAnalysisSuccessfulReader(artifact), nil
	}
	results := make(chan TelemetryAnalysisOpenedSession, maxTelemetryAnalysisOpenSessions)
	errorsSeen := make(chan error, maxTelemetryAnalysisOpenSessions)
	for range maxTelemetryAnalysisOpenSessions {
		go func() {
			opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
			results <- opened
			errorsSeen <- err
		}()
	}
	for range maxTelemetryAnalysisOpenSessions {
		<-started
	}
	unexpected, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if !errors.Is(err, ErrTelemetryAnalysisBusy) {
		if err == nil {
			_ = svc.CloseSession(unexpected.SessionID)
		}
		close(release)
		for range maxTelemetryAnalysisOpenSessions {
			<-results
			<-errorsSeen
		}
		t.Fatalf("fifth concurrent Open() error = %v, want busy", err)
	}
	close(release)
	for range maxTelemetryAnalysisOpenSessions {
		opened := <-results
		if err := <-errorsSeen; err != nil {
			t.Fatalf("bounded Open() error = %v", err)
		}
		if err := svc.CloseSession(opened.SessionID); err != nil {
			t.Fatalf("CloseSession() error = %v", err)
		}
	}
}

func failTelemetryAnalysisStagingCleanupOnce(service *TelemetryAnalysisService) *atomic.Int32 {
	var attempts atomic.Int32
	service.cleanupStaged = func(staged *telemetryanalysis.StagedHistoricalArtifact) error {
		if attempts.Add(1) == 1 {
			return errors.New("transient cleanup failure at secret-source-path")
		}
		return staged.Cleanup()
	}
	return &attempts
}

func TestTelemetryAnalysisFailedOpenRetainsStagingForShutdownRetry(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	attempts := failTelemetryAnalysisStagingCleanupOnce(svc)
	var stagedDirectory string
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		stagedDirectory = staged.Directory()
		reader := telemetryAnalysisSuccessfulReader(artifact)
		reader.handshakeErr = errors.New("runtime failure at secret-source-path")
		return reader, nil
	}

	_, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if !errors.Is(err, ErrTelemetryAnalysisCleanup) || strings.Contains(err.Error(), "secret-source-path") {
		t.Fatalf("Open() error = %v, want sanitized cleanup error", err)
	}
	if _, err := os.Stat(stagedDirectory); err != nil {
		t.Fatalf("failed staging was not retained for retry: %v", err)
	}
	if err := svc.Close(); err != nil {
		t.Fatalf("Close() retry error = %v", err)
	}
	if attempts.Load() != 2 {
		t.Fatalf("staging cleanup attempts = %d, want 2", attempts.Load())
	}
	if _, err := os.Stat(stagedDirectory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("staging remained after shutdown retry: %v", err)
	}
}

func TestTelemetryAnalysisCancelledOpenRetainsStagingForShutdownRetry(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	attempts := failTelemetryAnalysisStagingCleanupOnce(svc)
	catalogStarted := make(chan struct{})
	var stagedDirectory string
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		stagedDirectory = staged.Directory()
		reader := telemetryAnalysisSuccessfulReader(artifact)
		reader.waitForContext = true
		reader.catalogStarted = catalogStarted
		return reader, nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, err := svc.Open(ctx, TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
		result <- err
	}()
	<-catalogStarted
	cancel()
	if err := <-result; !errors.Is(err, ErrTelemetryAnalysisCleanup) || strings.Contains(err.Error(), "secret-source-path") {
		t.Fatalf("cancelled Open() error = %v, want sanitized cleanup error", err)
	}
	if _, err := os.Stat(stagedDirectory); err != nil {
		t.Fatalf("cancelled staging was not retained for retry: %v", err)
	}
	if err := svc.Close(); err != nil {
		t.Fatalf("Close() retry error = %v", err)
	}
	if attempts.Load() != 2 {
		t.Fatalf("staging cleanup attempts = %d, want 2", attempts.Load())
	}
	if _, err := os.Stat(stagedDirectory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("cancelled staging remained after shutdown retry: %v", err)
	}
}

func TestTelemetryAnalysisReadFailureKeepsSessionForCloseSessionRetry(t *testing.T) {
	svc, _, now := telemetryAnalysisTestService(t, true)
	defer svc.Close()
	candidate := telemetryAnalysisReadyCandidate(t, svc, now)
	var reader *telemetryAnalysisReaderStub
	var stagedDirectory string
	svc.runtimeReady = true
	svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
		reader = telemetryAnalysisSuccessfulReader(artifact)
		stagedDirectory = staged.Directory()
		return reader, nil
	}
	opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
	if err != nil {
		t.Fatal(err)
	}
	attempts := failTelemetryAnalysisStagingCleanupOnce(svc)
	reader.readErr = errors.New("read failed at secret-source-path")
	_, err = svc.ReadPage(context.Background(), TelemetryAnalysisPageRequest{
		SessionID: opened.SessionID, ChannelID: opened.Session.Channels[0].ID, Start: 0, Limit: 1,
	})
	if !errors.Is(err, ErrTelemetryAnalysisCleanup) || strings.Contains(err.Error(), "secret-source-path") {
		t.Fatalf("ReadPage() error = %v, want sanitized cleanup error", err)
	}
	if _, err := os.Stat(stagedDirectory); err != nil {
		t.Fatalf("failed page staging was not retained: %v", err)
	}
	if err := svc.CloseSession(opened.SessionID); err != nil {
		t.Fatalf("CloseSession() retry error = %v", err)
	}
	if attempts.Load() != 2 {
		t.Fatalf("staging cleanup attempts = %d, want 2", attempts.Load())
	}
	if _, err := os.Stat(stagedDirectory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("staging remained after CloseSession retry: %v", err)
	}
}

func TestTelemetryAnalysisCloseAndCloseSessionRetryTransientCleanup(t *testing.T) {
	tests := []struct {
		name  string
		close func(*TelemetryAnalysisService, string) error
	}{
		{name: "CloseSession", close: func(service *TelemetryAnalysisService, id string) error { return service.CloseSession(id) }},
		{name: "Close", close: func(service *TelemetryAnalysisService, _ string) error { return service.Close() }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			svc, _, now := telemetryAnalysisTestService(t, true)
			candidate := telemetryAnalysisReadyCandidate(t, svc, now)
			var stagedDirectory string
			svc.runtimeReady = true
			svc.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
				stagedDirectory = staged.Directory()
				return telemetryAnalysisSuccessfulReader(artifact), nil
			}
			opened, err := svc.Open(context.Background(), TelemetryAnalysisOpenRequest{CandidateID: candidate.ID, UserApproved: true})
			if err != nil {
				t.Fatal(err)
			}
			attempts := failTelemetryAnalysisStagingCleanupOnce(svc)
			if err := test.close(svc, opened.SessionID); !errors.Is(err, ErrTelemetryAnalysisCleanup) {
				t.Fatalf("first close error = %v, want cleanup", err)
			}
			if _, err := os.Stat(stagedDirectory); err != nil {
				t.Fatalf("staging was not retained: %v", err)
			}
			if err := test.close(svc, opened.SessionID); err != nil {
				t.Fatalf("second close error = %v", err)
			}
			if attempts.Load() != 2 {
				t.Fatalf("staging cleanup attempts = %d, want 2", attempts.Load())
			}
			if _, err := os.Stat(stagedDirectory); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("staging remained after second close: %v", err)
			}
			_ = svc.Close()
		})
	}
}
