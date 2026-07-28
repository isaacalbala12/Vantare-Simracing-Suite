package telemetryanalysis

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBuildManifestRequiresReadyCandidateBeforeAccess(t *testing.T) {
	t.Parallel()

	source := &memoryContentSource{content: "synthetic"}
	candidate := Candidate{State: StateActive, sourcePath: "private/session.duckdb"}
	if _, err := BuildManifest(context.Background(), source, candidate, testImportOptions(1024)); !errors.Is(err, ErrNotReady) {
		t.Fatalf("BuildManifest() error = %v, want ErrNotReady", err)
	}
	candidate.State = StateReady
	candidate.WALPresent = true
	if _, err := BuildManifest(context.Background(), source, candidate, testImportOptions(1024)); !errors.Is(err, ErrNotReady) {
		t.Fatalf("BuildManifest() with WAL error = %v, want ErrNotReady", err)
	}
	if source.openCalls != 0 || source.metadataCalls != 0 || source.existsCalls != 0 {
		t.Fatalf("source accessed before ready: opens=%d metadata=%d exists=%d", source.openCalls, source.metadataCalls, source.existsCalls)
	}
}

func TestBuildManifestRequiresUserApprovalAndParserIdentity(t *testing.T) {
	t.Parallel()

	candidate := readyCandidate(t, Candidate{
		Kind: SourceVantare, Format: "recording", Locator: "vantare://0123456789abcdef",
		Size: 9, sourcePath: "source",
	})
	tests := []struct {
		name   string
		mutate func(*ImportOptions)
	}{
		{name: "missing access", mutate: func(options *ImportOptions) { options.Access = "" }},
		{name: "falsifiable ownership", mutate: func(options *ImportOptions) { options.Access = ContentAccess("vantare_owned") }},
		{name: "missing parser id", mutate: func(options *ImportOptions) { options.ParserID = "" }},
		{name: "missing parser version", mutate: func(options *ImportOptions) { options.ParserVersion = "" }},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			source := &memoryContentSource{content: "synthetic", modTime: candidate.ModTime}
			options := testImportOptions(1024)
			test.mutate(&options)
			if _, err := BuildManifest(context.Background(), source, candidate, options); !errors.Is(err, ErrInvalidOptions) {
				t.Fatalf("BuildManifest() error = %v, want ErrInvalidOptions", err)
			}
			if source.openCalls != 0 || source.metadataCalls != 0 || source.existsCalls != 0 {
				t.Fatalf("invalid contract accessed source: %+v", source)
			}
		})
	}
}

func TestBuildManifestProducesReproducibleSanitizedIdentityAndDedupe(t *testing.T) {
	t.Parallel()

	candidate := readyCandidate(t, Candidate{
		Kind:       SourceLMU,
		Format:     "lmu-duckdb",
		Locator:    "lmu://0123456789abcdef",
		Size:       9,
		ModTime:    time.Unix(10, 0).UTC(),
		sourcePath: `C:\Users\private-name\UserData\Telemetry\secret-session.duckdb`,
	})
	options := testImportOptions(1024)
	options.ParserID = "lmu-history"
	options.Provenance.EvidenceID = "ta-02-contract-fixture"

	first, err := BuildManifest(context.Background(), &memoryContentSource{content: "synthetic", modTime: candidate.ModTime}, candidate, options)
	if err != nil {
		t.Fatalf("BuildManifest() error = %v", err)
	}
	second, err := BuildManifest(context.Background(), &memoryContentSource{content: "synthetic", modTime: candidate.ModTime}, candidate, options)
	if err != nil {
		t.Fatalf("second BuildManifest() error = %v", err)
	}
	if first.DedupeKey == "" || first.DedupeKey != second.DedupeKey || first.ContentSHA256 != second.ContentSHA256 {
		t.Fatalf("manifest identity is not reproducible: first=%+v second=%+v", first, second)
	}
	if err := ValidateManifest(first); err != nil {
		t.Fatalf("ValidateManifest() error = %v", err)
	}
	if strings.Contains(first.Source.Locator, "private") || strings.Contains(first.Source.Locator, "secret-session") {
		t.Fatalf("manifest leaks private path: %+v", first)
	}
}

func TestBuildManifestRevalidatesWALBeforeAndAfterRead(t *testing.T) {
	t.Parallel()

	candidate := readyCandidate(t, Candidate{
		Kind: SourceLMU, Format: "lmu-duckdb", Locator: "lmu://0123456789abcdef",
		Size: 9, sourcePath: "source",
	})
	tests := []struct {
		name      string
		wal       []bool
		wantOpens int
	}{
		{name: "present before open", wal: []bool{true}, wantOpens: 0},
		{name: "appears during read", wal: []bool{false, true}, wantOpens: 1},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			source := &memoryContentSource{content: "synthetic", modTime: candidate.ModTime, walSequence: test.wal}
			if _, err := BuildManifest(context.Background(), source, candidate, testImportOptions(1024)); !errors.Is(err, ErrNotReady) {
				t.Fatalf("BuildManifest() error = %v, want ErrNotReady", err)
			}
			if source.openCalls != test.wantOpens {
				t.Fatalf("open calls = %d, want %d", source.openCalls, test.wantOpens)
			}
		})
	}
}

func TestBuildManifestRejectsPathAndHandleIdentityRaces(t *testing.T) {
	t.Parallel()

	modTime := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	candidate := readyCandidate(t, Candidate{
		Kind: SourceLMU, Format: "lmu-duckdb", Locator: "lmu://0123456789abcdef",
		Size: 9, ModTime: modTime, sourcePath: "source",
	})
	regularA := ContentMetadata{Size: 9, ModTime: modTime, IsRegular: true, Identity: "file-a"}
	regularB := ContentMetadata{Size: 9, ModTime: modTime, IsRegular: true, Identity: "file-b"}
	symlinkB := ContentMetadata{Size: 9, ModTime: modTime, IsSymlink: true, Identity: "file-b"}

	tests := []struct {
		name   string
		source *memoryContentSource
	}{
		{
			name: "path swapped before open with same size and mtime",
			source: &memoryContentSource{
				content: "synthetic", pathMetadata: []ContentMetadata{regularA},
				handleMetadata: []ContentMetadata{regularB},
			},
		},
		{
			name: "path replaced after read with same size and mtime",
			source: &memoryContentSource{
				content: "synthetic", pathMetadata: []ContentMetadata{regularA, regularB},
				handleMetadata: []ContentMetadata{regularA, regularA},
			},
		},
		{
			name: "regular path becomes symlink",
			source: &memoryContentSource{
				content: "synthetic", pathMetadata: []ContentMetadata{regularA, symlinkB},
				handleMetadata: []ContentMetadata{regularA, regularA},
			},
		},
		{
			name: "opened handle replaced during read",
			source: &memoryContentSource{
				content: "synthetic", pathMetadata: []ContentMetadata{regularA, regularA},
				handleMetadata: []ContentMetadata{regularA, regularB},
			},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			if _, err := BuildManifest(context.Background(), test.source, candidate, testImportOptions(1024)); !errors.Is(err, ErrSourceChanged) {
				t.Fatalf("BuildManifest() error = %v, want ErrSourceChanged", err)
			}
		})
	}
}

func TestBuildManifestHonorsByteBudgetAndCancellation(t *testing.T) {
	t.Parallel()

	candidate := readyCandidate(t, Candidate{
		Kind: SourceLMU, Format: "lmu-duckdb", Locator: "lmu://0123456789abcdef",
		sourcePath: "source",
	})
	if _, err := BuildManifest(context.Background(), &memoryContentSource{content: "too large"}, candidate, testImportOptions(3)); !errors.Is(err, ErrByteLimit) {
		t.Fatalf("limited BuildManifest() error = %v, want ErrByteLimit", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	source := &memoryContentSource{content: "synthetic"}
	if _, err := BuildManifest(ctx, source, candidate, testImportOptions(1024)); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled BuildManifest() error = %v, want context.Canceled", err)
	}
	if source.openCalls != 0 {
		t.Fatalf("cancelled import opened content %d times", source.openCalls)
	}
}

func TestBuildManifestCancelsDuringRead(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	source := &cancelingContentSource{cancel: cancel}
	candidate := readyCandidate(t, Candidate{
		Kind: SourceLMU, Format: "lmu-duckdb", Locator: "lmu://0123456789abcdef",
		sourcePath: "source",
	})
	if _, err := BuildManifest(ctx, source, candidate, testImportOptions(1024)); !errors.Is(err, context.Canceled) {
		t.Fatalf("BuildManifest() error = %v, want context.Canceled", err)
	}
}

func TestBuildManifestPreservesOriginalAndDeduplicatesAcrossLocations(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	content := []byte("synthetic telemetry corpus")
	var manifests []Manifest
	for _, name := range []string{"first.duckdb", "copy.duckdb"} {
		sourcePath := filepath.Join(root, name)
		if err := os.WriteFile(sourcePath, content, 0o444); err != nil {
			t.Fatal(err)
		}
		before, err := os.Stat(sourcePath)
		if err != nil {
			t.Fatal(err)
		}
		candidate := readyCandidate(t, Candidate{
			Kind: SourceLMU, Format: "lmu-duckdb",
			Locator: redactLocator(SourceLMU, sourcePath), Size: int64(len(content)),
			ModTime: before.ModTime(), sourcePath: sourcePath,
		})
		options := testImportOptions(1024)
		options.ParserID = "lmu-history"
		options.Provenance.EvidenceID = "ta-02-original-intact"
		manifest, err := BuildManifest(context.Background(), OSContentSource{}, candidate, options)
		if err != nil {
			t.Fatalf("BuildManifest(%q) error = %v", name, err)
		}
		after, err := os.Stat(sourcePath)
		if err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != string(content) || before.Size() != after.Size() || before.Mode() != after.Mode() || !before.ModTime().Equal(after.ModTime()) {
			t.Fatalf("BuildManifest modified original %q", name)
		}
		manifests = append(manifests, manifest)
	}
	if manifests[0].DedupeKey != manifests[1].DedupeKey {
		t.Fatalf("equal content at two locations did not dedupe")
	}
}

func TestBuildManifestRejectsChangedSizeAndInvalidContract(t *testing.T) {
	t.Parallel()

	candidate := readyCandidate(t, Candidate{
		Kind: SourceLMU, Format: "lmu-duckdb", Locator: "lmu://0123456789abcdef",
		Size: 5, sourcePath: "source",
	})
	if _, err := BuildManifest(context.Background(), &memoryContentSource{content: "changed"}, candidate, testImportOptions(1024)); !errors.Is(err, ErrSourceChanged) {
		t.Fatalf("BuildManifest() error = %v, want ErrSourceChanged", err)
	}

	candidate.Locator = `lmu://C:\Users\private\session.duckdb`
	source := &memoryContentSource{content: "12345"}
	if _, err := BuildManifest(context.Background(), source, candidate, testImportOptions(1024)); !errors.Is(err, ErrInvalidOptions) {
		t.Fatalf("BuildManifest() error = %v, want ErrInvalidOptions", err)
	}
	if source.openCalls != 0 {
		t.Fatalf("invalid contract opened content %d times", source.openCalls)
	}
}

func TestBuildManifestSanitizesFilesystemErrors(t *testing.T) {
	t.Parallel()

	privatePath := `C:\Users\private-name\missing.duckdb`
	candidate := readyCandidate(t, Candidate{
		Kind: SourceLMU, Format: "lmu-duckdb", Locator: "lmu://0123456789abcdef",
		sourcePath: privatePath,
	})
	_, err := BuildManifest(context.Background(), OSContentSource{}, candidate, testImportOptions(1024))
	if err == nil {
		t.Fatal("BuildManifest() error = nil, want sanitized filesystem error")
	}
	if strings.Contains(err.Error(), "private-name") || strings.Contains(err.Error(), "missing.duckdb") {
		t.Fatalf("BuildManifest() leaked source path: %v", err)
	}
}

func TestBuildManifestStoragePolicyIsExplicit(t *testing.T) {
	t.Parallel()

	for _, storage := range []StorageMode{StorageReference, StorageManagedCopy} {
		storage := storage
		t.Run(string(storage), func(t *testing.T) {
			t.Parallel()

			candidate := readyCandidate(t, Candidate{
				Kind: SourceExternal, Format: "csv", Locator: "external://0123456789abcdef",
				Size: 9, sourcePath: "source",
			})
			options := testImportOptions(1024)
			options.Storage = storage
			manifest, err := BuildManifest(context.Background(), &memoryContentSource{content: "synthetic"}, candidate, options)
			if err != nil {
				t.Fatalf("BuildManifest() error = %v", err)
			}
			if manifest.Source.Storage != storage {
				t.Fatalf("storage = %q, want %q", manifest.Source.Storage, storage)
			}
		})
	}
}

func TestValidateManifestRejectsInvalidProductionFields(t *testing.T) {
	t.Parallel()

	contentHash := strings.Repeat("b", 64)
	valid := Manifest{
		Version: ManifestVersion, DedupeKey: dedupeKey(contentHash, 1),
		ContentSHA256: contentHash, Size: 1,
		Source: ManifestSource{
			Kind: SourceLMU, Format: "lmu-duckdb",
			Locator: "lmu://0123456789abcdef", Storage: StorageReference,
		},
		Parser:     ParserRef{ID: "none", Version: "0"},
		Provenance: Provenance{Kind: ProvenanceSynthetic, EvidenceID: "ta-02"},
	}
	if err := ValidateManifest(valid); err != nil {
		t.Fatalf("ValidateManifest(valid) error = %v", err)
	}
	tests := []struct {
		name   string
		mutate func(*Manifest)
	}{
		{name: "short locator", mutate: func(m *Manifest) { m.Source.Locator = "lmu://short" }},
		{name: "missing parser id", mutate: func(m *Manifest) { m.Parser.ID = "" }},
		{name: "missing parser version", mutate: func(m *Manifest) { m.Parser.Version = "" }},
		{name: "invalid hash", mutate: func(m *Manifest) { m.ContentSHA256 = "invalid" }},
		{name: "semantically false dedupe key", mutate: func(m *Manifest) { m.DedupeKey = strings.Repeat("a", 64) }},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			manifest := valid
			test.mutate(&manifest)
			if err := ValidateManifest(manifest); !errors.Is(err, ErrInvalidManifest) {
				t.Fatalf("ValidateManifest() error = %v, want ErrInvalidManifest", err)
			}
		})
	}
}

func testImportOptions(maxBytes int64) ImportOptions {
	return ImportOptions{
		Storage: StorageReference, Access: AccessUserApproved, MaxBytes: maxBytes,
		ParserID: "none", ParserVersion: "0",
		Provenance: Provenance{Kind: ProvenanceSynthetic, EvidenceID: "ta-02-test"},
	}
}

type memoryContentSource struct {
	content        string
	modTime        time.Time
	identity       string
	pathMetadata   []ContentMetadata
	handleMetadata []ContentMetadata
	walSequence    []bool
	openCalls      int
	metadataCalls  int
	existsCalls    int
}

func (s *memoryContentSource) defaultMetadata() ContentMetadata {
	modTime := s.modTime
	if modTime.IsZero() {
		modTime = time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	}
	identity := s.identity
	if identity == "" {
		identity = "source-v1"
	}
	return ContentMetadata{Size: int64(len(s.content)), ModTime: modTime, IsRegular: true, Identity: identity}
}

func (s *memoryContentSource) Metadata(context.Context, string) (ContentMetadata, error) {
	index := s.metadataCalls
	s.metadataCalls++
	if len(s.pathMetadata) == 0 {
		return s.defaultMetadata(), nil
	}
	if index >= len(s.pathMetadata) {
		index = len(s.pathMetadata) - 1
	}
	return s.pathMetadata[index], nil
}

func (s *memoryContentSource) Exists(context.Context, string) (bool, error) {
	index := s.existsCalls
	s.existsCalls++
	if len(s.walSequence) == 0 {
		return false, nil
	}
	if index >= len(s.walSequence) {
		index = len(s.walSequence) - 1
	}
	return s.walSequence[index], nil
}

func (s *memoryContentSource) OpenRead(ctx context.Context, _ string) (ReadHandle, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.openCalls++
	metadata := s.handleMetadata
	if len(metadata) == 0 {
		metadata = []ContentMetadata{s.defaultMetadata()}
	}
	return &memoryReadHandle{reader: strings.NewReader(s.content), metadata: metadata}, nil
}

type memoryReadHandle struct {
	reader        io.Reader
	metadata      []ContentMetadata
	metadataCalls int
}

func (h *memoryReadHandle) Read(buffer []byte) (int, error) { return h.reader.Read(buffer) }
func (h *memoryReadHandle) Close() error                    { return nil }
func (h *memoryReadHandle) Metadata() (ContentMetadata, error) {
	index := h.metadataCalls
	h.metadataCalls++
	if index >= len(h.metadata) {
		index = len(h.metadata) - 1
	}
	return h.metadata[index], nil
}

type cancelingContentSource struct {
	cancel context.CancelFunc
}

func (s *cancelingContentSource) Metadata(context.Context, string) (ContentMetadata, error) {
	return ContentMetadata{
		Size: 9, ModTime: time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC),
		IsRegular: true, Identity: "source-v1",
	}, nil
}
func (s *cancelingContentSource) Exists(context.Context, string) (bool, error) {
	return false, nil
}
func (s *cancelingContentSource) OpenRead(context.Context, string) (ReadHandle, error) {
	metadata := ContentMetadata{
		Size: 9, ModTime: time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC),
		IsRegular: true, Identity: "source-v1",
	}
	return &memoryReadHandle{reader: &cancelingReader{cancel: s.cancel}, metadata: []ContentMetadata{metadata}}, nil
}

type cancelingReader struct {
	cancel context.CancelFunc
	read   bool
}

func (r *cancelingReader) Read(buffer []byte) (int, error) {
	if r.read {
		return 0, io.EOF
	}
	r.read = true
	buffer[0] = 'x'
	r.cancel()
	return 1, nil
}

func readyCandidate(t *testing.T, candidate Candidate) Candidate {
	t.Helper()

	start := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	tracker, err := NewStabilityTracker(time.Second)
	if err != nil {
		t.Fatal(err)
	}
	size := candidate.Size
	if size == 0 {
		size = 9
	}
	modTime := candidate.ModTime
	if modTime.IsZero() {
		modTime = start
	}
	observation := Observation{Exists: true, Compatible: true, Size: size, ModTime: modTime}
	observation.ObservedAt = start
	candidate = tracker.Assess(candidate, observation)
	observation.ObservedAt = start.Add(time.Second)
	candidate = tracker.Assess(candidate, observation)
	candidate.walPath = walPath(candidate.Kind, candidate.sourcePath)
	return candidate
}
