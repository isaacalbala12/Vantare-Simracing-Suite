package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/duckdbadapter"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	maxCandidates        = 512
	maxStagedBytes int64 = 32 << 30
)

type productionBackend struct {
	logicalBudget               *logicalBudgetV1
	project                     string
	root                        telemetryanalysis.SourceRoot
	actual                      map[string]telemetryanalysis.Candidate
	stagingRoot, applicationDir string
	runtime                     *duckdbadapter.Runtime
	ledger                      Cleanup
	ops                         productionOpsV1
}

func (b *productionBackend) setLogicalBudget(x *logicalBudgetV1) { b.logicalBudget = x }

type productionReaderV1 interface {
	io.Closer
	Handshake(context.Context) error
}
type productionOpsV1 struct {
	authorize func(context.Context, telemetryanalysis.ContentSource, telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedHistoricalArtifact, error)
	stage     func(context.Context, telemetryanalysis.ContentSource, telemetryanalysis.Candidate, telemetryanalysis.AuthorizedHistoricalArtifact, string) (telemetryanalysis.StagedHistoricalArtifact, error)
	load      func(string) (duckdbadapter.Runtime, error)
	reader    func(duckdbadapter.Runtime, telemetryanalysis.AuthorizedHistoricalArtifact, telemetryanalysis.StagedHistoricalArtifact) (productionReaderV1, error)
	parser    func(telemetryanalysis.AuthorizedHistoricalArtifact, productionReaderV1) (historicalParser, error)
}

func newProductionBackend(project string) *productionBackend {
	b := &productionBackend{project: project, actual: map[string]telemetryanalysis.Candidate{}}
	b.ops.authorize = func(ctx context.Context, s telemetryanalysis.ContentSource, c telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedHistoricalArtifact, error) {
		return telemetryanalysis.BuildAuthorizedHistoricalArtifact(ctx, s, c, telemetryanalysis.ImportOptions{Storage: telemetryanalysis.StorageReference, Access: telemetryanalysis.AccessUserApproved, MaxBytes: maxStagedBytes, ParserID: telemetryanalysis.LMUDuckDBParserID, ParserVersion: telemetryanalysis.LMUDuckDBParserVersion, Provenance: telemetryanalysis.Provenance{Kind: telemetryanalysis.ProvenanceUser, EvidenceID: "ta04f7-existing-authorized"}})
	}
	b.ops.stage = telemetryanalysis.StageAuthorizedHistoricalArtifact
	b.ops.load = func(dir string) (duckdbadapter.Runtime, error) {
		return duckdbadapter.LoadRuntime(duckdbadapter.ProductionTrust(dir))
	}
	b.ops.reader = func(r duckdbadapter.Runtime, a telemetryanalysis.AuthorizedHistoricalArtifact, s telemetryanalysis.StagedHistoricalArtifact) (productionReaderV1, error) {
		return duckdbadapter.NewReader(r, a, s)
	}
	b.ops.parser = func(a telemetryanalysis.AuthorizedHistoricalArtifact, r productionReaderV1) (historicalParser, error) {
		x, ok := r.(*duckdbadapter.Reader)
		if !ok {
			return nil, fmt.Errorf("reader")
		}
		return telemetryanalysis.NewLMUDuckDBParser(a, x, pageSize)
	}
	return b
}

// gitRunner is the command seam of the git preflight.
type gitRunner func(context.Context, ...string) ([]byte, error)

func (b *productionBackend) git(ctx context.Context, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, "git", append([]string{"-C", b.project}, args...)...).Output()
}

// gitPreflight pins the run to its own protocol commit: HEAD is the invoked
// runner and HEAD^ is the invoked protocol, so a child runner is anchored to
// the erratum it was built from instead of to a legacy constant.
func gitPreflight(ctx context.Context, c RunConfig, run gitRunner) error {
	if c.Mode == liveShapeMode && (c.ProtocolSHA != liveProtocolSHA || c.AuthorizationSHA != liveAuthorizationSHA) {
		return fmt.Errorf("git live authority")
	}
	checks := [][]string{{"rev-parse", "--show-toplevel"}, {"branch", "--show-current"}, {"rev-parse", "HEAD"}, {"rev-parse", "HEAD^"}, {"status", "--porcelain"}}
	parent := c.ProtocolSHA
	if c.AuthorizationSHA != "" {
		parent = c.AuthorizationSHA
	}
	want := []string{filepath.Dir(c.ProjectDir), "work/ta04f-repetition-variance", c.RunnerSHA, parent, ""}
	for i, a := range checks {
		o, e := run(ctx, a...)
		if e != nil || !sameGit(strings.TrimSpace(string(o)), want[i]) {
			return fmt.Errorf("git preflight")
		}
	}
	if c.AuthorizationSHA != "" {
		o, e := run(ctx, "rev-parse", c.AuthorizationSHA+"^")
		if e != nil || !sameGit(strings.TrimSpace(string(o)), c.ProtocolSHA) {
			return fmt.Errorf("git authorization preflight")
		}
	}
	return nil
}

func (b *productionBackend) Preflight(ctx context.Context, c RunConfig) error {
	if e := gitPreflight(ctx, c, b.git); e != nil {
		return e
	}
	planPath := filepath.Join(b.project, "docs", "vantare-program", "research", "telemetry-analysis", "ta04f7-historical-recording-cluster-plan.md")
	live, e := os.ReadFile(planPath)
	if e != nil {
		return fmt.Errorf("protocol plan")
	}
	frozen, e := exec.CommandContext(ctx, "git", "-C", b.project, "show", protocolSHA+":vantare-v2/docs/vantare-program/research/telemetry-analysis/ta04f7-historical-recording-cluster-plan.md").Output()
	if e != nil || string(live) != string(frozen) {
		return fmt.Errorf("protocol plan")
	}
	if c.Mode == liveShapeMode {
		for _, item := range []struct{ path, sha string }{
			{"ta04f9-live-inventory-shape-plan.md", liveProtocolSHA},
			{"ta04f9-gate0-authorization.md", liveAuthorizationSHA},
		} {
			path := filepath.Join(b.project, "docs", "vantare-program", "research", "telemetry-analysis", item.path)
			body, readErr := os.ReadFile(path)
			if readErr != nil {
				return fmt.Errorf("live authority")
			}
			gitPath := "vantare-v2/docs/vantare-program/research/telemetry-analysis/" + item.path
			committed, showErr := exec.CommandContext(ctx, "git", "-C", b.project, "show", item.sha+":"+gitPath).Output()
			if showErr != nil || !bytes.Equal(body, committed) {
				return fmt.Errorf("live authority")
			}
		}
	}
	install, e := resolveLMUInstallPlatform()
	if e != nil {
		return e
	}
	b.root = telemetryanalysis.SourceRoot{Kind: telemetryanalysis.SourceLMU, Root: filepath.Join(install, "UserData", "Telemetry"), Format: telemetryanalysis.LMUDuckDBParserID, Extensions: []string{".duckdb"}}
	if e = directoryNoReparse(b.root.Root); e != nil {
		return e
	}
	b.applicationDir, e = installedApplicationDir()
	if e != nil {
		return e
	}
	cache, e := os.UserCacheDir()
	if e != nil {
		return fmt.Errorf("cache")
	}
	base := filepath.Join(cache, "Vantare", "telemetry-analysis", "staging")
	if e = os.MkdirAll(base, 0700); e != nil {
		return fmt.Errorf("staging")
	}
	if e = directoryNoReparse(base); e != nil {
		return e
	}
	b.stagingRoot, e = os.MkdirTemp(base, "ta04f7-")
	if e != nil {
		return fmt.Errorf("staging")
	}
	b.ledger.StagingRoots = 1
	return nil
}
func sameGit(a, c string) bool {
	a = filepath.FromSlash(strings.TrimSpace(a))
	c = filepath.FromSlash(strings.TrimSpace(c))
	return strings.EqualFold(a, c)
}
func (b *productionBackend) Discover(ctx context.Context) ([]InventoryItem, error) {
	first, e := telemetryanalysis.Discover(ctx, telemetryanalysis.OSMetadataSource{}, b.root, maxCandidates+1)
	if e != nil {
		return nil, e
	}
	if len(first) > maxCandidates {
		return nil, fmt.Errorf("candidate_cap")
	}
	track := map[string]*telemetryanalysis.StabilityTracker{}
	now := time.Now()
	for _, c := range first {
		t, x := telemetryanalysis.NewStabilityTracker(5 * time.Second)
		if x != nil {
			return nil, x
		}
		track[c.Locator] = t
		t.Assess(c, telemetryanalysis.Observation{ObservedAt: now, Exists: true, Compatible: c.Format == telemetryanalysis.LMUDuckDBParserID, WALPresent: c.WALPresent, Size: c.Size, ModTime: c.ModTime})
	}
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
	}
	second, e := telemetryanalysis.Discover(ctx, telemetryanalysis.OSMetadataSource{}, b.root, maxCandidates+1)
	if e != nil {
		return nil, e
	}
	if len(second) > maxCandidates {
		return nil, fmt.Errorf("candidate_cap")
	}
	out := make([]InventoryItem, 0, len(second))
	for _, c := range second {
		t, ok := track[c.Locator]
		if !ok {
			continue
		}
		a := t.Assess(c, telemetryanalysis.Observation{ObservedAt: time.Now(), Exists: true, Compatible: c.Format == telemetryanalysis.LMUDuckDBParserID, WALPresent: c.WALPresent, Size: c.Size, ModTime: c.ModTime})
		if a.State != telemetryanalysis.StateReady {
			continue
		}
		b.actual[c.Locator] = a
		out = append(out, InventoryItem{ID: c.Locator, Modified: c.ModTime, Size: uint64(c.Size), Regular: true, WALAbsent: !c.WALPresent, Stable: true})
	}
	return out, nil
}
func (b *productionBackend) Process(ctx context.Context, item InventoryItem) (out CandidateResult, ret error) {
	raw, ok := b.actual[item.ID]
	if !ok {
		return out, fmt.Errorf("candidate")
	}
	content := telemetryanalysis.OSContentSource{}
	artifact, e := b.ops.authorize(ctx, content, raw)
	if e != nil {
		if x := ctx.Err(); x != nil {
			return out, x
		}
		if errors.Is(e, telemetryanalysis.ErrNotReady) || errors.Is(e, telemetryanalysis.ErrSourceChanged) || errors.Is(e, telemetryanalysis.ErrByteLimit) || errors.Is(e, telemetryanalysis.ErrInvalidManifest) {
			return CandidateResult{Class: "authorization"}, nil
		}
		return out, e
	}
	staged, e := b.ops.stage(ctx, content, raw, artifact, b.stagingRoot)
	if e != nil {
		if x := ctx.Err(); x != nil {
			return out, x
		}
		if errors.Is(e, telemetryanalysis.ErrStagingRejected) || errors.Is(e, telemetryanalysis.ErrHistoricalArtifactChanged) {
			return CandidateResult{Class: "stability"}, nil
		}
		return out, e
	}
	b.ledger.StagingEntries++
	var reader productionReaderV1
	defer func() { ret = closeCleanup(reader, staged.Cleanup, &b.ledger, ret) }()
	if b.runtime == nil {
		r, x := b.ops.load(b.applicationDir)
		if x != nil {
			return out, x
		}
		b.runtime = &r
	}
	reader, e = b.ops.reader(*b.runtime, artifact, staged)
	if e != nil {
		return CandidateResult{Class: "artifact_guard"}, nil
	}
	b.ledger.OpenReaders++
	if e = reader.Handshake(ctx); e != nil {
		return out, e
	}
	parser, e := b.ops.parser(artifact, reader)
	if e != nil {
		return out, e
	}
	return b.materialize(ctx, parser)
}
func closeCleanup(r io.Closer, cleanup func() error, l *Cleanup, prior error) error {
	out := prior
	if r != nil {
		if e := r.Close(); e != nil && out == nil {
			out = e
		}
		l.OpenReaders--
	}
	if cleanup != nil {
		if e := cleanup(); e != nil && out == nil {
			out = e
		} else if e == nil {
			l.StagingEntries--
		}
	}
	return out
}
func (b *productionBackend) Cleanup() error {
	if b.ledger.OpenReaders != 0 || b.ledger.StagingEntries != 0 {
		return fmt.Errorf("cleanup ledger")
	}
	if b.stagingRoot != "" {
		p := b.stagingRoot
		b.stagingRoot = ""
		if e := os.Remove(p); e != nil {
			return e
		}
		b.ledger.StagingRoots = 0
	}
	return nil
}
func (b *productionBackend) Ledger() Cleanup { return b.ledger }
func regularNoReparse(p string) error {
	i, e := os.Lstat(p)
	if e != nil || !i.Mode().IsRegular() || i.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("regular")
	}
	return rejectReparse(p)
}
func directoryNoReparse(p string) error {
	i, e := os.Lstat(p)
	if e != nil || !i.IsDir() || i.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("directory")
	}
	return rejectReparse(p)
}
func rejectReparse(p string) error {
	r, e := filepath.EvalSymlinks(p)
	if e != nil || !samePath(p, r) {
		return fmt.Errorf("reparse")
	}
	return nil
}
func installedApplicationDir() (string, error) {
	var dirs []string
	if x := os.Getenv("LOCALAPPDATA"); x != "" {
		dirs = append(dirs, filepath.Join(x, "Programs", "Vantare Simracing Suite"))
	}
	if x := os.Getenv("ProgramFiles"); x != "" {
		dirs = append(dirs, filepath.Join(x, "Vantare", "Vantare Simracing Suite"))
	}
	for _, d := range dirs {
		if filepath.IsAbs(d) && regularNoReparse(filepath.Join(d, "vantare.exe")) == nil {
			return filepath.Clean(d), nil
		}
	}
	return "", fmt.Errorf("application")
}

var _ = errors.Is
var _ = runtime.GOOS
