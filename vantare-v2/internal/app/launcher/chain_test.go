package launcher

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// spyEmitter records emitted events for assertions.
type spyEmitter struct {
	mu      sync.Mutex
	events  []string
	payload map[string]ChainProgress
}

func (s *spyEmitter) Emit(name string, data any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, name)
	if p, ok := data.(ChainProgress); ok {
		if s.payload == nil {
			s.payload = map[string]ChainProgress{}
		}
		s.payload[name] = p
	}
}

func (s *spyEmitter) count(name string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, e := range s.events {
		if e == name {
			n++
		}
	}
	return n
}

// stubChainExec returns a no-op command, ignoring its arguments, so tests never
// spawn Steam, LMU, or a real user executable. On Windows we use cmd /c exit 0;
// on Unix we use true.
func stubChainExec(name string, args ...string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.Command("cmd", "/c", "exit", "0")
	}
	return exec.Command("true")
}

func sampleApps() map[string]app.LauncherAppEntry {
	return map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate", LaunchMethod: "steam-uri", SteamAppID: 2399420},
		// ExecutablePath points at a binary that exists on Windows so fileExists
		// passes; the actual spawn is replaced by stubChainExec (cmd /c exit 0).
		"obs": {ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\Windows\System32\cmd.exe`},
	}
}

func TestRunChainExecutesAllSteps(t *testing.T) {
	emit := &spyEmitter{}
	apps := sampleApps()
	runner := NewChainRunner(func() map[string]app.LauncherAppEntry { return apps }, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 0},
		},
	}
	if err := runner.RunChain(context.Background(), profile); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if emit.count("launcher:chain:done") != 1 {
		t.Errorf("expected 1 chain:done, got %d", emit.count("launcher:chain:done"))
	}
	// Two steps -> two "starting" and two "started" events.
	if emit.count("launcher:chain:step") < 4 {
		t.Errorf("expected at least 4 step events (starting+started x2), got %d", emit.count("launcher:chain:step"))
	}
}

func TestRunChainCancellable(t *testing.T) {
	emit := &spyEmitter{}
	apps := sampleApps()
	runner := NewChainRunner(func() map[string]app.LauncherAppEntry { return apps }, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 10}, // long delay -> we cancel before it launches
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runner.RunChain(ctx, profile) }()

	// Wait until the first step has started, then cancel.
	for emit.count("launcher:chain:step") < 2 {
		time.Sleep(5 * time.Millisecond)
	}
	cancel()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected cancellation error, got nil")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("RunChain did not return after cancel")
	}

	// The second step must never have started (it was waiting on the delay).
	if emit.count("launcher:chain:done") != 0 {
		t.Errorf("chain must not complete after cancel")
	}
}

func TestRunChainErrorOnMissingApp(t *testing.T) {
	emit := &spyEmitter{}
	apps := sampleApps()
	runner := NewChainRunner(func() map[string]app.LauncherAppEntry { return apps }, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "p", Name: "P",
		Steps: []app.LaunchStep{{AppID: "ghost", Delay: 0}},
	}
	err := runner.RunChain(context.Background(), profile)
	if err == nil {
		t.Fatal("expected error for missing app")
	}
	if emit.count("launcher:chain:error") != 1 {
		t.Errorf("expected 1 chain:error event, got %d", emit.count("launcher:chain:error"))
	}
}

func TestRunChainErrorOnMissingExecutable(t *testing.T) {
	emit := &spyEmitter{}
	apps := map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\nope\missing.exe`},
	}
	runner := NewChainRunner(func() map[string]app.LauncherAppEntry { return apps }, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "p", Name: "P",
		Steps: []app.LaunchStep{{AppID: "obs", Delay: 0}},
	}
	err := runner.RunChain(context.Background(), profile)
	if err == nil {
		t.Fatal("expected error for missing executable")
	}
	if !errors.Is(err, ErrExecutableMissing) {
		t.Errorf("expected ErrExecutableMissing, got %v", err)
	}
	if emit.count("launcher:chain:error") != 1 {
		t.Errorf("expected 1 chain:error event, got %d", emit.count("launcher:chain:error"))
	}
}

func TestCancelChain(t *testing.T) {
	emit := &spyEmitter{}
	var mu sync.Mutex
	apps := sampleApps()
	runner := NewChainRunner(func() map[string]app.LauncherAppEntry {
		mu.Lock()
		defer mu.Unlock()
		return apps
	}, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 10}, {AppID: "obs", Delay: 10}},
	}
	runner.StartChain(context.Background(), profile)

	// Give the goroutine time to register the cancel func.
	time.Sleep(20 * time.Millisecond)
	if !runner.CancelChain("creator") {
		t.Fatal("CancelChain should return true for an active chain")
	}
	// A second cancel must report no active chain.
	if runner.CancelChain("creator") {
		t.Error("CancelChain should return false after cancellation")
	}
}

func TestRunChainDefensiveCopy(t *testing.T) {
	emit := &spyEmitter{}
	mu := sync.Mutex{}
	apps := sampleApps()
	runner := NewChainRunner(func() map[string]app.LauncherAppEntry {
		mu.Lock()
		defer mu.Unlock()
		return apps
	}, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 2}, // long enough to mutate source concurrently
		},
	}

	done := make(chan error, 1)
	go func() { done <- runner.RunChain(context.Background(), profile) }()

	// Concurrently mutate the source map while the chain runs. The snapshot
	// taken at RunChain start must keep the chain stable; with -race this would
	// flag a data race if we read the live map.
	for range 50 {
		mu.Lock()
		delete(apps, "obs")
		apps["obs"] = sampleApps()["obs"]
		mu.Unlock()
		time.Sleep(2 * time.Millisecond)
	}

	if err := <-done; err != nil {
		t.Fatalf("chain should complete despite concurrent source mutation: %v", err)
	}
	if emit.count("launcher:chain:done") != 1 {
		t.Errorf("expected chain to complete normally, got %d done events", emit.count("launcher:chain:done"))
	}
}
