package launcher

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeSettings is a minimal in-memory SettingsBackend used by tests.
type fakeSettings struct {
	mu        sync.Mutex
	launchers map[string]LauncherConfig
}

func (f *fakeSettings) GetLaunchers() map[string]LauncherConfig {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make(map[string]LauncherConfig, len(f.launchers))
	for k, v := range f.launchers {
		out[k] = v
	}
	return out
}

func (f *fakeSettings) SetLaunchers(launchers map[string]LauncherConfig) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.launchers = make(map[string]LauncherConfig, len(launchers))
	for k, v := range launchers {
		f.launchers[k] = v
	}
	return nil
}

func TestConfigureAppliesDefaultSteamAppID(t *testing.T) {
	svc := NewService(&fakeSettings{}, nil, nil)
	got, err := svc.Configure(LauncherConfig{
		SimulatorID:  "lmu",
		LaunchMethod: "steam-uri",
	})
	if err != nil {
		t.Fatalf("Configure: %v", err)
	}
	if got.SteamAppID != DefaultLMUAppID {
		t.Errorf("expected default SteamAppID %d, got %d", DefaultLMUAppID, got.SteamAppID)
	}
	if !got.Configured || got.LaunchMethod != "steam-uri" {
		t.Errorf("unexpected status: %+v", got)
	}
}

func TestConfigurePreservesCustomSteamAppID(t *testing.T) {
	svc := NewService(&fakeSettings{}, nil, nil)
	got, err := svc.Configure(LauncherConfig{
		SimulatorID:  "lmu",
		LaunchMethod: "steam-uri",
		SteamAppID:   4242,
	})
	if err != nil {
		t.Fatalf("Configure: %v", err)
	}
	if got.SteamAppID != 4242 {
		t.Errorf("expected custom SteamAppID 4242, got %d", got.SteamAppID)
	}
}

func TestConfigureRejectsUnknownSimulator(t *testing.T) {
	svc := NewService(&fakeSettings{}, nil, nil)
	_, err := svc.Configure(LauncherConfig{
		SimulatorID:  "iracing",
		LaunchMethod: "steam-uri",
	})
	if !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("expected ErrInvalidConfig, got %v", err)
	}
}

func TestConfigureRejectsInvalidMethod(t *testing.T) {
	svc := NewService(&fakeSettings{}, nil, nil)
	_, err := svc.Configure(LauncherConfig{
		SimulatorID:  "lmu",
		LaunchMethod: "magic",
	})
	if !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("expected ErrInvalidConfig, got %v", err)
	}
}

func TestConfigureRejectsMissingExecutablePath(t *testing.T) {
	svc := NewService(&fakeSettings{}, nil, nil)
	_, err := svc.Configure(LauncherConfig{
		SimulatorID:  "lmu",
		LaunchMethod: "executable",
	})
	if !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("expected ErrInvalidConfig, got %v", err)
	}
}

func TestConfigureRejectsNonExistingExecutable(t *testing.T) {
	svc := NewService(&fakeSettings{}, nil, nil)
	_, err := svc.Configure(LauncherConfig{
		SimulatorID:    "lmu",
		LaunchMethod:   "executable",
		ExecutablePath: filepath.Join(t.TempDir(), "does-not-exist.exe"),
	})
	if !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("expected ErrInvalidConfig, got %v", err)
	}
}

func TestConfigureAcceptsExistingExecutable(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "lmu.exe")
	if err := os.WriteFile(path, []byte("dummy"), 0644); err != nil {
		t.Fatal(err)
	}
	svc := NewService(&fakeSettings{}, nil, nil)
	got, err := svc.Configure(LauncherConfig{
		SimulatorID:    "lmu",
		LaunchMethod:   "executable",
		ExecutablePath: path,
	})
	if err != nil {
		t.Fatalf("Configure: %v", err)
	}
	if got.ExecutablePath != path || !got.ExecutableOK {
		t.Errorf("unexpected status: %+v", got)
	}
}

func TestConfigurePersistsViaSettingsBackend(t *testing.T) {
	settings := &fakeSettings{}
	svc := NewService(settings, nil, nil)
	if _, err := svc.Configure(LauncherConfig{
		SimulatorID:  "lmu",
		LaunchMethod: "steam-uri",
	}); err != nil {
		t.Fatalf("Configure: %v", err)
	}
	cfg, ok := settings.GetLaunchers()["lmu"]
	if !ok {
		t.Fatal("expected lmu config to be persisted")
	}
	if cfg.SteamAppID != DefaultLMUAppID {
		t.Errorf("expected persisted SteamAppID %d, got %d", DefaultLMUAppID, cfg.SteamAppID)
	}
}

// stubExec lets tests capture the command Launch would execute without ever
// starting Steam, LMU, or a local executable. The returned command starts this
// test binary in helper-process mode, so cmd.Start/cmd.Wait exercise the real
// process path while staying hermetic.
type stubExec struct {
	calls atomic.Int32
	last  atomic.Pointer[recordedCall]
}

type recordedCall struct {
	name string
	args []string
}

func (s *stubExec) launcher(name string, args ...string) *exec.Cmd {
	s.calls.Add(1)
	s.last.Store(&recordedCall{name: name, args: append([]string(nil), args...)})
	cmdArgs := append([]string{"-test.run=TestLauncherHelperProcess", "--", name}, args...)
	cmd := exec.Command(os.Args[0], cmdArgs...)
	cmd.Env = append(os.Environ(), "VANTARE_LAUNCHER_HELPER_PROCESS=1")
	return cmd
}

func TestLauncherHelperProcess(t *testing.T) {
	if os.Getenv("VANTARE_LAUNCHER_HELPER_PROCESS") != "1" {
		return
	}
	os.Exit(0)
}

func TestLaunchWithoutConfigReturnsErrNotConfigured(t *testing.T) {
	svc := NewService(&fakeSettings{}, nil, nil)
	_, err := svc.Launch("lmu")
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func TestLaunchOnNonWindowsReturnsErrUnsupported(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("this test exercises the non-Windows branch")
	}
	settings := &fakeSettings{launchers: map[string]LauncherConfig{
		"lmu": {SimulatorID: "lmu", LaunchMethod: "steam-uri", SteamAppID: DefaultLMUAppID},
	}}
	exec := &stubExec{}
	svc := NewService(settings, nil, exec.launcher)
	_, err := svc.Launch("lmu")
	if !errors.Is(err, ErrUnsupported) {
		t.Fatalf("expected ErrUnsupported, got %v", err)
	}
	if exec.calls.Load() != 0 {
		t.Errorf("expected no exec call on non-Windows, got %d", exec.calls.Load())
	}
}

func TestLaunchWithSteamURIBuildsExpectedCommand(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("steam-uri is Windows-only")
	}
	settings := &fakeSettings{launchers: map[string]LauncherConfig{
		"lmu": {SimulatorID: "lmu", LaunchMethod: "steam-uri", SteamAppID: DefaultLMUAppID},
	}}
	exec := &stubExec{}
	svc := NewService(settings, nil, exec.launcher)
	svc.SetClock(func() time.Time { return time.Unix(1700000000, 0).UTC() })
	if _, err := svc.Launch("lmu"); err != nil {
		t.Fatalf("Launch: %v", err)
	}
	if exec.calls.Load() != 1 {
		t.Fatalf("expected 1 exec call, got %d", exec.calls.Load())
	}
	got := exec.last.Load()
	if got == nil {
		t.Fatal("expected recorded args, got nil")
	}
	if got.name != "rundll32.exe" {
		t.Errorf("expected rundll32.exe, got %q", got.name)
	}
	wantURI := "steam://run/2399420"
	if len(got.args) != 2 || got.args[0] != "url.dll,FileProtocolHandler" || got.args[1] != wantURI {
		t.Errorf("expected args to be [%q %q], got %v", "url.dll,FileProtocolHandler", wantURI, got.args)
	}
}

func TestLaunchWithExecutableBuildsExpectedCommand(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("executable launch is Windows-only in this first cut")
	}
	dir := t.TempDir()
	exe := filepath.Join(dir, "lmu.exe")
	if err := os.WriteFile(exe, []byte("dummy"), 0644); err != nil {
		t.Fatal(err)
	}
	settings := &fakeSettings{launchers: map[string]LauncherConfig{
		"lmu": {SimulatorID: "lmu", LaunchMethod: "executable", ExecutablePath: exe},
	}}
	exec := &stubExec{}
	svc := NewService(settings, nil, exec.launcher)
	if _, err := svc.Launch("lmu"); err != nil {
		t.Fatalf("Launch: %v", err)
	}
	if exec.calls.Load() != 1 {
		t.Fatalf("expected 1 exec call, got %d", exec.calls.Load())
	}
	got := exec.last.Load()
	if got == nil {
		t.Fatal("expected recorded args, got nil")
	}
	if got.name != exe {
		t.Errorf("expected executable %q, got %q", exe, got.name)
	}
}

func TestLaunchWithMissingExecutableReturnsErrExecutableMissing(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("executable launch is Windows-only in this first cut")
	}
	settings := &fakeSettings{launchers: map[string]LauncherConfig{
		"lmu": {SimulatorID: "lmu", LaunchMethod: "executable", ExecutablePath: filepath.Join(t.TempDir(), "missing.exe")},
	}}
	exec := &stubExec{}
	svc := NewService(settings, nil, exec.launcher)
	_, err := svc.Launch("lmu")
	if !errors.Is(err, ErrExecutableMissing) {
		t.Fatalf("expected ErrExecutableMissing, got %v", err)
	}
	if exec.calls.Load() != 0 {
		t.Errorf("expected no exec call when executable missing, got %d", exec.calls.Load())
	}
}

func TestGetStatusReflectsConfiguration(t *testing.T) {
	settings := &fakeSettings{launchers: map[string]LauncherConfig{
		"lmu": {SimulatorID: "lmu", LaunchMethod: "steam-uri", SteamAppID: DefaultLMUAppID},
	}}
	svc := NewService(settings, nil, nil)
	st := svc.GetStatus("lmu")
	if !st.Configured {
		t.Errorf("expected Configured=true")
	}
	if st.SteamAppID != DefaultLMUAppID {
		t.Errorf("expected SteamAppID=%d, got %d", DefaultLMUAppID, st.SteamAppID)
	}
	st2 := svc.GetStatus("nope")
	if st2.Configured {
		t.Errorf("expected Configured=false for unknown sim")
	}
}

func TestGetStatusMarksExecutableOKBasedOnFileExistence(t *testing.T) {
	dir := t.TempDir()
	existing := filepath.Join(dir, "ok.exe")
	if err := os.WriteFile(existing, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	settings := &fakeSettings{launchers: map[string]LauncherConfig{
		"lmu": {SimulatorID: "lmu", LaunchMethod: "executable", ExecutablePath: existing},
	}}
	svc := NewService(settings, nil, nil)
	st := svc.GetStatus("lmu")
	if !st.ExecutableOK {
		t.Errorf("expected ExecutableOK=true for existing file")
	}

	// Now point at a non-existing file.
	settings.launchers["lmu"] = LauncherConfig{
		SimulatorID:    "lmu",
		LaunchMethod:   "executable",
		ExecutablePath: filepath.Join(dir, "missing.exe"),
	}
	st = svc.GetStatus("lmu")
	if st.ExecutableOK {
		t.Errorf("expected ExecutableOK=false for missing file")
	}
}
