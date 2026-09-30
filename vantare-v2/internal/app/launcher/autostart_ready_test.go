package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestAutostartRejectsMissingProfileOrExecutable(t *testing.T) {
	root := t.TempDir()
	backend := &fakeSettingsBackend{apps: map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", LaunchMethod: "executable", ExecutablePath: filepath.Join(root, "missing.exe")},
	}, profiles: []app.LaunchProfile{{ID: "creator", Steps: []app.LaunchStep{{AppID: "obs"}}}}}
	svc := NewService(backend, &spyEmitter{}, stubChainExec)
	if err := svc.CheckAutostartProfile("gone"); !errors.Is(err, ErrProfileNotFound) {
		t.Fatalf("unknown autostart profile = %v", err)
	}
	if err := svc.CheckAutostartProfile("creator"); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("missing executable should not start a chain: %v", err)
	}
	backend.apps["obs"] = app.LauncherAppEntry{ID: "obs", LaunchMethod: "executable", ExecutablePath: root}
	if err := svc.CheckAutostartProfile("creator"); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("directory is not an executable: %v", err)
	}
	executable := filepath.Join(root, "present.exe")
	if err := os.WriteFile(executable, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	backend.apps["obs"] = app.LauncherAppEntry{ID: "obs", LaunchMethod: "executable", ExecutablePath: executable}
	if err := svc.CheckAutostartProfile("creator"); err != nil {
		t.Fatalf("existing executable path rejected before launch: %v", err)
	}
}
