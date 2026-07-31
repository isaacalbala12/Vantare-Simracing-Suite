//go:build windows

package diagnostics

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestRawCaptureCleanupNeverFollowsWindowsJunction(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	protected := filepath.Join(outside, "protected.txt")
	if err := os.WriteFile(protected, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	junction := filepath.Join(root, "capture-junction")
	if output, err := exec.Command("cmd.exe", "/d", "/c", "mklink", "/J", junction, outside).CombinedOutput(); err != nil {
		t.Skipf("junction unavailable: %v (%s)", err, output)
	}
	t.Cleanup(func() { _ = os.Remove(junction) })

	manager, _ := NewCaptureManager(root)
	removed, err := manager.CleanExpired(context.Background(), time.Hour)
	if err != nil || removed != 0 {
		t.Fatalf("CleanExpired() = %d, %v", removed, err)
	}
	if data, err := os.ReadFile(protected); err != nil || string(data) != "keep" {
		t.Fatalf("junction target changed: %q, %v", data, err)
	}
}

func TestNewCaptureManagerRejectsWindowsJunctionParentWithoutCreatingTarget(t *testing.T) {
	base := t.TempDir()
	target := t.TempDir()
	junction := filepath.Join(base, "junction-parent")
	if output, err := exec.Command("cmd.exe", "/d", "/c", "mklink", "/J", junction, target).CombinedOutput(); err != nil {
		t.Skipf("junction unavailable: %v (%s)", err, output)
	}
	t.Cleanup(func() { _ = os.Remove(junction) })

	root := filepath.Join(junction, "captures")
	if _, err := NewCaptureManager(root); !errors.Is(err, ErrInvalidCapture) {
		t.Fatalf("NewCaptureManager() error = %v, want ErrInvalidCapture", err)
	}
	if _, err := os.Lstat(filepath.Join(target, "captures")); !os.IsNotExist(err) {
		t.Fatalf("junction target was modified: %v", err)
	}
}
