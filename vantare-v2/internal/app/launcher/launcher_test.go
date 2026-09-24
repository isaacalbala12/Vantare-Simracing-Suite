package launcher

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// fakeSettingsBackend is an in-memory LauncherSettingsBackend for the
// orchestrator tests. It keeps apps and profiles isolated and persists every
// write so the Service can round-trip through it exactly like production.
type fakeSettingsBackend struct {
	apps     map[string]app.LauncherAppEntry
	profiles []app.LaunchProfile
}

func (f *fakeSettingsBackend) GetLauncherApps() map[string]app.LauncherAppEntry {
	out := make(map[string]app.LauncherAppEntry, len(f.apps))
	for k, v := range f.apps {
		out[k] = v
	}
	return out
}

func (f *fakeSettingsBackend) SetLauncherApps(apps map[string]app.LauncherAppEntry) error {
	f.apps = make(map[string]app.LauncherAppEntry, len(apps))
	for k, v := range apps {
		f.apps[k] = v
	}
	return nil
}

func (f *fakeSettingsBackend) GetLauncherProfiles() []app.LaunchProfile {
	out := make([]app.LaunchProfile, len(f.profiles))
	copy(out, f.profiles)
	return out
}

func (f *fakeSettingsBackend) SetLauncherProfiles(profiles []app.LaunchProfile) error {
	f.profiles = make([]app.LaunchProfile, len(profiles))
	copy(f.profiles, profiles)
	return nil
}

// hasEvent reports whether the shared spyEmitter recorded an event by name.
func hasEvent(s *spyEmitter, name string) bool {
	for _, e := range s.events {
		if e == name {
			return true
		}
	}
	return false
}

func testContext() context.Context { return context.Background() }

func newBackendWithLMU() *fakeSettingsBackend {
	return &fakeSettingsBackend{
		apps: map[string]app.LauncherAppEntry{
			"lmu": {
				ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
				Category: app.AppCategorySimulator, LaunchMethod: "steam-uri", SteamAppID: 2399420,
			},
		},
	}
}

func TestDiscoverAppsMergesWithoutLegacyEvents(t *testing.T) {
	backend := newBackendWithLMU()
	backend.apps["custom"] = app.LauncherAppEntry{ID: "custom", DisplayName: "My App", Detected: false}
	emitter := &spyEmitter{}
	svc := NewService(backend, emitter, nil)

	apps, err := svc.DiscoverApps()
	if err != nil {
		t.Fatalf("DiscoverApps: %v", err)
	}
	// Manual app preserved, detected apps merged in.
	appsByID := map[string]app.LauncherAppEntry{}
	for _, a := range apps {
		appsByID[a.ID] = a
	}
	if _, ok := appsByID["custom"]; !ok {
		t.Fatal("manual app must be preserved across discovery")
	}
	if _, ok := appsByID["lmu"]; !ok {
		t.Fatal("lmu must be present after discovery")
	}
	// The icon phase reports once per app, so the event count tracks the app
	// count rather than being fixed. What the UI depends on is the shape:
	// discovery-progress events only, never going backwards, ending at a
	// complete 100% that clears the scanning flag.
	for _, name := range emitter.events {
		if name != "launcher:discovery:progress" {
			t.Fatalf("discovery must emit only progress events, got %v", emitter.events)
		}
	}
	if len(emitter.discovery) == 0 {
		t.Fatal("expected at least one discovery progress payload")
	}
	previous := -1
	for _, event := range emitter.discovery {
		if event.Progress < previous {
			t.Fatalf("progress must not go backwards, got %+v", emitter.discovery)
		}
		previous = event.Progress
	}
	last := emitter.discovery[len(emitter.discovery)-1]
	if last.Progress != 100 || last.Phase != DiscoveryComplete || last.Scanning {
		t.Fatalf("discovery must finish at a complete 100%%, got %+v", last)
	}
	if snapshot := svc.Snapshot(); snapshot.Discovery.LastScanAt == nil || snapshot.Discovery.Scanning {
		t.Fatalf("discovery snapshot must be complete after a successful scan: %+v", snapshot.Discovery)
	}
}

func TestDiscoveryProgressDoesNotRegressWhenWorkersFinishOutOfOrder(t *testing.T) {
	emitter := &spyEmitter{}
	svc := NewService(newBackendWithLMU(), emitter, nil)
	svc.BeginDiscovery()
	svc.emitDiscoveryProgress(81, DiscoveryResolvingIcons, true, nil)
	svc.emitDiscoveryProgress(78, DiscoveryResolvingIcons, true, nil)
	emitter.mu.Lock()
	defer emitter.mu.Unlock()
	if got := emitter.discovery[1].Progress; got != 81 {
		t.Fatalf("later worker regressed progress to %d", got)
	}
}

func TestServiceSnapshotTracksActiveChainProgress(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "lmu", Status: "ready", Pid: 42})
	snapshot := svc.Snapshot()
	if len(snapshot.ActiveChains) != 1 {
		t.Fatalf("expected one active chain, got %+v", snapshot.ActiveChains)
	}
	if snapshot.ActiveChains[0].Steps[0].PID != 42 || snapshot.ActiveChains[0].Status != "running" {
		t.Fatalf("unexpected active chain state: %+v", snapshot.ActiveChains[0])
	}
}

func TestServiceOnlyOwnsPIDsFromItsLaunchEvents(t *testing.T) {
	backend := newBackendWithLMU()
	backend.apps["obs"] = app.LauncherAppEntry{ID: "obs", LaunchMethod: "executable", ExecutablePath: `C:\Apps\OBS\obs64.exe`}
	svc := NewService(backend, &spyEmitter{}, nil)
	if svc.OwnsStartedProcess("obs", 42) {
		t.Fatal("arbitrary PID must not be owned")
	}
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "obs", Status: "launching", Pid: 42, ProcessPath: `C:\Apps\OBS\obs64.exe`, CreationTime: 100})
	if svc.OwnsStartedProcess("obs", 42) {
		t.Fatal("an unprobed launch must not authorize close")
	}
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "obs", Status: "failed", Pid: 42, ProcessPath: `C:\Apps\OBS\obs64.exe`, CreationTime: 100})
	if svc.OwnsStartedProcess("obs", 42) {
		t.Fatal("failed launch must not authorize process termination")
	}
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "steam", StepIndex: 0, AppID: "lmu", Status: "done", Pid: 43, ProcessPath: `C:\Windows\System32\rundll32.exe`, CreationTime: 300})
	if svc.OwnsStartedProcess("lmu", 43) {
		t.Fatal("Steam URI handler PID is not the game and must never authorize close")
	}
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "other", StepIndex: 0, AppID: "obs", Status: "done", Pid: 44, ProcessPath: `C:\Other\obs64.exe`, CreationTime: 400})
	if svc.OwnsStartedProcess("obs", 44) {
		t.Fatal("a different executable path must not become owned")
	}
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "obs", Status: "done", Pid: 42, ProcessPath: `C:\Apps\OBS\obs64.exe`, CreationTime: 100})
	identity, owned := svc.OwnedProcessIdentity("obs", 42)
	if !owned || identity.CreationTime != 100 || svc.OwnsStartedProcess("lmu", 42) {
		t.Fatalf("ownership must retain verified app, PID, path and creation time, got %+v owned=%v", identity, owned)
	}
	svc.activeMu.Lock()
	delete(svc.active, "creator")
	svc.activeMu.Unlock()
	if !svc.OwnsStartedProcess("obs", 42) {
		t.Fatal("snapshot cleanup must not discard process ownership")
	}
	svc.ForgetStartedProcess("obs", 42)
	if svc.OwnsStartedProcess("obs", 42) {
		t.Fatal("closed process must lose ownership")
	}
	if svc.RememberStartedProcess("obs", ProcessIdentity{PID: 55, ExecutablePath: `C:\Other\obs64.exe`, CreationTime: 500}) {
		t.Fatal("restart with an unrelated executable must not become owned")
	}
	if svc.RememberStartedProcess("obs", ProcessIdentity{PID: 55, ExecutablePath: `C:\Apps\OBS\obs64.exe`}) {
		t.Fatal("restart without a creation time must not become owned")
	}
	if !svc.RememberStartedProcess("obs", ProcessIdentity{PID: 55, ExecutablePath: `C:\Apps\OBS\obs64.exe`, CreationTime: 500}) || !svc.OwnsStartedProcess("obs", 55) {
		t.Fatal("a confirmed restarted process must remain controllable")
	}
}

func TestAddManualAppPersistsAndIsVisible(t *testing.T) {
	backend := newBackendWithLMU()
	emitter := &spyEmitter{}
	svc := NewService(backend, emitter, nil)

	entry := app.LauncherAppEntry{
		ID: "crewchief", DisplayName: "CrewChief", Abbreviation: "CC",
		Category: app.AppCategoryAudio, LaunchMethod: "executable", ExecutablePath: `C:\crewchief.exe`,
	}
	if err := svc.AddManualApp(entry); err != nil {
		t.Fatalf("AddManualApp: %v", err)
	}
	if _, ok := backend.GetLauncherApps()["crewchief"]; !ok {
		t.Fatal("added app not persisted")
	}
}

func TestAddManualAppRejectsBadEntry(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	// Missing displayName -> ErrInvalidConfig via apps.go.
	if err := svc.AddManualApp(app.LauncherAppEntry{ID: "x", LaunchMethod: "executable", ExecutablePath: "p"}); err == nil {
		t.Fatal("expected error on missing displayName")
	}
}

func TestRemoveAppRefusesWhenUsedByProfile(t *testing.T) {
	backend := newBackendWithLMU()
	backend.profiles = []app.LaunchProfile{
		{ID: "pro", Name: "Pro", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}},
	}
	svc := NewService(backend, &spyEmitter{}, nil)
	if err := svc.RemoveApp("lmu"); err == nil {
		t.Fatal("expected error removing app used by a profile")
	}
	if _, ok := backend.GetLauncherApps()["lmu"]; !ok {
		t.Fatal("app must remain after blocked removal")
	}
}

func TestRemoveAppDeletesWhenUnused(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	if err := svc.RemoveApp("lmu"); err != nil {
		t.Fatalf("RemoveApp: %v", err)
	}
	if _, ok := backend.GetLauncherApps()["lmu"]; ok {
		t.Fatal("app should be gone after removal")
	}
}

func TestProfilesCRUDRoundTrip(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)

	profile := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido", Description: "streaming",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 2}},
	}
	if err := svc.SaveProfile(profile); err != nil {
		t.Fatalf("SaveProfile: %v", err)
	}
	if got := svc.ListProfiles(); len(got) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(got))
	}
	if err := svc.DeleteProfile("creator"); err != nil {
		t.Fatalf("DeleteProfile: %v", err)
	}
	if got := svc.ListProfiles(); len(got) != 0 {
		t.Fatalf("expected 0 profiles after delete, got %d", len(got))
	}
}

func TestAlreadyRunningDecisionCanBeRemembered(t *testing.T) {
	backend := newBackendWithLMU()
	backend.profiles = []app.LaunchProfile{{ID: "creator", Name: "Creator", Steps: []app.LaunchStep{{AppID: "lmu"}}}}
	emit := &decisionEmitter{requests: make(chan DecisionRequest, 1)}
	svc := NewService(backend, emit, nil)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	done := make(chan string, 1)
	go func() {
		done <- svc.chain.requestDecision(ctx, "creator", "lmu", "alreadyRunning", "already open", []string{"reuse", "cancel"})
	}()
	var request DecisionRequest
	select {
	case request = <-emit.requests:
	case <-ctx.Done():
		t.Fatal("running decision was not requested")
	}
	_, remembered, err := svc.ResolveDecision(request.DecisionID, "reuse", true)
	if err != nil || !remembered {
		t.Fatalf("remembered decision failed: remembered=%v err=%v", remembered, err)
	}
	select {
	case got := <-done:
		if got != "reuse" {
			t.Fatalf("chain received %q", got)
		}
	case <-ctx.Done():
		t.Fatal("running decision did not resume")
	}
	if got := app.NormalizeLaunchPolicy(svc.ListProfiles()[0].Policy).AlreadyRunning; got != app.AlreadyRunningReuse {
		t.Fatalf("remembered running policy = %q", got)
	}
}

func TestLaunchProfileRejectsEmptyChain(t *testing.T) {
	backend := newBackendWithLMU()
	backend.profiles = []app.LaunchProfile{{ID: "empty", Name: "Empty"}}
	svc := NewService(backend, &spyEmitter{}, nil)
	if err := svc.LaunchProfile(context.Background(), "empty"); err == nil {
		t.Fatal("empty chain must not report a successful launch")
	}
}

func TestRetryProfileSelectsFailedAndUnattemptedSteps(t *testing.T) {
	profile := app.LaunchProfile{
		ID: "creator", Name: "Creator",
		Policy: &app.LaunchPolicy{FirstStepDelay: 7},
		Steps:  []app.LaunchStep{{AppID: "lmu"}, {AppID: "obs", Delay: 2}, {AppID: "crewchief", Delay: 3}},
	}
	completed := LauncherActiveChain{ProfileID: "creator", Status: "failed", Steps: []LauncherActiveStep{
		{AppID: "lmu", Status: "done"},
		{AppID: "obs", Status: "failed"},
	}}
	retry, indices, err := retryProfile(profile, completed)
	if err != nil {
		t.Fatal(err)
	}
	if len(retry.Steps) != 2 || retry.Steps[0].AppID != "obs" || retry.Steps[1].AppID != "crewchief" {
		t.Fatalf("retry launched completed or omitted pending steps: %+v", retry.Steps)
	}
	if len(indices) != 2 || indices[0] != 1 || indices[1] != 2 {
		t.Fatalf("retry lost original step positions: %v", indices)
	}
	if retry.Policy.FirstStepDelay != 2 {
		t.Fatalf("first retried step must keep its configured delay, got %d", retry.Policy.FirstStepDelay)
	}
}

func TestRetryFailedProfileStartsOnlyPendingSteps(t *testing.T) {
	backend := newBackendWithLMU()
	backend.apps["obs"] = app.LauncherAppEntry{ID: "obs", DisplayName: "OBS", LaunchMethod: "executable", ExecutablePath: `C:\Windows\System32\cmd.exe`}
	backend.profiles = []app.LaunchProfile{{
		ID: "creator", Name: "Creator", Steps: []app.LaunchStep{{AppID: "lmu"}, {AppID: "obs"}},
	}}
	emit := &blockingStepEmitter{entered: make(chan struct{}), release: make(chan struct{})}
	svc := NewService(backend, emit, stubChainExec)
	svc.recordChainEvent("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "lmu", Status: "done"})
	svc.recordChainEvent("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 1, AppID: "obs", Status: "failed"})
	svc.recordChainEvent("launcher:chain:done", ChainProgress{ProfileID: "creator", Success: false})
	if err := svc.RetryFailedProfile(context.Background(), "creator"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-emit.entered:
	case <-time.After(time.Second):
		close(emit.release)
		t.Fatal("retry chain did not emit pending step")
	}
	snapshot := svc.Snapshot()
	if len(snapshot.ActiveChains) != 1 || len(snapshot.ActiveChains[0].Steps) != 2 || snapshot.ActiveChains[0].Steps[0].AppID != "lmu" || snapshot.ActiveChains[0].Steps[0].Status != "done" || snapshot.ActiveChains[0].Steps[1].AppID != "obs" {
		t.Fatalf("retry must start fresh with only the failed app, got %+v", snapshot.ActiveChains)
	}
	close(emit.release)
	svc.CancelAll()
}

func TestDuplicateLaunchDoesNotFailRunningSnapshot(t *testing.T) {
	backend := newBackendWithLMU()
	backend.profiles = []app.LaunchProfile{{
		ID: "creator", Name: "Creator", Policy: &app.LaunchPolicy{FirstStepDelay: 30},
		Steps: []app.LaunchStep{{AppID: "lmu"}},
	}}
	emit := &blockingStepEmitter{entered: make(chan struct{}), release: make(chan struct{})}
	svc := NewService(backend, emit, stubChainExec)
	if err := svc.LaunchProfile(context.Background(), "creator"); err != nil {
		t.Fatal(err)
	}
	defer func() { close(emit.release); svc.CancelAll() }()
	select {
	case <-emit.entered:
	case <-time.After(time.Second):
		t.Fatal("first chain did not start")
	}
	if err := svc.LaunchProfile(context.Background(), "creator"); !errors.Is(err, ErrProfileInProgress) {
		t.Fatalf("duplicate launch must report active profile, got %v", err)
	}
	chains := svc.Snapshot().ActiveChains
	if len(chains) != 1 || chains[0].ProfileID != "creator" || chains[0].Status != "running" {
		t.Fatalf("duplicate launch changed the running chain: %+v", chains)
	}
}

func TestRepeatedRetryUsesLastAttemptInsteadOfFullProfile(t *testing.T) {
	backend := newBackendWithLMU()
	backend.apps["obs"] = app.LauncherAppEntry{ID: "obs", DisplayName: "OBS", LaunchMethod: "executable", ExecutablePath: `C:\Windows\System32\cmd.exe`}
	backend.apps["crewchief"] = app.LauncherAppEntry{ID: "crewchief", DisplayName: "CrewChief", LaunchMethod: "executable", ExecutablePath: `C:\Windows\System32\cmd.exe`}
	backend.profiles = []app.LaunchProfile{{ID: "creator", Name: "Creator", Steps: []app.LaunchStep{{AppID: "lmu"}, {AppID: "obs"}, {AppID: "crewchief"}}}}
	emit := &blockingStepEmitter{entered: make(chan struct{}), release: make(chan struct{})}
	svc := NewService(backend, emit, stubChainExec)
	svc.recordChainEvent("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "lmu", Status: "done"})
	svc.recordChainEvent("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 1, AppID: "obs", Status: "done"})
	svc.recordChainEvent("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 2, AppID: "crewchief", Status: "failed"})
	svc.recordChainEvent("launcher:chain:done", ChainProgress{ProfileID: "creator", Success: false})
	if err := svc.RetryFailedProfile(context.Background(), "creator"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-emit.entered:
	case <-time.After(time.Second):
		close(emit.release)
		t.Fatal("second retry did not start")
	}
	chains := svc.Snapshot().ActiveChains
	if len(chains) != 1 || len(chains[0].Steps) != 3 || chains[0].Steps[0].Status != "done" || chains[0].Steps[1].Status != "done" || chains[0].Steps[2].AppID != "crewchief" {
		t.Fatalf("second retry relaunched earlier completed apps: %+v", chains)
	}
	close(emit.release)
	svc.CancelAll()
}

func TestDuplicateProfileThroughService(t *testing.T) {
	backend := newBackendWithLMU()
	backend.apps["obs"] = app.LauncherAppEntry{ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: "C:/obs.exe"}
	svc := NewService(backend, &spyEmitter{}, nil)

	src := app.LaunchProfile{
		ID: "creator", Name: "Creador de Contenido", Description: "LMU+OBS",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}, {AppID: "obs", Delay: 2}},
	}
	if err := svc.SaveProfile(src); err != nil {
		t.Fatalf("seed: %v", err)
	}

	t.Run("happy path clones and is independent", func(t *testing.T) {
		if err := svc.DuplicateProfile("creator", "creator-copy", "Creador (copia)"); err != nil {
			t.Fatalf("DuplicateProfile: %v", err)
		}
		got := svc.ListProfiles()
		if len(got) != 2 {
			t.Fatalf("expected 2 profiles, got %d", len(got))
		}
		var dup *app.LaunchProfile
		for i := range got {
			if got[i].ID == "creator-copy" {
				dup = &got[i]
				break
			}
		}
		if dup == nil {
			t.Fatal("duplicate profile not found")
		}
		if dup.Name != "Creador (copia)" {
			t.Errorf("unexpected name: %q", dup.Name)
		}
		if dup.Description != "LMU+OBS" {
			t.Errorf("description not copied: %q", dup.Description)
		}
		// Mutate the dup and verify source is unchanged.
		dup.Steps[0].Delay = 99
		for _, p := range backend.GetLauncherProfiles() {
			if p.ID == "creator" && p.Steps[0].Delay != 0 {
				t.Errorf("duplicate shares steps slice with source")
			}
		}
	})

	t.Run("missing source returns ErrProfileNotFound", func(t *testing.T) {
		err := svc.DuplicateProfile("ghost", "ghost-copy", "Ghost Copy")
		if !errors.Is(err, ErrProfileNotFound) {
			t.Fatalf("expected ErrProfileNotFound, got %v", err)
		}
	})

	t.Run("colliding new id returns ErrProfileDuplicate", func(t *testing.T) {
		err := svc.DuplicateProfile("creator", "creator-copy", "Otra")
		if !errors.Is(err, ErrProfileDuplicate) {
			t.Fatalf("expected ErrProfileDuplicate, got %v", err)
		}
	})
}

func TestSaveProfileRejectsUnknownApp(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	err := svc.SaveProfile(app.LaunchProfile{
		ID: "p", Name: "P", Steps: []app.LaunchStep{{AppID: "ghost", Delay: 0}},
	})
	if !errors.Is(err, ErrInvalidStep) {
		t.Fatalf("expected ErrInvalidStep, got %v", err)
	}
}

func TestLaunchProfileReturnsErrProfileNotFound(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	err := svc.LaunchProfile(testContext(), "does-not-exist")
	if !errors.Is(err, ErrProfileNotFound) {
		t.Fatalf("expected ErrProfileNotFound, got %v", err)
	}
}

func TestCancelChainReturnsFalseWhenIdle(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	if svc.CancelChain("whatever") {
		t.Fatal("CancelChain should return false when no chain is active")
	}
}

func TestCancelledChainKeepsStoppedStatusWhenRunnerFinishes(t *testing.T) {
	svc := NewService(newBackendWithLMU(), &spyEmitter{}, nil)
	svc.recordChainEvent("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "lmu", Status: "pending"})
	svc.activeMu.Lock()
	chain := svc.active["creator"]
	chain.Status = "stopped"
	svc.active["creator"] = chain
	svc.activeMu.Unlock()
	svc.recordChainEvent("launcher:chain:done", ChainProgress{ProfileID: "creator", Status: "done", Success: false})
	svc.activeMu.Lock()
	got := svc.active["creator"].Status
	svc.activeMu.Unlock()
	if got != "stopped" {
		t.Fatalf("cancelled chain must remain stopped after runner completion, got %q", got)
	}
}

func TestTerminalChainIsCleanedUpAfterDelay(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	// 500ms, not shorter: every Snapshot() call resolves icons through the
	// Windows COM pipeline (hundreds of ms), and the cleanup timer must never
	// fire while the test is still asserting the pre-cleanup state.
	svc.chainCleanupDelay = 500 * time.Millisecond

	svc.chain.emit.Emit("launcher:chain:done", ChainProgress{ProfileID: "creator", Status: "done", Success: true})
	if chains := svc.Snapshot().ActiveChains; len(chains) != 1 || chains[0].Status != "done" {
		t.Fatalf("expected the finished chain to be visible before cleanup, got %+v", chains)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if len(svc.Snapshot().ActiveChains) == 0 {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("terminal chain was not cleaned up after the cleanup delay")
}

func TestTerminalCleanupLeavesARelaunchedChainAlive(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	svc.chainCleanupDelay = 500 * time.Millisecond

	svc.chain.emit.Emit("launcher:chain:done", ChainProgress{ProfileID: "creator", Status: "done", Success: true})
	// A new chain for the same profile starts before the old timer fires.
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "lmu", Status: "launching", Pid: 42})

	// Wait past the stale timer's firing window, then assert the relaunched
	// chain is still present: the timer must not drop a running chain.
	time.Sleep(700 * time.Millisecond)
	chains := svc.Snapshot().ActiveChains
	if len(chains) != 1 || chains[0].Status != "running" {
		t.Fatalf("relaunched chain must survive the stale cleanup timer, got %+v", chains)
	}
}
