//go:build duckdb_integration && windows

package duckdbadapter

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

func TestRealHelperParserEndToEnd(t *testing.T) {
	reader, parser, staged := integrationParser(t)
	defer staged.Cleanup()
	defer reader.Close()
	if err := reader.Handshake(context.Background()); err != nil {
		t.Fatalf("Handshake() error = %v", err)
	}
	session, err := parser.Inspect(context.Background())
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	var quotedChannel string
	for _, channel := range session.Channels {
		if channel.SourceName == `quote"table` {
			quotedChannel = channel.ID
		}
	}
	if quotedChannel == "" {
		t.Fatalf("quoted channel not found: %#v", session.Channels)
	}
	page, err := parser.ReadPage(context.Background(), quotedChannel, 0, 2)
	if err != nil {
		t.Fatalf("ReadPage() error = %v", err)
	}
	if len(page.Samples) != 2 || page.Samples[0].Values[0].Scalar.Integer != 0 ||
		page.Samples[0].Values[1].Scalar.Boolean || page.Samples[0].Values[2].Scalar.Text != "" ||
		page.Samples[0].Values[3].Present {
		t.Fatalf("typed page = %#v", page)
	}
}

func TestRealHelperParserReadsSecondFullEventPage(t *testing.T) {
	reader, parser, staged := integrationParser(t)
	defer staged.Cleanup()
	defer reader.Close()
	if err := reader.Handshake(context.Background()); err != nil {
		t.Fatalf("Handshake() error = %v", err)
	}
	session, err := parser.Inspect(context.Background())
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	var eventChannel string
	for _, channel := range session.Channels {
		if channel.SourceName == "long_event" {
			eventChannel = channel.ID
			break
		}
	}
	if eventChannel == "" {
		t.Fatal("long_event channel with at least 16,385 rows not found")
	}
	first, err := parser.ReadPage(context.Background(), eventChannel, 0, telemetryanalysis.MaxLMUDuckDBPageRows)
	if err != nil {
		t.Fatalf("first ReadPage() error = %v", err)
	}
	if len(first.Samples) != telemetryanalysis.MaxLMUDuckDBPageRows {
		t.Fatalf("first page rows = %d, want %d", len(first.Samples), telemetryanalysis.MaxLMUDuckDBPageRows)
	}
	second, err := parser.ReadPage(context.Background(), eventChannel, telemetryanalysis.MaxLMUDuckDBPageRows, telemetryanalysis.MaxLMUDuckDBPageRows)
	if err != nil {
		t.Fatalf("second ReadPage() error = %v", err)
	}
	if len(second.Samples) == 0 || second.Samples[0].Index != telemetryanalysis.MaxLMUDuckDBPageRows {
		t.Fatalf("second page = %#v, want sample at index %d", second, telemetryanalysis.MaxLMUDuckDBPageRows)
	}
}

func TestRealHelperCancellationKillsProcessAndAllowsRetry(t *testing.T) {
	reader, _, staged := integrationParser(t)
	defer staged.Cleanup()
	defer reader.Close()
	if err := reader.Handshake(context.Background()); err != nil {
		t.Fatalf("Handshake() error = %v", err)
	}
	pid := reader.session.process.PID()
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	_, err := reader.ReadRows(ctx, "slow_event", 0, 16_384)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("slow read error = %v, want deadline", err)
	}
	if exited, err := processExited(pid); err != nil || !exited {
		t.Fatalf("cancelled telemetry reader pid %d exited = %v, error = %v", pid, exited, err)
	}
	rows, err := reader.ReadRows(context.Background(), "speed", 0, 2)
	if err != nil || len(rows) != 2 {
		t.Fatalf("retry rows = %d, error = %v", len(rows), err)
	}
}

func TestRealHelperCloseTerminatesOwnedProcess(t *testing.T) {
	reader, _, staged := integrationParser(t)
	defer staged.Cleanup()
	if err := reader.Handshake(context.Background()); err != nil {
		t.Fatalf("Handshake() error = %v", err)
	}
	pid := reader.session.process.PID()
	if err := reader.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if exited, err := processExited(pid); err != nil || !exited {
		t.Fatalf("closed telemetry reader pid %d exited = %v, error = %v", pid, exited, err)
	}
}

func TestRealHelperFiftyPagesStayWithinMeasuredBudget(t *testing.T) {
	reader, _, staged := integrationParser(t)
	defer staged.Cleanup()
	defer reader.Close()
	const (
		pageSize      = 16_384
		syntheticRows = 720_000
	)
	started := time.Now()
	for page := 0; page < 50; page++ {
		start := (page * pageSize) % (syntheticRows - pageSize)
		rows, err := reader.ReadRows(context.Background(), "speed", int64(start), pageSize)
		if err != nil || len(rows) != pageSize {
			t.Fatalf("page %d rows = %d, error = %v", page, len(rows), err)
		}
	}
	elapsed := time.Since(started)
	average := elapsed / 50
	t.Logf("50 product pages: total=%s average=%s", elapsed, average)
	// TA-03B observed 20.72-23.84 ms/page in-process. The production
	// boundary adds process creation, manifest verification and IPC; two times
	// the upper observation is the accepted non-significant envelope.
	if average > 2*23_840*time.Microsecond {
		t.Fatalf("average page latency %s exceeds 2x TA-03B upper observation", average)
	}
}

func integrationParser(t *testing.T) (*Reader, *telemetryanalysis.LMUDuckDBParser, telemetryanalysis.StagedHistoricalArtifact) {
	t.Helper()
	runtimeDirectory := os.Getenv("VANTARE_DUCKDB_RUNTIME")
	fixturePath := os.Getenv("VANTARE_DUCKDB_FIXTURE")
	if !filepath.IsAbs(runtimeDirectory) || !filepath.IsAbs(fixturePath) {
		t.Fatal("VANTARE_DUCKDB_RUNTIME and VANTARE_DUCKDB_FIXTURE must be absolute")
	}
	directory := filepath.Dir(fixturePath)
	candidates, err := telemetryanalysis.Discover(context.Background(), telemetryanalysis.OSMetadataSource{}, telemetryanalysis.SourceRoot{
		Kind: telemetryanalysis.SourceLMU, Root: directory, Format: telemetryanalysis.LMUDuckDBParserID, Extensions: []string{".duckdb"},
	}, 8)
	if err != nil || len(candidates) != 1 {
		t.Fatalf("Discover() candidates = %d, error = %v", len(candidates), err)
	}
	tracker, err := telemetryanalysis.NewStabilityTracker(time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	observedAt := time.Unix(100, 0).UTC()
	observation := telemetryanalysis.Observation{
		ObservedAt: observedAt, Exists: true, Compatible: true, Size: candidates[0].Size, ModTime: candidates[0].ModTime,
	}
	candidate := tracker.Assess(candidates[0], observation)
	observation.ObservedAt = observedAt.Add(time.Millisecond)
	candidate = tracker.Assess(candidate, observation)
	artifact, err := telemetryanalysis.BuildAuthorizedHistoricalArtifact(context.Background(), telemetryanalysis.OSContentSource{}, candidate, telemetryanalysis.ImportOptions{
		Storage: telemetryanalysis.StorageReference, Access: telemetryanalysis.AccessUserApproved, MaxBytes: candidate.Size + 1,
		ParserID: telemetryanalysis.LMUDuckDBParserID, ParserVersion: telemetryanalysis.LMUDuckDBParserVersion,
		Provenance: telemetryanalysis.Provenance{Kind: telemetryanalysis.ProvenanceSynthetic, EvidenceID: "ta03c-e2e"},
	})
	if err != nil {
		t.Fatalf("BuildAuthorizedHistoricalArtifact() error = %v", err)
	}
	staged, err := telemetryanalysis.StageAuthorizedHistoricalArtifact(context.Background(), telemetryanalysis.OSContentSource{}, candidate, artifact, t.TempDir())
	if err != nil {
		t.Fatalf("StageAuthorizedHistoricalArtifact() error = %v", err)
	}
	runtimeFiles, err := LoadRuntime(TrustedRuntime{Directory: runtimeDirectory, ManifestSHA256: productionManifestSHA256})
	if err != nil {
		staged.Cleanup()
		t.Fatalf("LoadRuntime() error = %v", err)
	}
	reader, err := NewReader(runtimeFiles, artifact, staged)
	if err != nil {
		staged.Cleanup()
		t.Fatalf("NewReader() error = %v", err)
	}
	parser, err := telemetryanalysis.NewLMUDuckDBParser(artifact, reader, telemetryanalysis.MaxLMUDuckDBPageRows)
	if err != nil {
		staged.Cleanup()
		t.Fatalf("NewLMUDuckDBParser() error = %v", err)
	}
	return reader, parser, staged
}
