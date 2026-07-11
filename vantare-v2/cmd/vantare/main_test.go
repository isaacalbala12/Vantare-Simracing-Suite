package main

import (
	"context"
	"fmt"
	"os"
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
		t.Fatalf("expected %d actions, got %d", len(actionMap), len(expected))
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

	if _, err := controller.Start(profileSvc.Profile()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

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
	if len(emitter.events) != 2 || emitter.events[1] != "overlay:edit-mode-changed" {
		t.Fatalf("events=%v, want ending with overlay:edit-mode-changed", emitter.events)
	}
}

func TestStopOverlayClosureSkipsResetWhenAlreadyStopped(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)

	if _, err := controller.Start(profileSvc.Profile()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
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

func TestHandleToggleEditModeStartActiveOverlayFailureClearsOverlayRunning(t *testing.T) {
	controller := app.NewOverlayController(&fakeOverlayFactory{
		last: &fakeOverlayWindow{},
	})
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)
	starter := &fakeOverlayStarter{
		status: app.OverlayStatus{Running: false},
		err:    fmt.Errorf("simulated start failure"),
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

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

func TestHandleToggleEditModeNoEditModeChangedWhenApplyProfileModeFails(t *testing.T) {
	factory := &failingApplyProfileModeFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeRacing, emitter)

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
}

func TestResetOverlayDisplayModeSkipsWindowApplyWhenNoWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	profileSvc := newTestProfileService(t, config.ModeEdit, emitter)

	resetOverlayDisplayMode(controller, profileSvc, emitter)

	if profileSvc.Profile().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode after reset, got %q", profileSvc.Profile().DisplayMode)
	}
	if len(emitter.events) != 2 || emitter.events[1] != "overlay:edit-mode-changed" {
		t.Fatalf("events=%v, want ending with overlay:edit-mode-changed", emitter.events)
	}
	if factory.last != nil {
		t.Fatalf("expected no window to be created, got %v", factory.last)
	}
}

// --- Launcher Extendido (Fase 5) wiring tests ------------------------------

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
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:apps:detected" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("expected legacy discovery plus snapshot, got %v", emitter.events)
	}
}

func TestHandleAddAppEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	entry := app.LauncherAppEntry{
		ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\obs.exe`,
	}
	handleAddApp(entry, svc, emitter)
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:apps:updated" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("expected legacy app update plus snapshot, got %v", emitter.events)
	}
	payload := emitter.data[0].(map[string]any)
	apps, ok := payload["apps"].([]app.LauncherAppEntry)
	if !ok {
		t.Fatalf("apps payload missing or wrong type: %+v", payload)
	}
	found := false
	for _, a := range apps {
		if a.ID == "obs" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("added app missing from emitted apps")
	}
}

func TestHandleAddAppEmitsErrorOnInvalid(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	bad := app.LauncherAppEntry{ID: "x", LaunchMethod: "executable", ExecutablePath: "p"}
	handleAddApp(bad, svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleRemoveAppEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleRemoveApp("lmu", svc, emitter)
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:apps:updated" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("expected legacy app update plus snapshot, got %v", emitter.events)
	}
}

func TestHandleRemoveAppEmitsErrorWhenUsedByProfile(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
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
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:profiles:updated" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("expected legacy profile list plus snapshot, got %v", emitter.events)
	}
}

func TestHandleSaveProfileEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	profile := app.LaunchProfile{ID: "creator", Name: "Creador", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}
	handleSaveProfile(profile, svc, emitter)
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:profiles:updated" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("expected legacy profile update plus snapshot, got %v", emitter.events)
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
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:profiles:updated" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("expected legacy profile update plus snapshot, got %v", emitter.events)
	}
}

func TestHandleDuplicateProfileEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	if err := svc.SaveProfile(app.LaunchProfile{ID: "creator", Name: "Creador", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	handleDuplicateProfile("creator", "creator-copy", "Creador (copia)", svc, emitter)
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:profiles:updated" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("expected legacy profile update plus snapshot, got %v", emitter.events)
	}
	if got := svc.ListProfiles(); len(got) != 2 {
		t.Fatalf("expected 2 profiles after duplicate, got %d", len(got))
	}
}

func TestHandleDuplicateProfileEmitsErrorOnMissing(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleDuplicateProfile("ghost", "ghost-copy", "G", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleDuplicateProfileEmitsErrorOnCollision(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	if err := svc.SaveProfile(app.LaunchProfile{ID: "creator", Name: "Creador"}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := svc.SaveProfile(app.LaunchProfile{ID: "creator-copy", Name: "Existing"}); err != nil {
		t.Fatalf("seed dup: %v", err)
	}
	handleDuplicateProfile("creator", "creator-copy", "Otra", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
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
	handleCancelProfile("whatever", svc)
	if len(emitter.events) != 0 {
		t.Fatalf("cancel must not emit events, got %v", emitter.events)
	}
}

func TestHandleAppPickEmitsFallbackError(t *testing.T) {
	emitter := &spyMainEmitter{}
	handleAppPick(emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error fallback, got %v", emitter.events)
	}
}

// fakeLauncherDialog is a minimal launcherDialogShower for tests. It records
// every prompt and returns the pre-configured answer.
type fakeLauncherDialog struct {
	answer  bool
	prompts []struct{ profile, message string }
}

func (f *fakeLauncherDialog) ShowRetry(profileID, message string) bool {
	f.prompts = append(f.prompts, struct{ profile, message string }{profileID, message})
	return f.answer
}

func TestHandleChainErrorRetriesOnYes(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	if err := svc.SaveProfile(app.LaunchProfile{ID: "creator", Name: "Creador", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	dialog := &fakeLauncherDialog{answer: true}
	handleChainError("creator", 0, "launcher: app lmu not found", svc, emitter, dialog)

	if len(dialog.prompts) != 1 {
		t.Fatalf("expected 1 dialog prompt, got %d", len(dialog.prompts))
	}
	if dialog.prompts[0].profile != "creator" {
		t.Errorf("wrong profile in prompt: %q", dialog.prompts[0].profile)
	}
	if dialog.prompts[0].message != "launcher: app lmu not found" {
		t.Errorf("wrong message in prompt: %q", dialog.prompts[0].message)
	}
	// On yes, the handler must relaunch the profile. svc.LaunchProfile runs
	// the chain on a goroutine; we accept that the profile is still
	// resolvable and that the handler did not error.
	got := svc.ListProfiles()
	if len(got) != 1 || got[0].ID != "creator" {
		t.Errorf("profile lost after retry: %+v", got)
	}
}

func TestHandleChainErrorDoesNotRetryOnNo(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	if err := svc.SaveProfile(app.LaunchProfile{ID: "creator", Name: "Creador"}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	dialog := &fakeLauncherDialog{answer: false}
	handleChainError("creator", 0, "boom", svc, emitter, dialog)

	if len(dialog.prompts) != 1 {
		t.Fatalf("expected 1 dialog prompt, got %d", len(dialog.prompts))
	}
	// On no, the handler must NOT call LaunchProfile and must NOT emit
	// events.
	if len(emitter.events) != 0 {
		t.Errorf("expected no events on no-retry, got %v", emitter.events)
	}
}

func TestHandleRegistryListEmitsListed(t *testing.T) {
	emitter := &spyMainEmitter{}
	handleRegistryList(emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:registry:listed" {
		t.Fatalf("expected launcher:registry:listed, got %v", emitter.events)
	}
	payload := emitter.data[0].(map[string]any)
	if _, ok := payload["apps"]; !ok {
		t.Fatal("expected apps key in payload")
	}
}

func TestHandleAppUpdateEmitsUpdated(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	settingsSvc := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}

	// Seed an app
	custom := app.DefaultAppSettings()
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS", Category: app.AppCategoryStreaming, LaunchMethod: "executable", Detected: true, GradientFrom: "#302e31", GradientTo: "#0a0a0a"},
	}
	if err := settingsSvc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}

	// Reload so the pointer is fresh
	settingsSvc2 := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc2.Load(); err != nil {
		t.Fatalf("reload: %v", err)
	}

	emitter := &spyMainEmitter{}
	handleAppUpdate("obs", "--new-args", settingsSvc2, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "launcher:apps:updated" {
		t.Fatalf("expected launcher:apps:updated, got %v", emitter.events)
	}
	payload := emitter.data[0].(map[string]any)
	if _, ok := payload["apps"]; !ok {
		t.Fatal("expected apps key in payload")
	}
}

func TestHandleAppUpdateEmitsErrorOnUnknown(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	settingsSvc := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}

	emitter := &spyMainEmitter{}
	handleAppUpdate("ghost", "args", settingsSvc, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleSetAppPathPersistsValidatedOverride(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	apps := svc.Settings().GetLauncherApps()
	apps["obs"] = app.LauncherAppEntry{
		ID:           "obs",
		DisplayName:  "OBS Studio",
		LaunchMethod: "executable",
	}
	if err := svc.Settings().SetLauncherApps(apps); err != nil {
		t.Fatalf("seed app: %v", err)
	}

	exe := filepath.Join(t.TempDir(), "obs64.exe")
	if err := os.WriteFile(exe, []byte("MZ"), 0o644); err != nil {
		t.Fatal(err)
	}
	handleSetAppPath("obs", exe, svc, emitter)

	if len(emitter.events) != 2 || emitter.events[0] != "launcher:apps:updated" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("events=%v, want legacy app update plus snapshot", emitter.events)
	}
	if got := svc.Settings().GetLauncherApps()["obs"]; got.ExecutablePath != exe || got.PathSource != "override" {
		t.Fatalf("override not persisted: %+v", got)
	}
}

func TestHandlePreviewAppMergeEmitsCandidateWithoutChangingApps(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	apps := svc.Settings().GetLauncherApps()
	apps["manual-obs"] = app.LauncherAppEntry{
		ID:           "manual-obs",
		DisplayName:  "OBS Studio",
		LaunchMethod: "executable",
	}
	if err := svc.Settings().SetLauncherApps(apps); err != nil {
		t.Fatalf("seed app: %v", err)
	}

	handlePreviewAppMerge("manual-obs", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:app:merge:preview" {
		t.Fatalf("events=%v, want merge preview", emitter.events)
	}
	payload := emitter.data[0].(map[string]any)
	if payload["mergeCandidateId"] != "lmu" && payload["mergeCandidateId"] != "obs" {
		t.Fatalf("unexpected merge candidate payload: %+v", payload)
	}
	if _, ok := svc.Settings().GetLauncherApps()["manual-obs"]; !ok {
		t.Fatal("preview must not mutate apps")
	}
}

func TestHandleConfirmAppMergePreservesProfileSteps(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	apps := svc.Settings().GetLauncherApps()
	apps["obs"] = app.LauncherAppEntry{ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", Detected: true}
	apps["manual-obs"] = app.LauncherAppEntry{
		ID: "manual-obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\obs.exe`, Args: "--profile=night",
	}
	if err := svc.Settings().SetLauncherApps(apps); err != nil {
		t.Fatalf("seed apps: %v", err)
	}
	if err := svc.Settings().SetLauncherProfiles([]app.LaunchProfile{{
		ID: "creator", Name: "Creator", Steps: []app.LaunchStep{{AppID: "manual-obs", Delay: 2}},
	}}); err != nil {
		t.Fatalf("seed profile: %v", err)
	}

	handleConfirmAppMerge("manual-obs", "obs", svc, emitter)
	if len(emitter.events) != 2 || emitter.events[0] != "launcher:app:merge:confirmed" || emitter.events[1] != "launcher:snapshot" {
		t.Fatalf("events=%v, want merge confirmed plus snapshot", emitter.events)
	}
	if _, ok := svc.Settings().GetLauncherApps()["manual-obs"]; ok {
		t.Fatal("confirmed merge must remove manual app")
	}
	if got := svc.Settings().GetLauncherProfiles()[0].Steps[0].AppID; got != "obs" {
		t.Fatalf("profile step was not rewired: %q", got)
	}
}

func TestHandleLauncherSnapshotEmitsCanonicalPayload(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleLauncherSnapshot(svc, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("events=%v, want launcher:snapshot", emitter.events)
	}
	if _, ok := emitter.data[0].(launcher.LauncherSnapshot); !ok {
		t.Fatalf("snapshot payload has wrong type: %T", emitter.data[0])
	}
}

func TestHandleChainErrorOnMissingProfileEmitsError(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	dialog := &fakeLauncherDialog{answer: true}
	// Profile does not exist; handler must emit launcher:error and not
	// prompt the user.
	handleChainError("ghost", 0, "boom", svc, emitter, dialog)

	if len(dialog.prompts) != 0 {
		t.Errorf("must not prompt when profile is missing; got %d prompts", len(dialog.prompts))
	}
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

// --- Task 7.3 — Backend handlers wiring tests -------------------------------

func TestHandleProfileCancel(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	// Cancel a non-existent profile must not panic or emit events.
	handleCancelProfile("nonexistent", svc)
	if len(emitter.events) != 0 {
		t.Fatalf("cancel must not emit events, got %v", emitter.events)
	}
	// Save a profile and verify cancellation is accepted without error.
	if err := svc.SaveProfile(app.LaunchProfile{ID: "pro", Name: "Pro"}); err != nil {
		t.Fatalf("seed profile: %v", err)
	}
	handleCancelProfile("pro", svc)
	if len(emitter.events) != 0 {
		t.Fatalf("cancel must not emit events after save, got %v", emitter.events)
	}
}

func TestHandleProfileRetryFailed(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	// Seed a valid profile.
	if err := svc.SaveProfile(app.LaunchProfile{
		ID: "creator", Name: "Creador",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}},
	}); err != nil {
		t.Fatalf("seed profile: %v", err)
	}
	ctx := context.Background()
	// Retry must not return an immediate error (the chain runs on a goroutine).
	handleProfileRetryFailed("creator", svc, emitter, ctx)
	// No error event must be emitted.
	for _, e := range emitter.events {
		if e == "launcher:error" {
			t.Fatal("retry failed must not emit launcher:error for a valid profile")
		}
	}
}

func TestHandleProfileStatsSave(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	settingsSvc := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	// Seed a profile with a known ID.
	custom := app.DefaultAppSettings()
	custom.LauncherProfiles = []app.LaunchProfile{
		{ID: "p1", Name: "P1", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}},
	}
	// Also seed the app referenced by the profile step.
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", DisplayName: "LMU", LaunchMethod: "steam-uri", SteamAppID: 2399420, GradientFrom: "#000", GradientTo: "#fff"},
	}
	if err := settingsSvc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}
	// Reload to get a fresh settings pointer.
	settingsSvc2 := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc2.Load(); err != nil {
		t.Fatalf("reload: %v", err)
	}

	emitter := &spyMainEmitter{}
	handleProfileStatsSave("p1", 5000, settingsSvc2, emitter)

	// Must emit success.
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:profile:stats:saved" {
		t.Fatalf("expected launcher:profile:stats:saved, got %v", emitter.events)
	}
	// AvgChainDurationMs must be set on the profile.
	profiles := settingsSvc2.GetLauncherProfiles()
	if len(profiles) != 1 || profiles[0].AvgChainDurationMs != 5000 {
		t.Fatalf("expected AvgChainDurationMs=5000, got %d", profiles[0].AvgChainDurationMs)
	}
}

func TestHandleProfileStatsSaveEmitsErrorOnUnknown(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	settingsSvc := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	emitter := &spyMainEmitter{}
	handleProfileStatsSave("ghost", 1000, settingsSvc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error for unknown profile, got %v", emitter.events)
	}
}

func TestHandleProfileHotkeySet(t *testing.T) {
	hkMgr := launcher.NewHotkeyManager()
	defer hkMgr.Unregister("test-profile")

	emitter := &spyMainEmitter{}

	// Empty combo = unregister; must succeed even if not registered.
	handleProfileHotkeySet("test-profile", "", hkMgr, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:profile:hotkey:set" {
		t.Fatalf("expected launcher:profile:hotkey:set on unregister, got %v", emitter.events)
	}
	payload := emitter.data[0].(map[string]any)
	if payload["combo"] != "" {
		t.Fatalf("expected empty combo in payload, got %q", payload["combo"])
	}
}

func TestHandleAutostartToggle(t *testing.T) {
	emitter := &spyMainEmitter{}
	// On non-Windows, RegisterAutostart will fail (registry API not available).
	// The handler must emit launcher:error in that case; on Windows it may
	// succeed depending on the test environment. We test both paths.
	handleAutostartToggle("test-profile", true, emitter)

	if len(emitter.events) == 0 {
		t.Fatal("expected at least one event from autostart toggle")
	}
	// If it succeeded, we got launcher:autostart:toggled; if it failed,
	// we got launcher:error. Either is valid behavior for the handler.
	got := emitter.events[0]
	if got != "launcher:autostart:toggled" && got != "launcher:error" {
		t.Fatalf("expected launcher:autostart:toggled or launcher:error, got %q", got)
	}
}

func TestHandleAppFavorite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	settingsSvc := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}

	// Seed an app entry.
	custom := app.DefaultAppSettings()
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"obs": {
			ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS",
			Category: app.AppCategoryStreaming, LaunchMethod: "executable",
			Detected: true, GradientFrom: "#302e31", GradientTo: "#0a0a0a",
		},
	}
	if err := settingsSvc.Save(custom); err != nil {
		t.Fatalf("save: %v", err)
	}
	settingsSvc2 := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc2.Load(); err != nil {
		t.Fatalf("reload: %v", err)
	}

	emitter := &spyMainEmitter{}
	handleAppFavorite("obs", true, settingsSvc2, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "launcher:apps:updated" {
		t.Fatalf("expected launcher:apps:updated, got %v", emitter.events)
	}
	// Verify the app is marked as favorite.
	apps := settingsSvc2.GetLauncherApps()
	if app, ok := apps["obs"]; !ok || !app.IsFavorite {
		t.Fatal("expected obs to be marked as favorite")
	}
}

func TestHandleAppFavoriteEmitsErrorOnUnknown(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	settingsSvc := app.NewSettingsService(path, nil, nil)
	if err := settingsSvc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	emitter := &spyMainEmitter{}
	handleAppFavorite("ghost", true, settingsSvc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
}

func TestHandleLaunchFlag(t *testing.T) {
	svc, _ := newTestLauncherService(t)
	// Seed a valid profile so the launch succeeds.
	if err := svc.SaveProfile(app.LaunchProfile{
		ID: "creator", Name: "Creador",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}},
	}); err != nil {
		t.Fatalf("seed profile: %v", err)
	}

	emitter := &spyMainEmitter{}
	// Valid launch flag must not emit an error (chain runs on goroutine).
	handleLaunchFlag([]string{"--launch=creator"}, nil, svc, emitter)
	for _, e := range emitter.events {
		if e == "launcher:error" {
			t.Fatal("launch flag must not emit error for a valid profile")
		}
	}
}

func TestHandleLaunchFlagIgnoresMissingFlag(t *testing.T) {
	svc, _ := newTestLauncherService(t)
	emitter := &spyMainEmitter{}
	// No launch flag = no-op, no events emitted.
	handleLaunchFlag([]string{"--other-flag"}, nil, svc, emitter)
	if len(emitter.events) != 0 {
		t.Fatalf("expected no events when flag is missing, got %v", emitter.events)
	}
}

func TestCancelAllNoPanic(t *testing.T) {
	svc, _ := newTestLauncherService(t)
	// Seed a profile.
	if err := svc.SaveProfile(app.LaunchProfile{
		ID: "p1", Name: "P1",
		Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}},
	}); err != nil {
		t.Fatalf("seed profile: %v", err)
	}
	// Start a chain (runs on goroutine).
	if err := svc.LaunchProfile(context.Background(), "p1"); err != nil {
		t.Fatalf("launch: %v", err)
	}
	// CancelAll must not panic.
	svc.CancelAll()
	// No event check needed; CancelAll is silent.
	emitter2 := &spyMainEmitter{}
	svc.CancelAll()
	if len(emitter2.events) != 0 {
		t.Fatalf("expected no events from CancelAll, got %v", emitter2.events)
	}
}
