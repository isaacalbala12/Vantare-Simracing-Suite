package applog

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRotateKeepsOneFileUnderTheCap(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vantare.log")
	file, err := newRotatingFile(path, 64, 2)
	if err != nil {
		t.Fatalf("newRotatingFile: %v", err)
	}
	defer file.Close()

	line := strings.Repeat("x", 40) + "\n"
	for index := 0; index < 5; index++ {
		if _, err := file.Write([]byte(line)); err != nil {
			t.Fatalf("write %d: %v", index, err)
		}
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat live log: %v", err)
	}
	if info.Size() > 64 {
		t.Fatalf("live log = %d bytes, want it capped at 64", info.Size())
	}
}

func TestRotateKeepsAtMostTheConfiguredBackups(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vantare.log")
	file, err := newRotatingFile(path, 32, 2)
	if err != nil {
		t.Fatalf("newRotatingFile: %v", err)
	}
	defer file.Close()

	for index := 0; index < 12; index++ {
		if _, err := file.Write([]byte(strings.Repeat("y", 30) + "\n")); err != nil {
			t.Fatalf("write %d: %v", index, err)
		}
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	// One live file plus at most two backups, no matter how long we wrote for.
	if len(entries) > 3 {
		t.Fatalf("log directory holds %d files, want at most 3", len(entries))
	}
	for _, name := range []string{"vantare.log", "vantare.1.log", "vantare.2.log"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("expected %s to exist: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "vantare.3.log")); !os.IsNotExist(err) {
		t.Errorf("vantare.3.log exists, want the oldest backup dropped")
	}
}

func TestRotateMovesTheOldContentIntoTheFirstBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vantare.log")
	file, err := newRotatingFile(path, 32, 2)
	if err != nil {
		t.Fatalf("newRotatingFile: %v", err)
	}
	defer file.Close()

	if _, err := file.Write([]byte("first generation line\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := file.Write([]byte("second generation line\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	backup, err := os.ReadFile(filepath.Join(dir, "vantare.1.log"))
	if err != nil {
		t.Fatalf("read backup: %v", err)
	}
	if !strings.Contains(string(backup), "first generation") {
		t.Fatalf("backup = %q, want the rotated-out content", backup)
	}
	live, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read live: %v", err)
	}
	if !strings.Contains(string(live), "second generation") {
		t.Fatalf("live log = %q, want the newest content", live)
	}
}

func TestRotatingFileAppendsToAnExistingLog(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vantare.log")
	if err := os.WriteFile(path, []byte("from a previous run\n"), 0o644); err != nil {
		t.Fatalf("seed: %v", err)
	}

	file, err := newRotatingFile(path, DefaultMaxBytes, 2)
	if err != nil {
		t.Fatalf("newRotatingFile: %v", err)
	}
	defer file.Close()
	if _, err := file.Write([]byte("from this run\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(contents), "from a previous run") {
		t.Fatalf("log = %q, want the previous run preserved", contents)
	}
}

func TestBackupPathNamesFilesBesideTheLiveOne(t *testing.T) {
	file := &rotatingFile{path: filepath.Join("logs", "vantare.log")}

	if got, want := file.backupPath(0), filepath.Join("logs", "vantare.log"); got != want {
		t.Errorf("backupPath(0) = %q, want %q", got, want)
	}
	if got, want := file.backupPath(2), filepath.Join("logs", "vantare.2.log"); got != want {
		t.Errorf("backupPath(2) = %q, want %q", got, want)
	}
}
