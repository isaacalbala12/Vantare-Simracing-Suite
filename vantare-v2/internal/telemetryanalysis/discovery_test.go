package telemetryanalysis

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestDiscoverUsesMetadataOnlyAndRedactsPaths(t *testing.T) {
	t.Parallel()

	source := &countingMetadataSource{
		files: fstest.MapFS{
			"UserData/Telemetry/session.duckdb":     &fstest.MapFile{Data: []byte("must not be read"), ModTime: time.Unix(10, 0)},
			"UserData/Telemetry/session.duckdb.wal": &fstest.MapFile{Data: []byte("active writer"), ModTime: time.Unix(11, 0)},
			"UserData/Telemetry/readme.txt":         &fstest.MapFile{Data: []byte("ignore"), ModTime: time.Unix(12, 0)},
		},
	}

	candidates, err := Discover(context.Background(), source, SourceRoot{
		Kind:       SourceLMU,
		Root:       "UserData/Telemetry",
		Extensions: []string{".duckdb"},
	}, 4)
	if err != nil {
		t.Fatalf("Discover() error = %v", err)
	}
	if source.readCalls != 0 {
		t.Fatalf("discovery read content %d times", source.readCalls)
	}
	if len(candidates) != 1 {
		t.Fatalf("got %d candidates, want 1", len(candidates))
	}

	candidate := candidates[0]
	if candidate.WALPresent != true {
		t.Fatal("candidate with sibling WAL must be marked active")
	}
	if candidate.State != StateActive {
		t.Fatalf("state = %q, want %q", candidate.State, StateActive)
	}
	if strings.Contains(candidate.Locator, "UserData") || strings.Contains(candidate.Locator, "session") {
		t.Fatalf("locator leaks source path or filename: %q", candidate.Locator)
	}
	if candidate.Locator == "" || !strings.HasPrefix(candidate.Locator, "lmu://") {
		t.Fatalf("unexpected redacted locator %q", candidate.Locator)
	}
	serialized, err := json.Marshal(candidate)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(serialized), "UserData") || strings.Contains(string(serialized), "session.duckdb") {
		t.Fatalf("serialized candidate leaks private path: %s", serialized)
	}
}

func TestDiscoverHonorsCancellationAndCandidateLimit(t *testing.T) {
	t.Parallel()

	source := &countingMetadataSource{files: fstest.MapFS{
		"sessions/one.duckdb": &fstest.MapFile{},
		"sessions/two.duckdb": &fstest.MapFile{},
	}}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Discover(ctx, source, SourceRoot{Kind: SourceLMU, Root: "sessions", Extensions: []string{".duckdb"}}, 2); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled Discover() error = %v, want context.Canceled", err)
	}

	if _, err := Discover(context.Background(), source, SourceRoot{Kind: SourceLMU, Root: "sessions", Extensions: []string{".duckdb"}}, 1); !errors.Is(err, ErrCandidateLimit) {
		t.Fatalf("limited Discover() error = %v, want ErrCandidateLimit", err)
	}
	if _, err := Discover(context.Background(), source, SourceRoot{Kind: SourceLMU, Root: "empty", Extensions: []string{".duckdb"}}, 0); !errors.Is(err, ErrCandidateLimit) {
		t.Fatalf("zero-budget Discover() error = %v, want ErrCandidateLimit", err)
	}
}

func TestDiscoverTemporaryFilesystemDoesNotModifyOriginal(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	original := filepath.Join(root, "session.duckdb")
	content := []byte("synthetic and sanitized")
	if err := os.WriteFile(original, content, 0o444); err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(original)
	if err != nil {
		t.Fatal(err)
	}

	candidates, err := Discover(context.Background(), OSMetadataSource{}, SourceRoot{
		Kind:       SourceLMU,
		Root:       root,
		Extensions: []string{".duckdb"},
	}, 2)
	if err != nil {
		t.Fatalf("Discover() error = %v", err)
	}
	if len(candidates) != 1 {
		t.Fatalf("got %d candidates, want 1", len(candidates))
	}

	after, err := os.Stat(original)
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(original)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(content) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) || before.Mode() != after.Mode() {
		t.Fatal("metadata-only discovery modified the original")
	}
}

func TestDiscoverSanitizesSourceErrors(t *testing.T) {
	t.Parallel()

	private := `C:\Users\private-name\UserData\Telemetry`
	_, err := Discover(context.Background(), failingMetadataSource{err: errors.New(private)}, SourceRoot{
		Kind: SourceLMU, Root: private, Extensions: []string{".duckdb"},
	}, 1)
	if err == nil {
		t.Fatal("Discover() error = nil, want sanitized error")
	}
	if strings.Contains(err.Error(), "private-name") || strings.Contains(err.Error(), "UserData") {
		t.Fatalf("Discover() leaked source path in error: %v", err)
	}
}

func TestDiscoverSupportsNeutralSourceKinds(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		kind       SourceKind
		file       string
		extension  string
		wantFormat string
	}{
		{name: "vantare recording", kind: SourceVantare, file: "run.vtr", extension: ".vtr", wantFormat: "vtr"},
		{name: "external import", kind: SourceExternal, file: "shared.csv", extension: ".csv", wantFormat: "csv"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			source := &countingMetadataSource{files: fstest.MapFS{
				"sessions/" + tt.file:          &fstest.MapFile{},
				"sessions/" + tt.file + ".wal": &fstest.MapFile{},
			}}
			candidates, err := Discover(context.Background(), source, SourceRoot{
				Kind: tt.kind, Root: "sessions", Extensions: []string{tt.extension},
			}, 1)
			if err != nil {
				t.Fatalf("Discover() error = %v", err)
			}
			if len(candidates) != 1 || candidates[0].Format != tt.wantFormat {
				t.Fatalf("candidates = %+v, want format %q", candidates, tt.wantFormat)
			}
			if candidates[0].WALPresent || candidates[0].State != StateStabilizing {
				t.Fatalf("non-LMU sibling WAL must not imply active writer: %+v", candidates[0])
			}
		})
	}
}

func TestDiscoverRejectsSymlinkAndEscapingMetadataEntries(t *testing.T) {
	t.Parallel()

	source := staticMetadataSource{entries: []MetadataEntry{
		{Name: "safe.duckdb", Size: 10},
		{Name: "linked.duckdb", Size: 10, IsSymlink: true},
		{Name: "../escape.duckdb", Size: 10},
		{Name: `folder\escape.duckdb`, Size: 10},
	}}
	candidates, err := Discover(context.Background(), source, SourceRoot{
		Kind: SourceLMU, Root: "sessions", Extensions: []string{".duckdb"},
	}, 4)
	if err != nil {
		t.Fatalf("Discover() error = %v", err)
	}
	if len(candidates) != 1 {
		t.Fatalf("candidates = %+v, want only safe entry", candidates)
	}
}

type countingMetadataSource struct {
	files     fstest.MapFS
	readCalls int
}

func (s *countingMetadataSource) ReadDir(ctx context.Context, root string) ([]MetadataEntry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	entries, err := s.files.ReadDir(root)
	if err != nil {
		return nil, err
	}
	result := make([]MetadataEntry, 0, len(entries))
	for _, entry := range entries {
		info, infoErr := entry.Info()
		if infoErr != nil {
			return nil, infoErr
		}
		result = append(result, MetadataEntry{Name: entry.Name(), Size: info.Size(), ModTime: info.ModTime(), IsDir: entry.IsDir()})
	}
	return result, nil
}

func (s *countingMetadataSource) Exists(ctx context.Context, path string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	_, err := s.files.Stat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

func (s *countingMetadataSource) ReadFile(string) ([]byte, error) {
	s.readCalls++
	return nil, errors.New("content access is forbidden during discovery")
}

type failingMetadataSource struct{ err error }

func (s failingMetadataSource) ReadDir(context.Context, string) ([]MetadataEntry, error) {
	return nil, s.err
}

func (s failingMetadataSource) Exists(context.Context, string) (bool, error) {
	return false, s.err
}

type staticMetadataSource struct{ entries []MetadataEntry }

func (s staticMetadataSource) ReadDir(context.Context, string) ([]MetadataEntry, error) {
	return s.entries, nil
}

func (staticMetadataSource) Exists(context.Context, string) (bool, error) {
	return false, nil
}
