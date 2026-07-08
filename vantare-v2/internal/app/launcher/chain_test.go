package launcher

import (
	"context"
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

func (s *spyEmitter) lastPayload(name string) (ChainProgress, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.payload[name]
	return p, ok
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

// stubFailingExec returns a command that exits immediately with code 1.
func stubFailingExec(name string, args ...string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.Command("cmd", "/c", "exit", "1")
	}
	return exec.Command("false")
}

// stubSlowExec returns a command that sleeps for ~100ms then exits with code 0.
func stubSlowExec(name string, args ...string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		// ping -n 2 127.0.0.1 >nul takes ~1s; we want ~100ms.
		return exec.Command("cmd", "/c", "ping", "-n", "1", "-w", "100", "192.0.2.1", ">nul", "&", "exit", "0")
	}
	return exec.Command("sleep", "0.1")
}

func sampleApps() map[string]app.LauncherAppEntry {
	return map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate", LaunchMethod: "steam-uri", SteamAppID: 2399420},
		// ExecutablePath points at a binary that exists on Windows so fileExists
		// passes; the actual spawn is replaced by stubChainExec (cmd /c exit 0).
		"obs": {ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\Windows\System32\cmd.exe`},
	}
}

// sampleBackend returns a fakeProfilesBackend pre-loaded with sample apps and
// an empty profile list.
func sampleBackend() *fakeProfilesBackend {
	return &fakeProfilesBackend{
		apps:     sampleApps(),
		profiles: nil,
	}
}

// lockingAppsBackend wraps fakeProfilesBackend with a mutex over
// GetLauncherApps so tests can safely mutate the app map concurrently.
type lockingAppsBackend struct {
	*fakeProfilesBackend
	mu sync.Mutex
}

func (b *lockingAppsBackend) GetLauncherApps() map[string]app.LauncherAppEntry {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.fakeProfilesBackend.GetLauncherApps()
}

func TestRunChainDoneEventHasSuccessField(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 0},
		},
	}
	runner.RunChain(context.Background(), profile)

	p, ok := emit.lastPayload("launcher:chain:done")
	if !ok {
		t.Fatal("expected chain:done payload")
	}
	if !p.Success {
		t.Error("expected chain:done.Success to be true when all steps succeed")
	}
}

func TestRunChainDoneEventHasSuccessFalseOnFailure(t *testing.T) {
	emit := &spyEmitter{}
	backend := &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"obs": {ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\nope\missing.exe`},
		},
	}
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "p", Name: "P",
		Steps: []app.LaunchStep{{AppID: "obs", Delay: 0}},
	}
	runner.RunChain(context.Background(), profile)

	p, ok := emit.lastPayload("launcher:chain:done")
	if !ok {
		t.Fatal("expected chain:done payload")
	}
	if p.Success {
		t.Error("expected chain:done.Success to be false when a step fails")
	}
}

// ---------------------------------------------------------------------------
// Existing tests adapted to the new NewChainRunner signature
// ---------------------------------------------------------------------------

func TestRunChainExecutesAllSteps(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 0},
		},
	}
	runner.RunChain(context.Background(), profile)

	if emit.count("launcher:chain:done") != 1 {
		t.Errorf("expected 1 chain:done, got %d", emit.count("launcher:chain:done"))
	}
	// Two steps → at least: pending + launching + done|failed for each = 6 events.
	if emit.count("launcher:chain:step") < 6 {
		t.Errorf("expected at least 6 step events, got %d", emit.count("launcher:chain:step"))
	}
}

func TestRunChainCancellable(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 10}, // long delay → we cancel before it launches
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		runner.RunChain(ctx, profile)
		close(done)
	}()

	// Wait until the first step has fully completed (3 events: pending, launching, done).
	for emit.count("launcher:chain:step") < 3 {
		time.Sleep(5 * time.Millisecond)
	}
	cancel()

	select {
	case <-done:
		// RunChain returned — that's what we expect.
	case <-time.After(3 * time.Second):
		t.Fatal("RunChain did not return after cancel")
	}

	// The second step must have emitted "pending" but never "done" or "failed".
	// Total step events: 3 from step 0 + 1 pending from step 1 = 4 max.
	if n := emit.count("launcher:chain:step"); n > 4 {
		t.Errorf("expected at most 4 step events (3 for step0 + 1 pending for step1), got %d", n)
	}

	// chain:done must be emitted (RunChain always emits it).
	if emit.count("launcher:chain:done") != 1 {
		t.Errorf("expected 1 chain:done after cancellation, got %d", emit.count("launcher:chain:done"))
	}
}

func TestRunChainErrorOnMissingApp(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "p", Name: "P",
		Steps: []app.LaunchStep{{AppID: "ghost", Delay: 0}},
	}
	runner.RunChain(context.Background(), profile)

	// The step must have been emitted as "failed".
	p, ok := emit.lastPayload("launcher:chain:step")
	if !ok {
		t.Fatal("expected chain:step payload")
	}
	if p.Status != "failed" {
		t.Errorf("expected step status 'failed', got %q", p.Status)
	}
}

func TestRunChainErrorOnMissingExecutable(t *testing.T) {
	emit := &spyEmitter{}
	backend := &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"obs": {ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\nope\missing.exe`},
		},
	}
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "p", Name: "P",
		Steps: []app.LaunchStep{{AppID: "obs", Delay: 0}},
	}

	// RunChain returns; we verify the step was marked "failed".
	runner.RunChain(context.Background(), profile)

	// Expect at least: pending + (no launching because fileExists fails) + failed
	if n := emit.count("launcher:chain:step"); n < 2 {
		t.Errorf("expected at least 2 step events (pending + failed), got %d", n)
	}
	// The step payload should have status "failed".
	if p, ok := emit.lastPayload("launcher:chain:step"); ok {
		if p.Status != "failed" {
			t.Errorf("expected step status 'failed', got %q", p.Status)
		}
	}
}

func TestCancelChain(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

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
	backend := &lockingAppsBackend{
		fakeProfilesBackend: &fakeProfilesBackend{
			apps: sampleApps(),
		},
	}
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 2}, // long enough to mutate source concurrently
		},
	}

	done := make(chan struct{})
	go func() {
		runner.RunChain(context.Background(), profile)
		close(done)
	}()

	// Concurrently mutate the source map while the chain runs. The snapshot
	// taken at RunChain start must keep the chain stable; with -race this would
	// flag a data race if we read the live map.
	for range 50 {
		backend.mu.Lock()
		delete(backend.fakeProfilesBackend.apps, "obs")
		backend.fakeProfilesBackend.apps["obs"] = sampleApps()["obs"]
		backend.mu.Unlock()
		time.Sleep(2 * time.Millisecond)
	}

	<-done
	if emit.count("launcher:chain:done") != 1 {
		t.Errorf("expected chain to complete normally, got %d done events", emit.count("launcher:chain:done"))
	}
}

// ---------------------------------------------------------------------------
// New tests for Task 4.2
// ---------------------------------------------------------------------------

func TestChainRunnerMeasuresWallClock(t *testing.T) {
	if runtime.GOOS == "linux" && testing.Short() {
		t.Skip("slow exec stub not suitable for short test on Linux")
	}
	emit := &spyEmitter{}
	backend := &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"slow": {ID: "slow", DisplayName: "Slow App", LaunchMethod: "executable", ExecutablePath: `C:\Windows\System32\cmd.exe`},
		},
	}
	runner := NewChainRunner(backend, emit, stubSlowExec)

	profile := app.LaunchProfile{
		ID: "p", Name: "P",
		Steps: []app.LaunchStep{{AppID: "slow", Delay: 0}},
	}
	runner.RunChain(context.Background(), profile)

	// The last "launcher:chain:step" payload should be "done" with timing.
	p, ok := emit.lastPayload("launcher:chain:step")
	if !ok {
		t.Fatal("expected at least one chain:step payload")
	}
	if p.Status != "done" {
		t.Fatalf("expected step status 'done', got %q", p.Status)
	}
	if p.StartedAt == 0 {
		t.Error("StartedAt must be non-zero")
	}
	if p.FinishedAt == 0 {
		t.Error("FinishedAt must be non-zero")
	}
	if p.FinishedAt < p.StartedAt {
		t.Errorf("FinishedAt (%d) must be >= StartedAt (%d)", p.FinishedAt, p.StartedAt)
	}
	// Verify at least 50ms wall clock.
	if p.FinishedAt-p.StartedAt < 50 {
		t.Errorf("wall clock too short: finishedAt-startedAt=%dms, expected >= 50ms", p.FinishedAt-p.StartedAt)
	}
}

func TestChainRunnerCancellationStopsAtStepBoundary(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},  // immediate (steam-uri → instant done)
			{AppID: "obs", Delay: 10}, // long delay → we cancel before it launches
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		runner.RunChain(ctx, profile)
		close(done)
	}()

	// Wait for step 0 to fully complete (3 events: pending + launching + done).
	for emit.count("launcher:chain:step") < 3 {
		time.Sleep(5 * time.Millisecond)
	}
	cancel()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("RunChain did not return after cancel")
	}

	// Step 0 completed (3 events). Step 1 emitted "pending" (1 event).
	// Total should be exactly 4.
	if n := emit.count("launcher:chain:step"); n != 4 {
		t.Errorf("expected exactly 4 step events (3 for step0 + 1 pending for step1), got %d", n)
	}

	// chain:done must be emitted (RunChain always emits it).
	if emit.count("launcher:chain:done") != 1 {
		t.Errorf("expected 1 chain:done, got %d", emit.count("launcher:chain:done"))
	}
}

func TestChainRunnerRejectsDoubleLaunch(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

	// Use two steps so the chain stays alive (step 1 has a long delay) while
	// we try the second StartChain.
	profile := app.LaunchProfile{
		ID: "pro", Name: "Pro",
		Steps: []app.LaunchStep{
			{AppID: "lmu", Delay: 0},
			{AppID: "obs", Delay: 30}, // keeps the chain alive
		},
	}

	// First launch starts the chain (step 0 completes instantly, step 1 waits).
	runner.StartChain(context.Background(), profile)
	time.Sleep(20 * time.Millisecond) // let the goroutine register in active map

	// Second launch for the same profileID must be rejected.
	runner.StartChain(context.Background(), profile)

	// Verify the error event was emitted.
	if emit.count("launcher:chain:error") != 1 {
		t.Errorf("expected 1 chain:error for double launch, got %d", emit.count("launcher:chain:error"))
	}
	// Check the error message.
	if p, ok := emit.lastPayload("launcher:chain:error"); ok {
		if p.Message != "perfil ya en curso" {
			t.Errorf("expected message 'perfil ya en curso', got %q", p.Message)
		}
	}

	// Cancel the first chain so the goroutine doesn't keep running.
	runner.CancelChain("pro")
}

func TestChainRunnerFailureDoesNotUpdateAvgButUpdatesCount(t *testing.T) {
	backend := sampleBackend()
	backend.profiles = []app.LaunchProfile{
		{ID: "pro", Name: "Pro", Steps: []app.LaunchStep{{AppID: "obs", Delay: 0}}},
	}
	emit := &spyEmitter{}
	runner := NewChainRunner(backend, emit, stubFailingExec)

	profile := backend.profiles[0]
	runner.RunChain(context.Background(), profile)

	// RecordProfileAttempt must have been called → LaunchCount incremented.
	profiles := backend.GetLauncherProfiles()
	if len(profiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(profiles))
	}
	if profiles[0].LaunchCount != 1 {
		t.Errorf("expected LaunchCount=1 after attempt, got %d", profiles[0].LaunchCount)
	}
	if profiles[0].LastLaunchedAt == nil {
		t.Error("LastLaunchedAt should be set after attempt")
	}

	// RecordProfileSuccess must NOT have been called → AvgChainDurationMs is 0.
	if profiles[0].AvgChainDurationMs != 0 {
		t.Errorf("expected AvgChainDurationMs=0 (unset) on failure, got %d", profiles[0].AvgChainDurationMs)
	}
}

func TestChainRunnerLivenessProbeCatchesCrash(t *testing.T) {
	emit := &spyEmitter{}
	backend := &fakeProfilesBackend{
		apps: map[string]app.LauncherAppEntry{
			"crash": {ID: "crash", DisplayName: "Crash App", LaunchMethod: "executable", ExecutablePath: `C:\Windows\System32\cmd.exe`},
		},
		profiles: nil,
	}
	runner := NewChainRunner(backend, emit, stubFailingExec)

	profile := app.LaunchProfile{
		ID: "p", Name: "P",
		Steps: []app.LaunchStep{{AppID: "crash", Delay: 0}},
	}
	runner.RunChain(context.Background(), profile)

	// Check that the chain:done was emitted (RunChain always emits it).
	if emit.count("launcher:chain:done") != 1 {
		t.Errorf("expected 1 chain:done, got %d", emit.count("launcher:chain:done"))
	}

	// The last chain:step payload must have status "failed".
	p, ok := emit.lastPayload("launcher:chain:step")
	if !ok {
		t.Fatal("expected at least one chain:step payload")
	}
	if p.Status != "failed" {
		t.Errorf("expected step status 'failed', got %q", p.Status)
	}
	// The message should mention the exit code or that the process failed.
	if p.Message == "" {
		t.Error("expected non-empty Message on crash")
	}
}

// ---------------------------------------------------------------------------
// Verify CancelAll cancels all active chains.
// ---------------------------------------------------------------------------

func TestCancelAllCancelsAll(t *testing.T) {
	emit := &spyEmitter{}
	backend := sampleBackend()
	runner := NewChainRunner(backend, emit, stubChainExec)

	// Start two chains with different profiles.
	p1 := app.LaunchProfile{
		ID: "p1", Name: "P1",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 30}},
	}
	p2 := app.LaunchProfile{
		ID: "p2", Name: "P2",
		Steps: []app.LaunchStep{{AppID: "obs", Delay: 30}},
	}
	runner.StartChain(context.Background(), p1)
	runner.StartChain(context.Background(), p2)

	time.Sleep(20 * time.Millisecond) // let goroutines register

	// CancelAll must cancel both.
	runner.CancelAll()

	// Neither chain should be active anymore.
	if runner.CancelChain("p1") {
		t.Error("p1 should not be active after CancelAll")
	}
	if runner.CancelChain("p2") {
		t.Error("p2 should not be active after CancelAll")
	}
}
