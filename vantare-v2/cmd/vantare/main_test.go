package main

import (
	"errors"
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

// --- LAUNCHER-01 wiring tests ---------------------------------------------

// fakeLauncherService satisfies the three interfaces the handler functions
// depend on. Each field captures the most recent call so tests can assert the
// wiring triggered the expected method.
type fakeLauncherService struct {
	configureCalls atomic.Int32
	launchCalls    atomic.Int32
	statusCalls    atomic.Int32
	statusFor      string

	configureCfg launcher.LauncherConfig
	launchFor    string

	statusOut launcher.LauncherStatus
	launchOut launcher.LauncherStatus

	configureErr error
	launchErr    error
}

func (f *fakeLauncherService) GetStatus(simulatorID string) launcher.LauncherStatus {
	f.statusCalls.Add(1)
	f.statusFor = simulatorID
	return f.statusOut
}

func (f *fakeLauncherService) Configure(in launcher.LauncherConfig) (launcher.LauncherStatus, error) {
	f.configureCalls.Add(1)
	f.configureCfg = in
	if f.configureErr != nil {
		return launcher.LauncherStatus{}, f.configureErr
	}
	return launcher.LauncherStatus{SimulatorID: in.SimulatorID, Configured: true, LaunchMethod: in.LaunchMethod, SteamAppID: in.SteamAppID}, nil
}

func (f *fakeLauncherService) Launch(simulatorID string) (launcher.LauncherStatus, error) {
	f.launchCalls.Add(1)
	f.launchFor = simulatorID
	if f.launchErr != nil {
		return launcher.LauncherStatus{}, f.launchErr
	}
	return f.launchOut, nil
}

func newTestSettingsService(t *testing.T) *app.SettingsService {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, &spyMainEmitter{})
	if err := svc.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	return svc
}

func TestHandleLauncherStatusGetEmitsStatus(t *testing.T) {
	emitter := &spyMainEmitter{}
	fake := &fakeLauncherService{
		statusOut: launcher.LauncherStatus{SimulatorID: "lmu", Configured: true, LaunchMethod: "steam-uri", SteamAppID: launcher.DefaultLMUAppID},
	}
	handleLauncherStatusGet("lmu", fake, emitter)
	if fake.statusCalls.Load() != 1 {
		t.Fatalf("expected 1 status call, got %d", fake.statusCalls.Load())
	}
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:status" {
		t.Fatalf("expected single launcher:status, got %v", emitter.events)
	}
}

func TestHandleLauncherStatusGetDefaultsToLMU(t *testing.T) {
	fake := &fakeLauncherService{}
	handleLauncherStatusGet("", fake, &spyMainEmitter{})
	if fake.statusFor != "lmu" {
		t.Fatalf("expected default simulator 'lmu', got %q", fake.statusFor)
	}
}

func TestHandleLauncherConfigurePersistsAndEmits(t *testing.T) {
	emitter := &spyMainEmitter{}
	fake := &fakeLauncherService{}
	settings := newTestSettingsService(t)
	handleLauncherConfigure(
		launcher.LauncherConfig{SimulatorID: "lmu", LaunchMethod: "steam-uri", SteamAppID: launcher.DefaultLMUAppID},
		fake,
		settings,
		emitter,
		func(string, ...any) {},
	)
	if fake.configureCalls.Load() != 1 {
		t.Fatalf("expected 1 configure call, got %d", fake.configureCalls.Load())
	}
	wantEvents := []string{"launcher:configured", "settings"}
	if len(emitter.events) != 2 || emitter.events[0] != wantEvents[0] || emitter.events[1] != wantEvents[1] {
		t.Fatalf("events=%v, want %v", emitter.events, wantEvents)
	}
}

func TestHandleLauncherConfigureRejectsInvalidPayload(t *testing.T) {
	emitter := &spyMainEmitter{}
	fake := &fakeLauncherService{configureErr: errors.New("invalid config: bad")}
	settings := newTestSettingsService(t)
	handleLauncherConfigure(
		launcher.LauncherConfig{SimulatorID: "lmu", LaunchMethod: "magic"},
		fake,
		settings,
		emitter,
		func(string, ...any) {},
	)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected single launcher:error event, got %v", emitter.events)
	}
	for _, e := range emitter.events {
		if e == "launcher:configured" || e == "settings" {
			t.Fatalf("must not emit %q on error, got %v", e, emitter.events)
		}
	}
}

func TestHandleLauncherLaunchEmitsLaunchedOnSuccess(t *testing.T) {
	emitter := &spyMainEmitter{}
	fake := &fakeLauncherService{
		launchOut: launcher.LauncherStatus{
			SimulatorID:    "lmu",
			Configured:     true,
			LaunchMethod:   "steam-uri",
			SteamAppID:     launcher.DefaultLMUAppID,
			LastLaunchedAt: "2026-06-30T12:00:00Z",
		},
	}
	handleLauncherLaunch("lmu", fake, emitter, func(string, ...any) {})
	if fake.launchCalls.Load() != 1 {
		t.Fatalf("expected 1 launch call, got %d", fake.launchCalls.Load())
	}
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:launched" {
		t.Fatalf("expected single launcher:launched event, got %v", emitter.events)
	}
}

func TestHandleLauncherLaunchEmitsErrorOnFailure(t *testing.T) {
	emitter := &spyMainEmitter{}
	fake := &fakeLauncherService{launchErr: errors.New("not configured: lmu")}
	handleLauncherLaunch("lmu", fake, emitter, func(string, ...any) {})
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected single launcher:error, got %v", emitter.events)
	}
	for _, e := range emitter.events {
		if e == "launcher:launched" {
			t.Fatalf("must not emit launcher:launched on error, got %v", emitter.events)
		}
	}
}

func TestHandleLauncherLaunchDefaultsToLMU(t *testing.T) {
	fake := &fakeLauncherService{
		launchOut: launcher.LauncherStatus{SimulatorID: "lmu", LaunchMethod: "steam-uri"},
	}
	handleLauncherLaunch("", fake, &spyMainEmitter{}, func(string, ...any) {})
	if fake.launchFor != "lmu" {
		t.Fatalf("expected default simulator 'lmu', got %q", fake.launchFor)
	}
}

// TestLauncherServiceWiringEndToEnd exercises the real *launcher.Service
// through the wiring functions. It writes a config and confirms GetStatus
// reflects it after a Save round-trip via the SettingsService. This catches
// the SettingsBackend interface mismatch silently and proves the wiring
// works against the production types.
func TestLauncherServiceWiringEndToEnd(t *testing.T) {
	emitter := &spyMainEmitter{}
	settings := newTestSettingsService(t)
	svc := launcher.NewService(settings, emitter, nil)

	// Configure a steam-uri entry and confirm it persists via settings.
	cfg := launcher.LauncherConfig{SimulatorID: "lmu", LaunchMethod: "steam-uri"}
	if _, err := svc.Configure(cfg); err != nil {
		t.Fatalf("Configure: %v", err)
	}
	st := settings.GetLaunchers()["lmu"]
	if st.LaunchMethod != "steam-uri" {
		t.Fatalf("expected persisted launchMethod=steam-uri, got %q", st.LaunchMethod)
	}
	if st.SteamAppID != launcher.DefaultLMUAppID {
		t.Fatalf("expected default SteamAppID %d, got %d", launcher.DefaultLMUAppID, st.SteamAppID)
	}

	// Status through the wiring function should return Configured=true.
	handleLauncherStatusGet("lmu", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:status" {
		t.Fatalf("expected launcher:status, got %v", emitter.events)
	}
	if _, ok := emitter.data[0].(map[string]any)["lmu"].(launcher.LauncherStatus); !ok {
		t.Fatalf("expected lmu status payload, got %+v", emitter.data[0])
	}
}

// TestLauncherConfigureHandlerReEmitsSettingsOnRejection makes sure that
// when Configure fails the wiring does NOT re-emit "settings" with stale
// data. This guards against a regression where a rejected configure could
// leave the UI thinking the saved payload is current.
func TestLauncherConfigureHandlerReEmitsSettingsOnRejection(t *testing.T) {
	emitter := &spyMainEmitter{}
	fake := &fakeLauncherService{configureErr: errors.New("invalid config: bad method")}
	settings := newTestSettingsService(t)
	handleLauncherConfigure(
		launcher.LauncherConfig{SimulatorID: "lmu", LaunchMethod: "magic"},
		fake,
		settings,
		emitter,
		func(string, ...any) {},
	)
	for _, e := range emitter.events {
		if e == "settings" {
			t.Fatalf("must not re-emit settings on configure failure, got %v", emitter.events)
		}
	}
}
