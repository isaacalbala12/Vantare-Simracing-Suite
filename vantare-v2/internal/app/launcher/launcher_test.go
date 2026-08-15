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

func TestServiceSnapshotTracksActiveChainProgress(t *testing.T) {
	backend := newBackendWithLMU()
	svc := NewService(backend, &spyEmitter{}, nil)
	svc.chain.emit.Emit("launcher:chain:step", ChainProgress{ProfileID: "creator", StepIndex: 0, AppID: "lmu", Status: "ready", Pid: 42})
	snapshot := svc.Snapshot()
	if len(snapshot.ActiveChains) != 1 {
		t.Fatalf("expected one active chain, got %+v", snapshot.ActiveChains)
	}
	if snapshot.ActiveChains[0].Steps[0].PID != 42 || snapshot.ActiveChains[0].Status != "ready" {
		t.Fatalf("unexpected active chain state: %+v", snapshot.ActiveChains[0])
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
	if len(chains) != 1 || chains[0].Status != "launching" {
		t.Fatalf("relaunched chain must survive the stale cleanup timer, got %+v", chains)
	}
}
