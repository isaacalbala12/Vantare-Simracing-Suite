package coldstart

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDiscoverStandardLMUFindsOnlyStableDuckDBSessions(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "race.duckdb"), []byte("duckdb"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "notes.txt"), []byte("ignore"), 0o600); err != nil {
		t.Fatal(err)
	}

	candidates, err := DiscoverStandardLMU(context.Background(), root, time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if len(candidates) != 1 || candidates[0].Format != "lmu-duckdb" {
		t.Fatalf("candidates=%+v", candidates)
	}
}

func TestDiscoverStandardLMUAcceptsMissingDefaultDirectoryAsEmpty(t *testing.T) {
	candidates, err := DiscoverStandardLMU(context.Background(), filepath.Join(t.TempDir(), "missing"), time.Millisecond)
	if err != nil || len(candidates) != 0 {
		t.Fatalf("candidates=%+v err=%v", candidates, err)
	}
}
