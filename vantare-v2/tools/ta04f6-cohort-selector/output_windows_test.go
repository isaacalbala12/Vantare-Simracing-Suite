//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestAtomicOutputRejectsJunctionAncestor(t *testing.T) {
	root := t.TempDir()
	real := filepath.Join(root, "real")
	junction := filepath.Join(root, "junction")
	if err := os.Mkdir(real, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := exec.Command("cmd", "/c", "mklink", "/J", junction, real).Run(); err != nil {
		t.Skip("junction creation unavailable")
	}
	defer os.Remove(junction)
	if err := validateAtomicTargetV1(filepath.Join(junction, "freeze.md")); err == nil {
		t.Fatal("junction ancestor accepted")
	}
}
