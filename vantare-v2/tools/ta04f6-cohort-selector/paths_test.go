package main

import (
	"path/filepath"
	"testing"
)

func TestProjectOutputPathIsPortableAndAbsolute(t *testing.T) {
	got := projectOutputPath("freeze.json")
	if !filepath.IsAbs(got) || filepath.Base(got) != "freeze.json" {
		t.Fatalf("unexpected project output path %q", got)
	}
	if got == projectOutputPath("other.json") {
		t.Fatal("filename must be preserved")
	}
}
