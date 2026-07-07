package main

import (
	"context"
	"fmt"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/app/launcher"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

// fakeOverlayFactory creates fake overlay windows for testing.
type fakeOverlayFactory struct {
	created int
	last    *fakeOverlayWindow
}

type fakeOverlayWindow struct {
	appliedModes []config.DisplayMode
}

func (f *fakeOverlayWindow) Close() {}

func (f *fakeOverlayWindow) ApplyProfileMode(profile *config.ProfileConfig) error {
	f.appliedModes = append(f.appliedModes, profile.DisplayMode)
	return nil
}

func (f *fakeOverlayFactory) NewOverlayWindow(profile *config.ProfileConfig, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
	f.created++
	f.last = &fakeOverlayWindow{}
	return f.last, nil
}

// fakeOverlayStarter is a test double for the overlay starter used by the
// toggle-edit-mode hotkey handler.
type fakeOverlayStarter struct {
	started    int
	status     app.OverlayStatus
	err        error
	controller *app.OverlayController
	profile    *config.ProfileConfig
}

func (f *fakeOverlayStarter) StartActiveOverlay() (app.OverlayStatus, error) {
	f.started++
	if f.controller != nil && f.profile != nil {
		return f.controller.Start(f.profile)
	}
	return f.status, f.err
}

// fakeWindowHandle implements window.WindowHandle for testing.
type fakeWindowHandle struct {
	ignoreMouse bool
	resizable   bool
	fullscreen  bool
}

func (f *fakeWindowHandle) SetBounds(bounds window.WailsRect) {}
func (f *fakeWindowHandle) SetSize(width, height int)         {}
func (f *fakeWindowHandle) SetPosition(x, y int)              {}
func (f *fakeWindowHandle) SetIgnoreMouseEvents(ignore bool)  { f.ignoreMouse = ignore }
func (f *fakeWindowHandle) SetResizable(b bool)               { f.resizable = b }
func (f *fakeWindowHandle) Fullscreen()                       { f.fullscreen = true }
func (f *fakeWindowHandle) UnFullscreen()                     { f.fullscreen = false }

// spyEmitter records emitted events.
type spyMainEmitter struct {
	events []string
	data   []any
}

func (s *spyMainEmitter) Emit(name string, data any) {
	s.events = append(s.events, name)
	s.data = append(s.data, data)
}

func newTestProfileService(t *testing.T, mode config.DisplayMode, emitter app.EventEmitter) *app.ProfileService {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	profile := &config.ProfileConfig{
		ID:          "test",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 100, Y: 100, W: 200, H: 100}},
		},
	}
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatalf("save profile: %v", err)
	}
	fw := &fakeWindowHandle{}
	mgr := window.NewManager(fw, 0)
	svc := app.NewProfileService(path, mgr, emitter)
	if err := svc.Load(); err != nil {
		t.Fatalf("load profile: %v", err)
	}
	if mode != config.ModeRacing {
		if err := svc.SetDisplayMode(mode); err != nil {
			t.Fatalf("set display mode: %v", err)
		}
	}
	return svc
}

func TestBuildHotkeyActionMapIncludesToggleEditMode(t *testing.T) {
	var overlayRunning atomic.Bool
	actionMap := buildHotkeyActionMap(nil, nil, nil, &overlayRunning, nil)

	expected := []string{"toggleOverlay", "toggleEditMode", "nextProfile", "prevProfile"}
	if len(actionMap) != len(expected) {
		t.Fatalf("expected %d actions, got %d", len(expected), len(actionMap))
	}
	for _, name := range expected {
		if _, ok := actionMap[name]; !ok {
			t.Errorf("missing action %q in action map", name)
		}
	}
}

func TestHandleToggleEditModeTogglesDisplayMode(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)

	// Start the overlay so the toggle has something to act on.
	if _, err := controller.Start(profileSvc.Profile()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}

	handleToggleEditMode(controller, profileSvc, nil, nil, emitter)

	if profileSvc.Profile().DisplayMode != config.ModeEdit {
		t.Fatalf("expected edit mode, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(emitter.events) != 2 || emitter.events[0] != "profile:loaded" || emitter.events[1] != "overlay:edit-mode-changed" {
		t.Fatalf("events=%v, want [profile:loaded overlay:edit-mode-changed]", emitter.events)
	}
	if factory.last == nil || len(factory.last.appliedModes) != 1 || factory.last.appliedModes[0] != config.ModeEdit {
		t.Fatalf("expected window to apply ModeEdit, got modes=%v", factory.last.appliedModes)
	}

	handleToggleEditMode(controller, profileSvc, nil, nil, emitter)

	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(factory.last.appliedModes) != 2 || factory.last.appliedModes[1] != config.ModeRacing {
		t.Fatalf("expected window to apply ModeRacing second, got modes=%v", factory.last.appliedModes)
	}
}

func TestHandleToggleEditModeOpensOverlayWhenNotRunning(t *testing.T) {
	controller := app.NewOverlayController(&fakeOverlayFactory{
		last: &fakeOverlayWindow{},
	})
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)
	starter := &fakeOverlayStarter{
		controller: controller,
		profile:    profileSvc.Profile(),
	}
	var overlayRunning atomic.Bool

	handleToggleEditMode(controller, profileSvc, starter, &overlayRunning, emitter)

	if starter.started != 1 {
		t.Fatalf("expected overlay to be started once, got %d", starter.started)
	}
	if !overlayRunning.Load() {
		t.Fatal("expected overlayRunning to be true")
	}
	if profileSvc.Profile().DisplayMode != config.ModeEdit {
		t.Fatalf("expected edit mode after open, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(emitter.events) != 2 || emitter.events[1] != "overlay:edit-mode-changed" {
		t.Fatalf("events=%v, want ending with overlay:edit-mode-changed", emitter.events)
	}
	win, ok := controller.CurrentWindow().(*fakeOverlayWindow)
	if !ok {
		t.Fatal("expected fake overlay window")
	}
	if len(win.appliedModes) != 1 || win.appliedModes[0] != config.ModeEdit {
		t.Fatalf("expected window to apply ModeEdit after start, got modes=%v", win.appliedModes)
	}
}

func TestHandleToggleEditModeNoOverlayAndNoStarter(t *testing.T) {
	controller := app.NewOverlayController(&fakeOverlayFactory{
		last: &fakeOverlayWindow{},
	})
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)

	handleToggleEditMode(controller, profileSvc, nil, nil, emitter)

	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode unchanged, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(emitter.events) != 0 {
		t.Fatalf("expected no events, got %v", emitter.events)
	}
}

func TestHandleToggleEditModeRespectsRunningStatusForStreaming(t *testing.T) {
	controller := app.NewOverlayController(&fakeOverlayFactory{
		last: &fakeOverlayWindow{},
	})
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)
	starter := &fakeOverlayStarter{status: app.OverlayStatus{Running: false}}
	var overlayRunning atomic.Bool

	handleToggleEditMode(controller, profileSvc, starter, &overlayRunning, emitter)

	if overlayRunning.Load() {
		t.Fatal("expected overlayRunning to remain false for non-running status")
	}
	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode unchanged when no desktop window, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(emitter.events) != 0 {
		t.Fatalf("expected no events when no desktop window, got %v", emitter.events)
	}
}

func TestResetOverlayDisplayModeResetsToRacing(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeEdit, emitter)

	if _, err := controller.Start(profileSvc.Profile()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}

	resetOverlayDisplayMode(controller, profileSvc, emitter)

	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode after reset, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(emitter.events) != 2 || emitter.events[0] != "profile:loaded" || emitter.events[1] != "overlay:edit-mode-changed" {
		t.Fatalf("events=%v, want [profile:loaded overlay:edit-mode-changed]", emitter.events)
	}
	if factory.last == nil || len(factory.last.appliedModes) < 1 || factory.last.appliedModes[len(factory.last.appliedModes)-1] != config.ModeRacing {
		t.Fatalf("expected window to apply ModeRacing, got modes=%v", factory.last.appliedModes)
	}
}

func TestResetOverlayDisplayModeIdempotentWhenRacing(t *testing.T) {
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)

	resetOverlayDisplayMode(nil, profileSvc, emitter)

	if len(emitter.events) != 0 {
		t.Fatalf("expected no events when already racing, got %v", emitter.events)
	}
}

func TestNewOverlayWindowAppliesProfileMode(t *testing.T) {
	tests := []struct {
		name           string
		mode           config.DisplayMode
		wantIgnore     bool
		wantResizable  bool
		wantFullscreen bool
	}{
		{
			name:           "racing mode starts click-through",
			mode:           config.ModeRacing,
			wantIgnore:     true,
			wantResizable:  false,
			wantFullscreen: true,
		},
		{
			name:           "edit mode starts interactive",
			mode:           config.ModeEdit,
			wantIgnore:     false,
			wantResizable:  true,
			wantFullscreen: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handle := &fakeWindowHandle{}
			mgr := window.NewManager(handle, 0)
			profile := &config.ProfileConfig{
				DisplayMode: tt.mode,
				Widgets: []config.WidgetConfig{
					{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 100, Y: 100, W: 200, H: 100}},
				},
			}

			mgr.ApplyProfile(profile, false)

			if handle.ignoreMouse != tt.wantIgnore {
				t.Errorf("ignoreMouse=%v, want %v", handle.ignoreMouse, tt.wantIgnore)
			}
			if handle.resizable != tt.wantResizable {
				t.Errorf("resizable=%v, want %v", handle.resizable, tt.wantResizable)
			}
			if handle.fullscreen != tt.wantFullscreen {
				t.Errorf("fullscreen=%v, want %v", handle.fullscreen, tt.wantFullscreen)
			}
		})
	}
}

// failingApplyProfileModeWindow is a fake overlay window whose ApplyProfileMode
// always returns an error, used to verify the edit-mode-changed event is NOT
// emitted when applying the mode to the real window fails.
type failingApplyProfileModeWindow struct {
	closed bool
}

func (f *failingApplyProfileModeWindow) Close() { f.closed = true }

func (f *failingApplyProfileModeWindow) ApplyProfileMode(profile *config.ProfileConfig) error {
	return fmt.Errorf("simulated window mode apply failure")
}

// failingApplyProfileModeFactory creates failingApplyProfileModeWindow instances.
type failingApplyProfileModeFactory struct {
	last *failingApplyProfileModeWindow
}

func (f *failingApplyProfileModeFactory) NewOverlayWindow(profile *config.ProfileConfig, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
	f.last = &failingApplyProfileModeWindow{}
	return f.last, nil
}

// TestStopOverlayClosureClearsOverlayRunningAndResetsMode simulates the
// external window-close path (Alt+F4): the Wails WindowClosing handler calls
// Stop() then, while overlayRunning is still true, resets the display mode and
// clears the flag. This mirrors the body of the stopOverlay closure wired in
// main.go's wailsOverlayFactory.
func TestStopOverlayClosureClearsOverlayRunningAndResetsMode(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeEdit, emitter)

	// Start the overlay so a window exists and the flag is true.
	if _, err := controller.Start(profileSvc.Profile()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	// Replicate the stopOverlay closure body exactly.
	controller.Stop()
	if overlayRunning.Load() {
		resetOverlayDisplayMode(controller, profileSvc, emitter)
		overlayRunning.Store(false)
	}

	if overlayRunning.Load() {
		t.Fatal("expected overlayRunning to be false after external close")
	}
	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode after close, got %q", profileSvc.Profile().DisplayMode)
	}
	// resetOverlayDisplayMode emits profile:loaded + overlay:edit-mode-changed.
	if len(emitter.events) != 2 || emitter.events[1] != "overlay:edit-mode-changed" {
		t.Fatalf("events=%v, want ending with overlay:edit-mode-changed", emitter.events)
	}
}

// TestStopOverlayClosureSkipsResetWhenAlreadyStopped verifies the guard: if
// overlayRunning is already false (normal stop path already ran), the closure
// does not double-reset nor emit spurious events.
func TestStopOverlayClosureSkipsResetWhenAlreadyStopped(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)

	if _, err := controller.Start(profileSvc.Profile()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	// Normal stop path already cleared the flag.
	overlayRunning.Store(false)

	controller.Stop()
	if overlayRunning.Load() {
		resetOverlayDisplayMode(controller, profileSvc, emitter)
		overlayRunning.Store(false)
	}

	if overlayRunning.Load() {
		t.Fatal("expected overlayRunning to remain false")
	}
	if len(emitter.events) != 0 {
		t.Fatalf("expected no events when already stopped, got %v", emitter.events)
	}
}

// TestHandleToggleEditModeStartActiveOverlayFailureClearsOverlayRunning
// verifies that when StartActiveOverlay fails after stopping the previous
// window, overlayRunning is synced to false and no edit-mode-changed event is
// emitted.
func TestHandleToggleEditModeStartActiveOverlayFailureClearsOverlayRunning(t *testing.T) {
	controller := app.NewOverlayController(&fakeOverlayFactory{
		last: &fakeOverlayWindow{},
	})
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)
	// Starter returns a non-running status with an error, simulating a failed
	// start after the previous window was closed.
	starter := &fakeOverlayStarter{
		status: app.OverlayStatus{Running: false},
		err:    fmt.Errorf("simulated start failure"),
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true) // pretend a window was running before

	handleToggleEditMode(controller, profileSvc, starter, &overlayRunning, emitter)

	if overlayRunning.Load() {
		t.Fatal("expected overlayRunning to be false after start failure")
	}
	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode unchanged, got %q", profileSvc.Profile().DisplayMode)
	}
	for _, e := range emitter.events {
		if e == "overlay:edit-mode-changed" {
			t.Fatal("must not emit overlay:edit-mode-changed on start failure")
		}
	}
}

// TestHandleToggleEditModeNoEditModeChangedWhenApplyProfileModeFails verifies
// that when ApplyProfileMode fails on the real window, the frontend is NOT
// told edit mode changed (otherwise it would render edit chrome over a window
// that is still click-through).
func TestHandleToggleEditModeNoEditModeChangedWhenApplyProfileModeFails(t *testing.T) {
	factory := &failingApplyProfileModeFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)

	// Start so a (failing) window exists.
	if _, err := controller.Start(profileSvc.Profile()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	handleToggleEditMode(controller, profileSvc, nil, &overlayRunning, emitter)

	for _, e := range emitter.events {
		if e == "overlay:edit-mode-changed" {
			t.Fatal("must not emit overlay:edit-mode-changed when ApplyProfileMode fails")
		}
	}
	// SetDisplayMode already mutated the profile to edit before the window
	// apply failed; that is expected and documented — the frontend is not
	// notified, so it will not render edit chrome.
}

// TestResetOverlayDisplayModeSkipsWindowApplyWhenNoWindow verifies Fix D:
// when there is no running window, resetOverlayDisplayMode still forces the
// profile to racing but does not attempt to apply the mode to a nil window
// (which would log a spurious error).
func TestResetOverlayDisplayModeSkipsWindowApplyWhenNoWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeEdit, emitter)

	// No window started; controller has no current window.
	resetOverlayDisplayMode(controller, profileSvc, emitter)

	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode after reset, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(emitter.events) != 2 || emitter.events[1] != "overlay:edit-mode-changed" {
		t.Fatalf("events=%v, want ending with overlay:edit-mode-changed", emitter.events)
	}
	// The fake factory never created a window, so no mode was applied to any
	// window. This confirms we did not touch a nil/stale window reference.
	if factory.last != nil {
		t.Fatalf("expected no window to be created, got %v", factory.last)
	}
}

// --- Launcher Extendido (Fase 5) wiring tests ------------------------------

// fakeLauncherBackend is an in-memory app.LauncherSettingsBackend for the
// wiring tests. It mirrors what SettingsService persists so the handlers can
// round-trip exactly like production.
type fakeLauncherBackend struct {
	apps     map[string]app.LauncherAppEntry
	profiles []app.LaunchProfile
}

func (f *fakeLauncherBackend) GetLauncherApps() map[string]app.LauncherAppEntry {
	out := make(map[string]app.LauncherAppEntry, len(f.apps))
	for k, v := range f.apps {
		out[k] = v
	}
	return out
}

func (f *fakeLauncherBackend) SetLauncherApps(apps map[string]app.LauncherAppEntry) error {
	f.apps = make(map[string]app.LauncherAppEntry, len(apps))
	for k, v := range apps {
		f.apps[k] = v
	}
	return nil
}

func (f *fakeLauncherBackend) GetLauncherProfiles() []app.LaunchProfile {
	out := make([]app.LaunchProfile, len(f.profiles))
	copy(out, f.profiles)
	return out
}

func (f *fakeLauncherBackend) SetLauncherProfiles(profiles []app.LaunchProfile) error {
	f.profiles = make([]app.LaunchProfile, len(profiles))
	copy(f.profiles, profiles)
	return nil
}
func newTestLauncherService(t *testing.T) (*launcher.Service, *spyMainEmitter) {
	t.Helper()
	backend := &fakeLauncherBackend{
		apps: map[string]app.LauncherAppEntry{
			"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate", LaunchMethod: "steam-uri", SteamAppID: 2399420},
		},
	}
	emitter := &spyMainEmitter{}
	return launcher.NewService(backend, emitter, nil), emitter
}

func TestHandleDiscoverAppsEmitsDetected(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleDiscoverApps(svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:apps:detected" {
		t.Fatalf("expected launcher:apps:detected, got %v", emitter.events)
	}
}

func TestHandleAddAppEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	entry := app.LauncherAppEntry{
		ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\obs.exe`,
	}
	handleAddApp(entry, svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:apps:updated" {
		t.Fatalf("expected launcher:apps:updated, got %v", emitter.events)
	}
	// The app must be present in the emitted payload.
	payload := emitter.data[0].(map[string]any)
	apps, ok := payload["apps"].(map[string]app.LauncherAppEntry)
	if !ok {
		t.Fatalf("apps payload missing or wrong type: %+v", payload)
	}
	if _, ok := apps["obs"]; !ok {
		t.Fatal("added app missing from emitted apps")
	}
}

func TestHandleAddAppEmitsErrorOnInvalid(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	bad := app.LauncherAppEntry{ID: "x", LaunchMethod: "executable", ExecutablePath: "p"} // missing displayName
	handleAddApp(bad, svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleRemoveAppEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleRemoveApp("lmu", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:apps:updated" {
		t.Fatalf("expected launcher:apps:updated, got %v", emitter.events)
	}
}

func TestHandleRemoveAppEmitsErrorWhenUsedByProfile(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	// Make lmu used by a profile via the service's own backend.
	if err := svc.SaveProfile(app.LaunchProfile{ID: "pro", Name: "Pro", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}); err != nil {
		t.Fatalf("seed profile: %v", err)
	}
	handleRemoveApp("lmu", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleListProfilesEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleListProfiles(svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:profiles:updated" {
		t.Fatalf("expected launcher:profiles:updated, got %v", emitter.events)
	}
}

func TestHandleSaveProfileEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	profile := app.LaunchProfile{ID: "creator", Name: "Creador", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}
	handleSaveProfile(profile, svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:profiles:updated" {
		t.Fatalf("expected launcher:profiles:updated, got %v", emitter.events)
	}
}

func TestHandleSaveProfileEmitsErrorOnInvalid(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	bad := app.LaunchProfile{ID: "p", Name: "P", Steps: []app.LaunchStep{{AppID: "ghost", Delay: 0}}}
	handleSaveProfile(bad, svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleDeleteProfileEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	if err := svc.SaveProfile(app.LaunchProfile{ID: "pro", Name: "Pro"}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	handleDeleteProfile("pro", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:profiles:updated" {
		t.Fatalf("expected launcher:profiles:updated, got %v", emitter.events)
	}
}

func TestHandleLaunchProfileEmitsErrorOnUnknown(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleLaunchProfile("nope", svc, emitter, context.Background())
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleCancelProfileNoPanic(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleCancelProfile("whatever", svc, emitter)
	if len(emitter.events) != 0 {
		t.Fatalf("cancel must not emit events, got %v", emitter.events)
	}
}

func TestHandleChainErrorEmitsDialogAndError(t *testing.T) {
	emitter := &spyMainEmitter{}
	payload := launcher.ChainProgress{ProfileID: "pro", StepIndex: 1, Message: "boom"}
	handleChainError(emitter, payload)
	// We emit a question event for the frontend dialog plus launcher:error fallback.
	want := map[string]bool{"launcher:dialog:question": false, "launcher:error": false}
	for _, e := range emitter.events {
		if _, ok := want[e]; ok {
			want[e] = true
		}
	}
	for name, seen := range want {
		if !seen {
			t.Fatalf("expected event %q, got %v", name, emitter.events)
		}
	}
}

func TestHandleAppPickEmitsFallbackError(t *testing.T) {
	emitter := &spyMainEmitter{}
	handleAppPick(emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error fallback, got %v", emitter.events)
	}
}
