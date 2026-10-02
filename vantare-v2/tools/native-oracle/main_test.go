package main

import (
	"archive/tar"
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestExtractOnlyFrozenProductionGo(t *testing.T) {
	var archive bytes.Buffer
	writer := tar.NewWriter(&archive)
	for name, content := range map[string]string{
		"vantare-v2/go.mod":                     "module frozen\n",
		"vantare-v2/internal/lmu/parse.go":      "package lmu\n",
		"vantare-v2/internal/lmu/parse_test.go": "old test\n",
		"vantare-v2/internal/lmu/data.bin":      "not source\n",
	} {
		if err := writer.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(content))}); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := extractGo(tar.NewReader(&archive), dir); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(dir, "vantare-v2/internal/lmu/parse.go"))
	if err != nil || string(content) != "package lmu\n" {
		t.Fatalf("production source: %q, %v", content, err)
	}
	for _, name := range []string{"parse_test.go", "data.bin"} {
		if _, err := os.Stat(filepath.Join(dir, "vantare-v2/internal/lmu", name)); !os.IsNotExist(err) {
			t.Fatalf("extracted %s: %v", name, err)
		}
	}
}

func TestExtractRejectsTraversal(t *testing.T) {
	var archive bytes.Buffer
	writer := tar.NewWriter(&archive)
	if err := writer.WriteHeader(&tar.Header{Name: "../escape.go", Mode: 0o600, Size: 0}); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := extractGo(tar.NewReader(&archive), t.TempDir()); err == nil {
		t.Fatal("accepted traversal")
	}
}
