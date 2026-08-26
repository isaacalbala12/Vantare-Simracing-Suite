//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestPublisherRejectsRealJunctionAndPreservesSentinel(t *testing.T) {
	root := t.TempDir()
	external := filepath.Join(root, "external")
	if err := os.Mkdir(external, 0700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(external, "sentinel.txt")
	if err := os.WriteFile(sentinel, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	junction := filepath.Join(root, "junction")
	cmd := exec.Command("cmd", "/c", "mklink", "/J", junction, external)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("junction unsupported: %v %s", err, out)
	}
	final := filepath.Join(junction, "freeze.json")
	_, err := preflightOutput(root, final, protocolSHA, strings.Repeat("e", 40))
	if err == nil {
		t.Fatal("junction accepted")
	}
	if got, e := os.ReadFile(sentinel); e != nil || string(got) != "keep" {
		t.Fatalf("sentinel %q %v", got, e)
	}
	if _, e := os.Lstat(final); !os.IsNotExist(e) {
		t.Fatal("final created")
	}
	if !strings.HasPrefix(filepath.Clean(junction), filepath.Clean(root)+string(os.PathSeparator)) {
		t.Fatal("unsafe cleanup target")
	}
}
