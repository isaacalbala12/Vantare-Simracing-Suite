package launcher

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestSteamURIStepRequiresGameExecutableBeforeDispatch(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Steam URI launch is Windows-only")
	}
	launches := 0
	runner := NewChainRunner(sampleBackend(), &spyEmitter{}, func(string, ...string) *exec.Cmd {
		launches++
		return stubChainExec("")
	})
	runner.findRunning = func(context.Context, string) ([]ProcessInfo, error) { return nil, nil }
	result := runner.launchAndProbe(context.Background(), app.LauncherAppEntry{LaunchMethod: "steam-uri", SteamAppID: 2399420}, 0, app.LaunchStep{AppID: "lmu"}, app.LaunchProfile{ID: "p"}, time.Now())
	if result.success || launches != 0 {
		t.Fatalf("missing game executable must fail before URI dispatch: %+v, launches=%d", result, launches)
	}
}

func TestSteamURIStepReportsOnlyObservedGamePID(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Steam URI launch is Windows-only")
	}
	exe := filepath.Join(t.TempDir(), "LMU.exe")
	if err := os.WriteFile(exe, []byte("MZ"), 0o644); err != nil {
		t.Fatal(err)
	}
	emit := &spyEmitter{}
	runner := NewChainRunner(sampleBackend(), emit, stubChainExec)
	runner.findRunning = func(context.Context, string) ([]ProcessInfo, error) {
		return []ProcessInfo{{PID: 42, ExecutablePath: exe, CreationTime: 100, Alive: true}}, nil
	}
	result := runner.launchAndProbe(context.Background(), app.LauncherAppEntry{LaunchMethod: "steam-uri", SteamAppID: 2399420, ExecutablePath: exe}, 0, app.LaunchStep{AppID: "lmu"}, app.LaunchProfile{ID: "p"}, time.Now())
	launching, ok := emit.lastPayload("launcher:chain:step")
	if !ok || launching.Pid != 0 || !result.success || result.pid != 42 || result.path != "" {
		t.Fatalf("handler must not be reported or owned as game: event=%+v result=%+v", launching, result)
	}
}

func TestWaitForSteamReadyRequiresObservedGameProcess(t *testing.T) {
	runner := NewChainRunner(sampleBackend(), &spyEmitter{}, stubChainExec)
	runner.processPollInterval = time.Millisecond
	runner.steamReadyTimeout = 100 * time.Millisecond
	calls := 0
	runner.findRunning = func(context.Context, string) ([]ProcessInfo, error) {
		calls++
		if calls < 2 {
			return nil, nil
		}
		return []ProcessInfo{{PID: 42, ExecutablePath: `C:\Games\LMU.exe`, CreationTime: 100, Alive: true}}, nil
	}
	info, err := runner.waitForSteamReady(context.Background(), `C:\Games\LMU.exe`)
	if err != nil || info.PID != 42 || calls < 2 {
		t.Fatalf("Steam success needs the game process, got %+v, calls=%d, err=%v", info, calls, err)
	}
}

func TestWaitForSteamReadyRejectsOnlyURIAndMissingPath(t *testing.T) {
	runner := NewChainRunner(sampleBackend(), &spyEmitter{}, stubChainExec)
	runner.processPollInterval = time.Millisecond
	runner.steamReadyTimeout = 10 * time.Millisecond
	runner.findRunning = func(context.Context, string) ([]ProcessInfo, error) { return nil, nil }
	if _, err := runner.waitForSteamReady(context.Background(), ""); err == nil {
		t.Fatal("Steam game path is required for verification")
	}
	if _, err := runner.waitForSteamReady(context.Background(), `C:\Games\LMU.exe`); err == nil {
		t.Fatal("a dispatched URI without a game process must fail")
	}
}
