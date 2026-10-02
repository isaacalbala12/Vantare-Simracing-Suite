package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFreezeRefusesAnExistingCorpusWithoutChangingItsBytes(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "reviewed.json")
	const original = "previously reviewed oracle"
	if err := os.WriteFile(path, []byte(original), 0600); err != nil {
		t.Fatal(err)
	}
	if err := freeze(dir); !os.IsExist(err) {
		t.Fatalf("existing corpus must fail closed: %v", err)
	}
	bytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(bytes) != original {
		t.Fatal("oracle regeneration overwrote the reviewed corpus")
	}
}
