package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStageAuthorizedHistoricalArtifactCopiesExactBytesAndCleansUp(t *testing.T) {
	originalDirectory := t.TempDir()
	originalPath := filepath.Join(originalDirectory, "synthetic.duckdb")
	content := []byte("synthetic duckdb bytes only")
	if err := os.WriteFile(originalPath, content, 0o600); err != nil {
		t.Fatal(err)
	}
	artifact, candidate := authorizedOSArtifact(t, originalPath)
	before, err := os.Stat(originalPath)
	if err != nil {
		t.Fatal(err)
	}

	staged, err := StageAuthorizedHistoricalArtifact(context.Background(), OSContentSource{}, candidate, artifact, t.TempDir())
	if err != nil {
		t.Fatalf("StageAuthorizedHistoricalArtifact() error = %v", err)
	}
	if staged.Path() == originalPath || !filepath.IsAbs(staged.Path()) || filepath.Base(staged.Path()) != stagedFilename {
		t.Fatalf("staged path = %q", staged.Path())
	}
	got, err := os.ReadFile(staged.Path())
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(content) {
		t.Fatalf("staged content = %q", got)
	}
	if staged.Evidence().ContentSHA256 != artifact.evidence.ContentSHA256 {
		t.Fatalf("staged hash = %q", staged.Evidence().ContentSHA256)
	}
	after, err := os.Stat(originalPath)
	if err != nil {
		t.Fatal(err)
	}
	if before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		t.Fatal("original metadata changed")
	}
	directory := staged.Directory()
	if err := staged.Cleanup(); err != nil {
		t.Fatalf("Cleanup() error = %v", err)
	}
	if _, err := os.Stat(directory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("staging directory still exists: %v", err)
	}
}

func TestStageAuthorizedHistoricalArtifactRejectsUntrustedOrigins(t *testing.T) {
	path := filepath.Join(t.TempDir(), "synthetic.duckdb")
	if err := os.WriteFile(path, []byte("synthetic"), 0o600); err != nil {
		t.Fatal(err)
	}
	artifact, candidate := authorizedOSArtifact(t, path)
	tests := []struct {
		name   string
		mutate func(*AuthorizedHistoricalArtifact, *Candidate)
	}{
		{name: "external", mutate: func(a *AuthorizedHistoricalArtifact, _ *Candidate) { a.manifest.Source.Kind = SourceExternal }},
		{name: "arbitrary format", mutate: func(a *AuthorizedHistoricalArtifact, _ *Candidate) { a.manifest.Source.Format = "community" }},
		{name: "not ready", mutate: func(_ *AuthorizedHistoricalArtifact, c *Candidate) { c.State = StateStabilizing }},
		{name: "wal", mutate: func(_ *AuthorizedHistoricalArtifact, c *Candidate) { c.WALPresent = true }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			changedArtifact := artifact
			changedCandidate := candidate
			test.mutate(&changedArtifact, &changedCandidate)
			if _, err := StageAuthorizedHistoricalArtifact(context.Background(), OSContentSource{}, changedCandidate, changedArtifact, t.TempDir()); !errors.Is(err, ErrStagingRejected) {
				t.Fatalf("error = %v, want ErrStagingRejected", err)
			}
		})
	}
}

func TestStageAuthorizedHistoricalArtifactRejectsChangedEvidenceAndCleansPartialCopy(t *testing.T) {
	path := filepath.Join(t.TempDir(), "synthetic.duckdb")
	if err := os.WriteFile(path, []byte("synthetic"), 0o600); err != nil {
		t.Fatal(err)
	}
	artifact, candidate := authorizedOSArtifact(t, path)
	artifact.evidence.ContentSHA256 = string(make([]byte, 64))
	root := t.TempDir()
	if _, err := StageAuthorizedHistoricalArtifact(context.Background(), OSContentSource{}, candidate, artifact, root); !errors.Is(err, ErrStagingRejected) {
		t.Fatalf("error = %v, want ErrStagingRejected", err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("partial staging directories = %v", entries)
	}
}

func authorizedOSArtifact(t *testing.T, path string) (AuthorizedHistoricalArtifact, Candidate) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(content)
	candidate := Candidate{
		Kind: SourceLMU, Format: LMUDuckDBParserID, Locator: "lmu://0123456789abcdef",
		Size: info.Size(), ModTime: info.ModTime().UTC(), State: StateReady,
		sourcePath: path, walPath: path + ".wal", stabilityGate: true,
	}
	artifact, err := BuildAuthorizedHistoricalArtifact(context.Background(), OSContentSource{}, candidate, ImportOptions{
		Storage: StorageReference, Access: AccessUserApproved, MaxBytes: 1024,
		ParserID: LMUDuckDBParserID, ParserVersion: LMUDuckDBParserVersion,
		Provenance: Provenance{Kind: ProvenanceUser, EvidenceID: "synthetic"},
	})
	if err != nil {
		t.Fatalf("BuildAuthorizedHistoricalArtifact() error = %v", err)
	}
	if artifact.evidence.ContentSHA256 != hex.EncodeToString(sum[:]) {
		t.Fatal("fixture hash mismatch")
	}
	return artifact, candidate
}

func TestStageAuthorizedHistoricalArtifactHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	source := &cancelAfterReadSource{content: []byte("synthetic"), modTime: time.Unix(10, 0).UTC(), cancel: cancel}
	candidate := readyCandidate(t, Candidate{
		Kind: SourceLMU, Format: LMUDuckDBParserID, Locator: "lmu://0123456789abcdef",
		Size: int64(len(source.content)), ModTime: source.modTime, sourcePath: "synthetic.duckdb",
	})
	artifact, err := BuildAuthorizedHistoricalArtifact(context.Background(), &memoryContentSource{content: string(source.content), modTime: source.modTime}, candidate, ImportOptions{
		Storage: StorageReference, Access: AccessUserApproved, MaxBytes: 1024,
		ParserID: LMUDuckDBParserID, ParserVersion: LMUDuckDBParserVersion,
		Provenance: Provenance{Kind: ProvenanceUser, EvidenceID: "synthetic"},
	})
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if _, err := StageAuthorizedHistoricalArtifact(ctx, source, candidate, artifact, root); !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("partial staging directories = %v", entries)
	}
}

type cancelAfterReadSource struct {
	content []byte
	modTime time.Time
	cancel  context.CancelFunc
}

func (s *cancelAfterReadSource) Metadata(context.Context, string) (ContentMetadata, error) {
	return ContentMetadata{Size: int64(len(s.content)), ModTime: s.modTime, IsRegular: true, Identity: "source-v1"}, nil
}
func (s *cancelAfterReadSource) Exists(context.Context, string) (bool, error) { return false, nil }
func (s *cancelAfterReadSource) OpenRead(context.Context, string) (ReadHandle, error) {
	metadata := ContentMetadata{Size: int64(len(s.content)), ModTime: s.modTime, IsRegular: true, Identity: "source-v1"}
	return &cancelAfterReadHandle{memoryReadHandle: memoryReadHandle{reader: &oneChunkReader{data: s.content}, metadata: []ContentMetadata{metadata}}, cancel: s.cancel}, nil
}

type cancelAfterReadHandle struct {
	memoryReadHandle
	cancel context.CancelFunc
	done   bool
}

func (h *cancelAfterReadHandle) Read(data []byte) (int, error) {
	read, err := h.memoryReadHandle.Read(data)
	if read > 0 && !h.done {
		h.done = true
		h.cancel()
	}
	return read, err
}

type oneChunkReader struct {
	data []byte
	done bool
}

func (r *oneChunkReader) Read(target []byte) (int, error) {
	if r.done {
		return 0, errors.New("unexpected second read")
	}
	r.done = true
	return copy(target, r.data), nil
}
