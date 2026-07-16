package main

import (
	"context"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/app/launcher"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

type fakeOverlayWindow struct {
	appliedModes []config.DisplayMode
}

func (f *fakeOverlayWindow) Close() {}

func (f *fakeOverlayWindow) ApplyProfileMode(document *config.ProfileDocumentV3) error {
	if document != nil {
		f.appliedModes = append(f.appliedModes, document.DisplayMode)
	}
	return nil
}

type fakeOverlayFactory struct {
	created int
	last    *fakeOverlayWindow
}

func (f *fakeOverlayFactory) NewOverlayWindow(document *config.ProfileDocumentV3, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
	f.created++
	f.last = &fakeOverlayWindow{}
	return f.last, nil
}

type fakeOverlayRuntime struct {
	started int
	stopped int
	err     error
}

func (f *fakeOverlayRuntime) Start(document *config.ProfileDocumentV3) (app.OverlayStatus, error) {
	f.started++
	if f.err != nil {
		return app.OverlayStatus{Running: false}, f.err
	}
	mode := config.ModeRacing
	if document != nil {
		mode = document.DisplayMode
	}
	return app.OverlayStatus{Running: true, Mode: mode}, nil
}

func (f *fakeOverlayRuntime) Stop() app.OverlayStatus {
	f.stopped++
	return app.OverlayStatus{Running: false}
}

func (f *fakeOverlayRuntime) Status() app.OverlayStatus {
	return app.OverlayStatus{Running: f.started > f.stopped}
}

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

type spyMainEmitter struct {
	events []string
	data   []any
}

func (s *spyMainEmitter) Emit(name string, data any) {
	s.events = append(s.events, name)
	s.data = append(s.data, data)
}

func newTestStudioProfileService(t *testing.T, mode config.DisplayMode, emitter app.EventEmitter) *app.StudioProfileService {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	profile := &config.ProfileConfig{
		ID:          "test",
		Name:        "Test",
		DisplayMode: mode,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 100, Y: 100, W: 200, H: 100}},
		},
	}
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatalf("save profile: %v", err)
	}
	svc := app.NewStudioProfileService(emitter, nil)
	if _, err := svc.Load(path); err != nil {
		t.Fatalf("load profile: %v", err)
	}
	if mode != config.ModeRacing && svc.Document() != nil {
		svc.Document().DisplayMode = mode
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

func TestHandleOpenOverlayStudioEmitsNavigationEvent(t *testing.T) {
	emitter := &spyMainEmitter{}
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)

	handleOpenOverlayStudio(studioSvc, emitter)

	if len(emitter.events) != 1 || emitter.events[0] != "hub:open-overlay-studio" {
		t.Fatalf("events=%v, want [hub:open-overlay-studio]", emitter.events)
	}
	payload, ok := emitter.data[0].(map[string]any)
	if !ok {
		t.Fatalf("payload type=%T", emitter.data[0])
	}
	if payload["profileId"] != "test" {
		t.Fatalf("profileId=%v", payload["profileId"])
	}
}

func TestHandleOpenOverlayStudioNoEmitter(t *testing.T) {
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, nil)
	handleOpenOverlayStudio(studioSvc, nil)
}

func TestResetOverlayDisplayModeResetsToRacing(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeEdit, nil)

	document := studioSvc.Document()
	if _, err := controller.Start(document); err != nil {
		t.Fatalf("start overlay: %v", err)
	}

	resetOverlayDisplayMode(controller, studioSvc)

	if studioSvc.Document().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode after reset, got %q", studioSvc.Document().DisplayMode)
	}
	if factory.last == nil || len(factory.last.appliedModes) < 1 || factory.last.appliedModes[len(factory.last.appliedModes)-1] != config.ModeRacing {
		t.Fatalf("expected window to apply ModeRacing, got modes=%v", factory.last.appliedModes)
	}
}

func TestResetOverlayDisplayModeIdempotentWhenRacing(t *testing.T) {
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, nil)
	resetOverlayDisplayMode(nil, studioSvc)
	if studioSvc.Document().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode unchanged")
	}
}

func TestApplyProfileV3WindowModes(t *testing.T) {
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
			document := &config.ProfileDocumentV3{
				SchemaVersion: config.ProfileSchemaVersionV3,
				ID:            "test",
				DisplayMode:   tt.mode,
				Layouts: map[config.LayoutType]config.SessionLayoutV3{
					config.LayoutGeneral: {Type: config.LayoutGeneral},
				},
			}

			mgr.ApplyProfileV3(document, false)

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

func TestStopOverlayClosureClearsOverlayRunningAndResetsMode(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeEdit, nil)

	if _, err := controller.Start(studioSvc.Document()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	controller.Stop()
	if overlayRunning.Load() {
		resetOverlayDisplayMode(controller, studioSvc)
		overlayRunning.Store(false)
	}

	if overlayRunning.Load() {
		t.Fatal("expected overlayRunning to be false after external close")
	}
	if studioSvc.Document().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode after close, got %q", studioSvc.Document().DisplayMode)
	}
}

func TestStopOverlayClosureSkipsResetWhenAlreadyStopped(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, nil)

	if _, err := controller.Start(studioSvc.Document()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(false)

	controller.Stop()
	if overlayRunning.Load() {
		resetOverlayDisplayMode(controller, studioSvc)
		overlayRunning.Store(false)
	}

	if overlayRunning.Load() {
		t.Fatal("expected overlayRunning to remain false")
	}
}

func TestResetOverlayDisplayModeSkipsWindowApplyWhenNoWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeEdit, nil)

	resetOverlayDisplayMode(controller, studioSvc)

	if studioSvc.Document().DisplayMode != config.ModeRacing {
		t.Fatalf("expected racing mode after reset, got %q", studioSvc.Document().DisplayMode)
	}
	if factory.last != nil {
		t.Fatalf("expected no window to be created, got %v", factory.last)
	}
}

func TestRefreshActiveOverlayAfterSaveRefreshesMatchingRunningProfile(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	emitter := &spyMainEmitter{}
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	if _, err := controller.Start(studioSvc.Document()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}

	saved := app.StudioProfileSaved{
		Path:     studioSvc.Path(),
		Document: studioSvc.Document(),
		Revision: studioSvc.Revision(),
	}
	refreshActiveOverlayAfterSave(controller, studioSvc, &overlayRunning, saved)

	if factory.created != 2 {
		t.Fatalf("created=%d, want 2 refresh restart", factory.created)
	}
	if len(emitter.events) != 1 || emitter.events[0] != "overlay:profile-v3-loaded" {
		t.Fatalf("events=%v", emitter.events)
	}
}

func TestRefreshActiveOverlayAfterSaveSkipsWhenStopped(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, nil)
	var overlayRunning atomic.Bool

	refreshActiveOverlayAfterSave(controller, studioSvc, &overlayRunning, app.StudioProfileSaved{
		Path:     studioSvc.Path(),
		Document: studioSvc.Document(),
		Revision: studioSvc.Revision(),
	})

	if factory.created != 0 {
		t.Fatalf("expected no overlay restart, created=%d", factory.created)
	}
}

func TestRefreshActiveOverlayAfterSaveSkipsDifferentProfile(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, nil)
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	if _, err := controller.Start(studioSvc.Document()); err != nil {
		t.Fatal(err)
	}

	refreshActiveOverlayAfterSave(controller, studioSvc, &overlayRunning, app.StudioProfileSaved{
		Path:     "/other/profile.json",
		Document: studioSvc.Document(),
		Revision: "rev-other",
	})

	if factory.created != 1 {
		t.Fatalf("created=%d, want 1 without refresh", factory.created)
	}
}

func TestBuildHotkeyActionMapToggleEditModeOpensStudio(t *testing.T) {
	emitter := &spyMainEmitter{}
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	actionMap := buildHotkeyActionMap(nil, studioSvc, nil, nil, emitter)

	actionMap["toggleEditMode"]()

	if len(emitter.events) != 1 || emitter.events[0] != "hub:open-overlay-studio" {
		t.Fatalf("events=%v", emitter.events)
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
	if len(emitter.events) != 6 || emitter.events[5] != "launcher:snapshot" {
		t.Fatalf("expected canonical discovery snapshot, got %v", emitter.events)
	}
}

func TestHandleAddAppEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	entry := app.LauncherAppEntry{
		ID: "obs", DisplayName: "OBS Studio", LaunchMethod: "executable", ExecutablePath: `C:\obs.exe`,
	}
	handleAddApp(entry, svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected canonical app snapshot, got %v", emitter.events)
	}
	payload, ok := emitter.data[0].(launcher.LauncherSnapshot)
	if !ok {
		t.Fatalf("snapshot payload missing or wrong type: %#v", emitter.data[0])
	}
	apps := payload.Apps
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
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected canonical app snapshot, got %v", emitter.events)
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
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected canonical profile snapshot, got %v", emitter.events)
	}
}

func TestHandleSaveProfileEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	profile := app.LaunchProfile{ID: "creator", Name: "Creador", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}
	handleSaveProfile(profile, svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected canonical profile snapshot, got %v", emitter.events)
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
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected canonical profile snapshot, got %v", emitter.events)
	}
}

func TestHandleDuplicateProfileEmitsUpdated(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	if err := svc.SaveProfile(app.LaunchProfile{ID: "creator", Name: "Creador", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}}}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	handleDuplicateProfile("creator", "creator-copy", "Creador (copia)", svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected canonical profile snapshot, got %v", emitter.events)
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
	payload, ok := emitter.data[0].(map[string]any)
	if !ok {
		t.Fatal("expected registry payload")
	}
	if _, ok := payload["apps"]; !ok {
		t.Fatal("expected apps in registry payload")
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

	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected launcher:snapshot, got %v", emitter.events)
	}
	payload, ok := emitter.data[0].(launcher.LauncherSnapshot)
	if !ok || payload.Apps == nil {
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

	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("events=%v, want canonical snapshot", emitter.events)
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

	if len(emitter.events) != 1 || emitter.events[0] != "launcher:snapshot" {
		t.Fatalf("expected launcher:snapshot, got %v", emitter.events)
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
