package main

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/duckdbadapter"
)

var expectedOutputPath = projectOutputPath("ta04f6-selection-freeze.md")

type productionExistingBackendV1 struct {
	projectDir     string
	root           telemetryanalysis.SourceRoot
	actual         map[string]telemetryanalysis.Candidate
	stagingRoot    string
	applicationDir string
	runtime        *duckdbadapter.Runtime
	ledger         CleanupLedgerV1
}

func newProductionExistingBackendV1(projectDir string) *productionExistingBackendV1 {
	return &productionExistingBackendV1{projectDir: projectDir, actual: map[string]telemetryanalysis.Candidate{}}
}

func (b *productionExistingBackendV1) Preflight(ctx context.Context, cfg ExistingConfigV1) error {
	if cfg.OutputPath != expectedOutputPath {
		return invalid()
	}
	if filepath.Join(b.projectDir, "docs", "vantare-program", "research", "telemetry-analysis", "ta04f6-selection-freeze.md") != cfg.OutputPath {
		return invalid()
	}
	if err := validateOutputPathV1(cfg.OutputPath); err != nil {
		return err
	}
	plan, err := os.ReadFile(filepath.Join(b.projectDir, "docs", "vantare-program", "research", "telemetry-analysis", "ta04f6-lap-cohort-plan.md"))
	if err != nil {
		return invalid()
	}
	return preflightGitV1(ctx, cfg, osGitV1{directory: b.projectDir}, plan, filepath.Dir(b.projectDir))
}
func (b *productionExistingBackendV1) SyntheticControls() error {
	_, err := RunSyntheticV1()
	return err
}

func (b *productionExistingBackendV1) Ready(ctx context.Context) ([]ExistingCandidateV1, error) {
	root, err := resolveLMURootV1()
	if err != nil {
		return nil, err
	}
	b.root = telemetryanalysis.SourceRoot{Kind: telemetryanalysis.SourceLMU, Root: root, Format: telemetryanalysis.LMUDuckDBParserID, Extensions: []string{".duckdb"}}
	b.applicationDir, err = resolveInstalledApplicationDirV1()
	if err != nil {
		return nil, err
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return nil, invalid()
	}
	base := filepath.Join(cache, "Vantare", "telemetry-analysis", "staging")
	if err = os.MkdirAll(base, 0o700); err != nil {
		return nil, invalid()
	}
	if err = rejectReparseV1(base); err != nil {
		return nil, err
	}
	b.stagingRoot, err = os.MkdirTemp(base, "ta04f6-")
	if err != nil {
		return nil, invalid()
	}
	b.ledger.StagingRoots = 1
	first, err := telemetryanalysis.Discover(ctx, telemetryanalysis.OSMetadataSource{}, b.root, maxReadyCandidates)
	if err != nil {
		return nil, err
	}
	trackers := make(map[string]*telemetryanalysis.StabilityTracker, len(first))
	t0 := time.Now()
	for _, c := range first {
		if _, duplicate := trackers[c.Locator]; duplicate {
			return nil, invalid()
		}
		tracker, e := telemetryanalysis.NewStabilityTracker(5 * time.Second)
		if e != nil {
			return nil, e
		}
		trackers[c.Locator] = tracker
		tracker.Assess(c, observationV1(c, t0))
	}
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
	}
	second, err := telemetryanalysis.Discover(ctx, telemetryanalysis.OSMetadataSource{}, b.root, maxReadyCandidates)
	if err != nil {
		return nil, err
	}
	ready := make([]ExistingCandidateV1, 0, len(second))
	observed := time.Now()
	for _, c := range second {
		tracker, ok := trackers[c.Locator]
		if !ok {
			continue
		}
		authorized := tracker.Assess(c, observationV1(c, observed))
		if authorized.State != telemetryanalysis.StateReady {
			continue
		}
		b.actual[c.Locator] = authorized
		ready = append(ready, ExistingCandidateV1{Token: c.Locator, Sort: CandidateV1{ModifiedAt: c.ModTime, Size: c.Size, Locator: c.Locator}})
	}
	return ready, nil
}

func observationV1(c telemetryanalysis.Candidate, at time.Time) telemetryanalysis.Observation {
	return telemetryanalysis.Observation{ObservedAt: at, Exists: true, Compatible: c.Format == telemetryanalysis.LMUDuckDBParserID, WALPresent: c.WALPresent, Size: c.Size, ModTime: c.ModTime}
}

func (b *productionExistingBackendV1) Process(ctx context.Context, c ExistingCandidateV1, key [32]byte) (out ProcessedCandidateV1, returnErr error) {
	raw, ok := b.actual[c.Token]
	if !ok {
		return out, invalid()
	}
	content := telemetryanalysis.OSContentSource{}
	artifact, err := telemetryanalysis.BuildAuthorizedHistoricalArtifact(ctx, content, raw, telemetryanalysis.ImportOptions{Storage: telemetryanalysis.StorageReference, Access: telemetryanalysis.AccessUserApproved, MaxBytes: maxStagedBytes, ParserID: telemetryanalysis.LMUDuckDBParserID, ParserVersion: telemetryanalysis.LMUDuckDBParserVersion, Provenance: telemetryanalysis.Provenance{Kind: telemetryanalysis.ProvenanceUser, EvidenceID: "ta04f6-existing-authorized"}})
	if err != nil {
		return out, err
	}
	staged, err := telemetryanalysis.StageAuthorizedHistoricalArtifact(ctx, content, raw, artifact, b.stagingRoot)
	if err != nil {
		return out, err
	}
	b.ledger.StagingEntries++
	var reader *duckdbadapter.Reader
	defer func() {
		returnErr = closeThenCleanupV1(reader, staged.Cleanup, &b.ledger, returnErr)
	}()
	if b.runtime == nil {
		loaded, e := duckdbadapter.LoadRuntime(duckdbadapter.ProductionTrust(b.applicationDir))
		if e != nil {
			return out, e
		}
		b.runtime = &loaded
	}
	reader, err = duckdbadapter.NewReader(*b.runtime, artifact, staged)
	if err != nil {
		return out, err
	}
	b.ledger.OpenReaders++
	if err = reader.Handshake(ctx); err != nil {
		return out, err
	}
	parser, err := telemetryanalysis.NewLMUDuckDBParser(artifact, reader, 4096)
	if err != nil {
		return out, err
	}
	recording, algarve, sessionID, err := materializeRecordingV1(ctx, parser, key)
	if err != nil {
		if IsCode(err, CodePipelineFault) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, telemetryanalysis.ErrHistoricalSource) || errors.Is(err, telemetryanalysis.ErrHistoricalArtifactChanged) {
			return out, err
		}
		return ProcessedCandidateV1{Algarve: algarve, SessionID: sessionID, Group: recording.Group, Recording: &recording, Reject: "data_invalid"}, nil
	}
	if !algarve {
		return ProcessedCandidateV1{}, nil
	}
	return ProcessedCandidateV1{Algarve: true, SessionID: sessionID, Group: recording.Group, Recording: &recording}, nil
}

func closeThenCleanupV1(reader io.Closer, cleanup func() error, ledger *CleanupLedgerV1, prior error) error {
	result := prior
	if reader != nil {
		if err := reader.Close(); err != nil && result == nil {
			result = err
		}
		ledger.OpenReaders--
	}
	if cleanup != nil {
		if err := cleanup(); err != nil && result == nil {
			result = err
		} else if err == nil {
			ledger.StagingEntries--
		}
	}
	return result
}

func (b *productionExistingBackendV1) CleanupRoot() error {
	if b.stagingRoot == "" {
		return nil
	}
	if b.ledger.OpenReaders != 0 || b.ledger.StagingEntries != 0 {
		return invalid()
	}
	root := b.stagingRoot
	b.stagingRoot = ""
	if err := os.Remove(root); err != nil {
		return err
	}
	b.ledger.StagingRoots = 0
	if _, err := os.Lstat(root); !errors.Is(err, os.ErrNotExist) {
		return invalid()
	}
	return nil
}
func (b *productionExistingBackendV1) Ledger() CleanupLedgerV1 { return b.ledger }

func resolveLMURootV1() (string, error) {
	install, err := resolveLMUInstallPlatformV1()
	if err != nil {
		return "", err
	}
	if !filepath.IsAbs(install) || filepath.Clean(install) != install || !strings.EqualFold(filepath.Base(install), "Le Mans Ultimate") {
		return "", invalid()
	}
	foundExe := false
	for _, name := range []string{"Le Mans Ultimate.exe", "LMU.exe"} {
		if regularNoReparseV1(filepath.Join(install, name)) == nil {
			foundExe = true
			break
		}
	}
	if !foundExe {
		return "", invalid()
	}
	root := filepath.Join(install, "UserData", "Telemetry")
	if err := directoryNoReparseV1(root); err != nil {
		return "", err
	}
	return root, nil
}

func resolveInstalledApplicationDirV1() (string, error) {
	var dirs []string
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		dirs = append(dirs, filepath.Join(local, "Programs", "Vantare Simracing Suite"))
	}
	if pf := os.Getenv("ProgramFiles"); pf != "" {
		dirs = append(dirs, filepath.Join(pf, "Vantare", "Vantare Simracing Suite"))
	}
	for _, dir := range dirs {
		if !filepath.IsAbs(dir) {
			continue
		}
		if regularNoReparseV1(filepath.Join(dir, "vantare.exe")) == nil {
			return filepath.Clean(dir), nil
		}
	}
	return "", invalid()
}

func regularNoReparseV1(path string) error {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return invalid()
	}
	return rejectReparseV1(path)
}
func directoryNoReparseV1(path string) error {
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return invalid()
	}
	return rejectReparseV1(path)
}
func rejectReparseV1(path string) error {
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil || !samePathV1(filepath.Clean(path), filepath.Clean(resolved)) {
		return invalid()
	}
	return nil
}
func samePathV1(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

func validateOutputPathV1(path string) error {
	if path != expectedOutputPath || !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return invalid()
	}
	if _, err := os.Lstat(path); err == nil || !errors.Is(err, os.ErrNotExist) {
		return invalid()
	}
	parent := filepath.Dir(path)
	if err := directoryNoReparseV1(parent); err != nil {
		return err
	}
	volume := filepath.VolumeName(parent) + string(os.PathSeparator)
	current := volume
	rel, err := filepath.Rel(volume, parent)
	if err != nil {
		return invalid()
	}
	for _, part := range strings.Split(rel, string(os.PathSeparator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)
		info, e := os.Lstat(current)
		if e != nil || info.Mode()&os.ModeSymlink != 0 {
			return invalid()
		}
	}
	return nil
}
