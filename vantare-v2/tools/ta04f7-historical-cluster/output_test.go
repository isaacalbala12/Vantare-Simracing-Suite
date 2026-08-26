package main

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type faultFile struct {
	bytes.Buffer
	syncErr, closeErr error
}

func (f *faultFile) Sync() error  { return f.syncErr }
func (f *faultFile) Close() error { return f.closeErr }

func TestOutputPreexistingTerminalBeforeBackend(t *testing.T) {
	dir := t.TempDir()
	runner := strings.Repeat("a", 40)
	final := filepath.Join(dir, "freeze.json")
	tmp := tempPath(final, protocolSHA, runner)
	for _, which := range []string{"final", "temp", "both"} {
		_ = os.Remove(final)
		_ = os.Remove(tmp)
		if which == "final" || which == "both" {
			if err := os.WriteFile(final, []byte("sentinel"), 0600); err != nil {
				t.Fatal(err)
			}
		}
		if which == "temp" || which == "both" {
			if err := os.WriteFile(tmp, []byte("sentinel"), 0600); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := preflightOutput(dir, final, protocolSHA, runner); err == nil || !strings.Contains(err.Error(), "output_state_preexisting") {
			t.Fatalf("%s %v", which, err)
		}
	}
}
func TestPublishHardlinkBytesNoOverwriteAndTempRemoved(t *testing.T) {
	dir := t.TempDir()
	runner := strings.Repeat("b", 40)
	final := filepath.Join(dir, "freeze.json")
	body := []byte("{}\n")
	g, err := preflightOutput(dir, final, protocolSHA, runner)
	if err != nil {
		t.Fatal(err)
	}
	if err := publishExclusive(g, body); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(final)
	if err != nil || !bytes.Equal(got, body) {
		t.Fatalf("%q %v", got, err)
	}
	if _, err = os.Lstat(tempPath(final, protocolSHA, runner)); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("temp remains")
	}
	g, err = preflightOutput(dir, final, protocolSHA, runner)
	if err == nil {
		t.Fatal("preflight accepted existing output")
	}
	got, _ = os.ReadFile(final)
	if !bytes.Equal(got, body) {
		t.Fatal("final changed")
	}
}
func TestOutputGuardRejectsAncestorReplacementAfterPreflight(t *testing.T) {
	root := t.TempDir()
	parent := filepath.Join(root, "controlled")
	if err := os.Mkdir(parent, 0700); err != nil {
		t.Fatal(err)
	}
	final := filepath.Join(parent, "freeze.json")
	runner := strings.Repeat("f", 40)
	g, err := preflightOutput(root, final, protocolSHA, runner)
	if err != nil {
		t.Fatal(err)
	}
	if len(g.ancestors) != 2 {
		t.Fatalf("ancestors=%d", len(g.ancestors))
	}
	old := filepath.Join(root, "old")
	if err = os.Rename(parent, old); err != nil {
		t.Fatal(err)
	}
	if err = os.Mkdir(parent, 0700); err != nil {
		t.Fatal(err)
	}
	if err = publishExclusive(g, []byte("{}\n")); err == nil {
		t.Fatal("replaced ancestor accepted")
	}
	if _, err = os.Lstat(final); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("final created")
	}
}
func TestDeterministicTempExact(t *testing.T) {
	final := `C:\controlled\freeze.json`
	runner := strings.Repeat("c", 40)
	want := final + ".ta04f7-7d239baae99c-cccccccccccc.tmp"
	if got := tempPath(final, protocolSHA, runner); got != want {
		t.Fatalf("%q", got)
	}
}
func TestPublishInjectedSyncCloseLinkAndIdentityFailures(t *testing.T) {
	dir := t.TempDir()
	runner := strings.Repeat("d", 40)
	final := filepath.Join(dir, "freeze.json")
	base := outputOps{validate: func(string) error { return nil }, read: func(string) ([]byte, error) { return []byte("x"), nil }, link: func(string, string) error { return nil }, remove: func(string) error { return nil }, lstat: func(string) (os.FileInfo, error) { return nil, os.ErrNotExist }}
	for _, tc := range []struct {
		name string
		mut  func(*outputOps)
	}{{"sync", func(o *outputOps) {
		o.open = func(string) (syncFile, error) { return &faultFile{syncErr: errors.New("sync")}, nil }
	}}, {"close", func(o *outputOps) {
		o.open = func(string) (syncFile, error) { return &faultFile{closeErr: errors.New("close")}, nil }
	}}, {"link", func(o *outputOps) {
		o.open = func(string) (syncFile, error) { return &faultFile{}, nil }
		o.link = func(string, string) error { return errors.New("link") }
	}}, {"swap", func(o *outputOps) {
		o.open = func(string) (syncFile, error) { return &faultFile{}, nil }
		n := 0
		o.validate = func(string) error {
			n++
			if n == 2 {
				return errors.New("swap")
			}
			return nil
		}
	}}} {
		o := base
		tc.mut(&o)
		if err := publishWithOps(final, tempPath(final, protocolSHA, runner), []byte("x"), o); err == nil {
			t.Fatalf("%s accepted", tc.name)
		}
	}
}
func TestValidateAncestorsRejectsRealSymlink(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real")
	if err := os.Mkdir(real, 0700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "link")
	if err := os.Symlink(real, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if validateAncestors(link) == nil {
		t.Fatal("symlink accepted")
	}
}
