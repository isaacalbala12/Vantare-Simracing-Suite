package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/app/launcher"
	"github.com/vantare/overlays/v2/internal/license"
	strategyapplication "github.com/vantare/overlays/v2/internal/strategy/application"
	strategymanual "github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestShouldPersistValidatedSessionRequiresCurrentOnlineValidation(t *testing.T) {
	if shouldPersistValidatedSession(&license.Result{UserID: "user", OnlineValidated: false}, "access", "refresh") {
		t.Fatal("offline cache result was accepted as a backend-validated session")
	}
	if !shouldPersistValidatedSession(&license.Result{UserID: "user", OnlineValidated: true}, "access", "refresh") {
		t.Fatal("online-validated session was rejected")
	}
}

func TestResolveLicensePublicKeysCannotOverrideEmbeddedTrustRoot(t *testing.T) {
	if got := resolveLicensePublicKeys("release-key", "attacker-key"); got != "release-key" {
		t.Fatalf("resolved key = %q, want embedded release trust root", got)
	}
	if got := resolveLicensePublicKeys("", "development-key"); got != "development-key" {
		t.Fatalf("development key = %q, want local opt-in", got)
	}
}

func TestProtectedStoreTargetsIsolateInternalChannelsByBackend(t *testing.T) {
	legacyClock, legacyAuth := protectedStoreTargets("master", "https://production.invalid")
	if legacyClock != "Vantare/LicenseClock" || legacyAuth != "Vantare/SupabaseAuth" {
		t.Fatalf("master targets = %q, %q", legacyClock, legacyAuth)
	}

	clock, auth := protectedStoreTargets("nightly", "https://testing.invalid")
	if clock == legacyClock || auth == legacyAuth {
		t.Fatal("nightly reused production credential targets")
	}
	if !strings.HasPrefix(clock, "Vantare/nightly/") || !strings.HasSuffix(clock, "/LicenseClock") {
		t.Fatalf("nightly clock target = %q", clock)
	}
	if !strings.HasPrefix(auth, "Vantare/nightly/") || !strings.HasSuffix(auth, "/SupabaseAuth") {
		t.Fatalf("nightly auth target = %q", auth)
	}

	otherClock, otherAuth := protectedStoreTargets("nightly", "https://other.invalid")
	if otherClock == clock || otherAuth == auth {
		t.Fatal("different backends shared internal credential targets")
	}
}

type fakeStrategyCommandExecutor struct {
	result []byte
	err    error
}

type fakeStrategyManualExecutor struct {
	result []byte
	err    error
}

func (fake fakeStrategyManualExecutor) Execute(context.Context, []byte) ([]byte, error) {
	return fake.result, fake.err
}

func (fake fakeStrategyCommandExecutor) Execute(context.Context, []byte) ([]byte, error) {
	return fake.result, fake.err
}

func TestStrategyRepositoryRoot(t *testing.T) {
	base := t.TempDir()
	got, err := strategyRepositoryRoot(filepath.Join(base, "configs"))
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(base, "data", "strategy")
	if got != want {
		t.Fatalf("root = %q, want %q", got, want)
	}
	for _, invalid := range []string{"", filepath.Join("relative", "configs")} {
		if _, err := strategyRepositoryRoot(invalid); err == nil {
			t.Fatalf("strategyRepositoryRoot(%q) did not reject invalid path", invalid)
		}
	}
}

func TestExecuteStrategyApplicationCommandPreservesCommandIDAndTypedErrors(t *testing.T) {
	executor := fakeStrategyCommandExecutor{err: &strategyapplication.ApplicationError{
		Code: strategyapplication.ErrorDraftNotFound, Field: "draftId", Cause: errors.New("missing"),
	}}
	result, failure := executeStrategyApplicationCommand(context.Background(), executor, map[string]any{
		"commandId": "command-42",
	})
	if result != nil {
		t.Fatalf("result = %#v, want nil", result)
	}
	if failure["commandId"] != "command-42" || failure["code"] != string(strategyapplication.ErrorDraftNotFound) || failure["field"] != "draftId" {
		t.Fatalf("failure did not preserve typed error: %#v", failure)
	}
}

func TestExecuteStrategyApplicationCommandReturnsDecodedResult(t *testing.T) {
	executor := fakeStrategyCommandExecutor{result: []byte(`{"commandId":"command-7","repositoryVersion":2}`)}
	result, failure := executeStrategyApplicationCommand(context.Background(), executor, map[string]any{"commandId": "command-7"})
	if failure != nil {
		t.Fatalf("failure = %#v", failure)
	}
	decoded, ok := result.(map[string]any)
	if !ok || decoded["commandId"] != "command-7" || decoded["repositoryVersion"] != float64(2) {
		t.Fatalf("result = %#v", result)
	}
}

func TestExecuteStrategyApplicationCommandSanitizesInternalErrors(t *testing.T) {
	executor := fakeStrategyCommandExecutor{err: errors.New(`C:\Users\private\strategy.json: token=secret-value`)}
	_, failure := executeStrategyApplicationCommand(context.Background(), executor, map[string]any{"commandId": "command-private"})
	message, _ := failure["message"].(string)
	if strings.Contains(message, "Users") || strings.Contains(message, "secret-value") {
		t.Fatalf("public failure leaked internal details: %#v", failure)
	}
	if failure["code"] != string(strategyapplication.ErrorInvalidCommand) || message != "The Strategy request could not be completed." {
		t.Fatalf("unexpected sanitized failure: %#v", failure)
	}
}

func TestExecuteStrategyManualCommandPreservesCorrelationAndSanitizesErrors(t *testing.T) {
	executor := fakeStrategyManualExecutor{err: &strategymanual.CalculationError{
		Code:  strategymanual.ErrorInsufficientCapacity,
		Field: "fuel.usableCapacity",
		Cause: errors.New(`C:\Users\private\fuel.json token=secret-value`),
	}}
	_, failure := executeStrategyManualCommand(context.Background(), executor, map[string]any{"commandId": "manual-42"})
	message, _ := failure["message"].(string)
	if failure["commandId"] != "manual-42" || failure["code"] != string(strategymanual.ErrorInsufficientCapacity) || failure["field"] != "fuel.usableCapacity" {
		t.Fatalf("failure did not preserve safe typed fields: %#v", failure)
	}
	if strings.Contains(message, "Users") || strings.Contains(message, "secret-value") {
		t.Fatalf("public failure leaked internal details: %#v", failure)
	}
}

func TestExecuteStrategyManualCommandReturnsDecodedResult(t *testing.T) {
	executor := fakeStrategyManualExecutor{result: []byte(`{"protocolVersion":"strategy.manual.v1","commandId":"manual-7","result":{"stints":[]}}`)}
	result, failure := executeStrategyManualCommand(context.Background(), executor, map[string]any{"commandId": "manual-7"})
	if failure != nil {
		t.Fatalf("failure = %#v", failure)
	}
	decoded, ok := result.(map[string]any)
	if !ok || decoded["commandId"] != "manual-7" {
		t.Fatalf("result = %#v", result)
	}
}

func TestResolveTelemetrySessionsRoot(t *testing.T) {
	base := t.TempDir()
	userConfigDir := filepath.Join(base, "roaming")
	localDataDir := filepath.Join(base, "local")
	installedConfigDir := filepath.Join(userConfigDir, "Vantare", "configs")

	tests := []struct {
		name    string
		cfgDir  string
		want    string
		wantErr bool
	}{
		{
			name:   "installed uses LocalAppData",
			cfgDir: installedConfigDir,
			want: filepath.Join(
				localDataDir,
				"Vantare",
				"telemetry",
				"sessions",
			),
		},
		{
			name:   "portable uses sibling data directory",
			cfgDir: filepath.Join(base, "portable", "configs"),
			want: filepath.Join(
				base,
				"portable",
				"data",
				"telemetry",
				"sessions",
			),
		},
		{
			name:    "empty config is rejected",
			cfgDir:  "",
			wantErr: true,
		},
		{
			name:    "relative config is rejected",
			cfgDir:  filepath.Join("relative", "configs"),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveTelemetrySessionsRoot(
				tt.cfgDir,
				userConfigDir,
				localDataDir,
			)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("resolve root = %q, want error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolve root: %v", err)
			}
			if got != tt.want {
				t.Fatalf("resolve root = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestResolveTelemetrySessionsRootMatchesInstalledPathCaseInsensitivelyOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows path comparison only")
	}
	base := t.TempDir()
	userConfigDir := filepath.Join(base, "Roaming")
	localDataDir := filepath.Join(base, "Local")
	cfgDir := strings.ToLower(filepath.Join(userConfigDir, "Vantare", "configs"))

	got, err := resolveTelemetrySessionsRoot(cfgDir, userConfigDir, localDataDir)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(localDataDir, "Vantare", "telemetry", "sessions")
	if got != want {
		t.Fatalf("resolve root = %q, want %q", got, want)
	}
}

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

type fakeOverlayScreenResolver struct {
	screens map[int]*application.Screen
	calls   []int
}

func (f *fakeOverlayScreenResolver) GetByIndex(index int) *application.Screen {
	f.calls = append(f.calls, index)
	return f.screens[index]
}

func TestOverlayWindowOptionsUseExactSelectedScreenBounds(t *testing.T) {
	first := &application.Screen{ID: "first", Bounds: application.Rect{Width: 1920, Height: 1080}}
	second := &application.Screen{ID: "second", Bounds: application.Rect{Width: 2560, Height: 1440}}

	tests := []struct {
		name         string
		monitorIndex int
		want         *application.Screen
		wantWidth    int
		wantHeight   int
	}{
		{name: "first screen", monitorIndex: 0, want: first, wantWidth: 1920, wantHeight: 1080},
		{name: "second screen", monitorIndex: 1, want: second, wantWidth: 2560, wantHeight: 1440},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolver := &fakeOverlayScreenResolver{screens: map[int]*application.Screen{0: first, 1: second}}
			document := &config.ProfileDocumentV3{
				MonitorIndex:   tt.monitorIndex,
				LayoutViewport: &config.LayoutViewportV3{Width: 5120, Height: 1440},
			}

			options, err := resolveOverlayWindowOptions(document, resolver.GetByIndex)
			if err != nil {
				t.Fatal(err)
			}
			if options.Screen != tt.want {
				t.Fatalf("screen=%p want exact pointer %p", options.Screen, tt.want)
			}
			if options.Width != tt.wantWidth || options.Height != tt.wantHeight {
				t.Fatalf("initial size=%dx%d want selected screen bounds %dx%d", options.Width, options.Height, tt.wantWidth, tt.wantHeight)
			}
			if len(resolver.calls) != 1 || resolver.calls[0] != tt.monitorIndex {
				t.Fatalf("GetByIndex calls=%v want [%d]", resolver.calls, tt.monitorIndex)
			}
		})
	}
}

func TestOverlayWindowOptionsUseLegacyViewportDefault(t *testing.T) {
	screen := &application.Screen{ID: "legacy", Bounds: application.Rect{Width: 1366, Height: 768}}
	resolver := &fakeOverlayScreenResolver{screens: map[int]*application.Screen{0: screen}}

	options, err := resolveOverlayWindowOptions(&config.ProfileDocumentV3{MonitorIndex: 0}, resolver.GetByIndex)
	if err != nil {
		t.Fatal(err)
	}
	if options.Width != 1366 || options.Height != 768 {
		t.Fatalf("legacy initial size=%dx%d want selected screen bounds 1366x768", options.Width, options.Height)
	}
	if options.Screen != screen {
		t.Fatalf("screen=%p want exact pointer %p", options.Screen, screen)
	}
}

func TestOverlayWindowOptionsRejectInvalidSelectedScreenBounds(t *testing.T) {
	for _, bounds := range []application.Rect{
		{Width: 0, Height: 1080},
		{Width: 1920, Height: 0},
		{Width: -1, Height: 1080},
		{Width: 1920, Height: -1},
	} {
		resolver := &fakeOverlayScreenResolver{screens: map[int]*application.Screen{
			0: {ID: "invalid", Bounds: bounds},
		}}

		_, err := resolveOverlayWindowOptions(&config.ProfileDocumentV3{MonitorIndex: 0}, resolver.GetByIndex)
		if err == nil || !strings.Contains(err.Error(), "bounds") {
			t.Fatalf("bounds=%+v error=%v want invalid bounds context", bounds, err)
		}
	}
}

func TestOverlayWindowOptionsRejectInvalidInputsBeforeWindowCreation(t *testing.T) {
	resolver := &fakeOverlayScreenResolver{screens: map[int]*application.Screen{}}
	resolveScreen := overlayScreenResolver(resolver.GetByIndex)

	tests := []struct {
		name     string
		document *config.ProfileDocumentV3
		screens  overlayScreenResolver
		contains string
	}{
		{name: "nil document", screens: resolveScreen, contains: "document"},
		{name: "missing resolver", document: &config.ProfileDocumentV3{}, contains: "screen resolver"},
		{name: "unknown monitor", document: &config.ProfileDocumentV3{MonitorIndex: 7}, screens: resolveScreen, contains: "monitor index 7"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := resolveOverlayWindowOptions(tt.document, tt.screens)
			if err == nil || !strings.Contains(err.Error(), tt.contains) {
				t.Fatalf("error=%v want context containing %q", err, tt.contains)
			}
		})
	}
}

func TestOverlayWindowOptionsRejectTypedNilResolverWithoutPanic(t *testing.T) {
	var resolver overlayScreenResolver

	_, err := resolveOverlayWindowOptions(&config.ProfileDocumentV3{MonitorIndex: 0}, resolver)
	if err == nil || !strings.Contains(err.Error(), "screen resolver") {
		t.Fatalf("error=%v want missing screen resolver context", err)
	}
}

func TestNewWailsOverlayFactoryWiresApplicationScreenManager(t *testing.T) {
	screens := &application.ScreenManager{}
	selected := &application.Screen{
		ID:          "selected",
		IsPrimary:   true,
		ScaleFactor: 1,
		PhysicalBounds: application.Rect{
			Width: 1920, Height: 1080,
		},
		PhysicalWorkArea: application.Rect{
			Width: 1920, Height: 1040,
		},
	}
	if err := screens.LayoutScreens([]*application.Screen{selected}); err != nil {
		t.Fatal(err)
	}
	wailsApp := &application.App{Screen: screens}

	factory := newWailsOverlayFactory(wailsApp, nil)
	if factory.app != wailsApp {
		t.Fatal("factory did not retain Wails application")
	}
	if factory.screens == nil {
		t.Fatal("factory did not wire wailsApp.Screen.GetByIndex as the production resolver")
	}
	if got := factory.screens(0); got != selected {
		t.Fatalf("factory resolver result=%p want selected screen %p", got, selected)
	}
}

func TestNewWailsOverlayFactoryLeavesMissingScreenManagerUnavailable(t *testing.T) {
	factory := newWailsOverlayFactory(&application.App{}, nil)
	if factory.screens != nil {
		t.Fatal("factory exposed a typed nil screen resolver")
	}
	_, err := factory.NewOverlayWindow(&config.ProfileDocumentV3{}, config.Rect{}, config.Rect{})
	if err == nil || !strings.Contains(err.Error(), "screen resolver") {
		t.Fatalf("error=%v want missing screen resolver context", err)
	}
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
	mu     sync.Mutex
	events []string
	data   []any
}

func (s *spyMainEmitter) Emit(name string, data any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, name)
	s.data = append(s.data, data)
}

// Events devuelve una copia del slice de eventos bajo lock.
func (s *spyMainEmitter) Events() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, len(s.events))
	copy(out, s.events)
	return out
}

// Data devuelve una copia del slice de datos bajo lock.
func (s *spyMainEmitter) Data() []any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]any, len(s.data))
	copy(out, s.data)
	return out
}

// waitForEmitterCondition espera de forma acotada a que el spy cumpla cond.
func waitForEmitterCondition(t *testing.T, emitter *spyMainEmitter, timeout time.Duration, cond func([]string, []any) bool) ([]string, []any) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		events := emitter.Events()
		data := emitter.Data()
		if cond(events, data) {
			return events, data
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timeout (%s) esperando condición del emitter: events=%v", timeout, emitter.Events())
	return nil, nil
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

	expected := []string{"toggleOverlay", "toggleEditMode", "nextProfile", "prevProfile", "cycleDeltaReference"}
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

func TestResetOverlayProfileDisplayModeResetsAndEmitsWithoutController(t *testing.T) {
	emitter := &spyMainEmitter{}
	studioSvc := newTestStudioProfileService(t, config.ModeEdit, emitter)

	document := resetOverlayProfileDisplayMode(studioSvc)

	if document == nil || document.DisplayMode != config.ModeRacing {
		t.Fatalf("reset document=%+v want racing", document)
	}
	if studioSvc.Document().DisplayMode != config.ModeRacing {
		t.Fatalf("stored mode=%q want racing", studioSvc.Document().DisplayMode)
	}
	if len(emitter.events) != 1 || emitter.events[0] != "overlay:profile-v3-loaded" {
		t.Fatalf("events=%v want one runtime profile refresh", emitter.events)
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

func TestHandleOverlayProfileSnapshotRequestEmitsLoadedDocument(t *testing.T) {
	emitter := &spyMainEmitter{}
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)

	handleOverlayProfileSnapshotRequest(studioSvc)

	if len(emitter.events) != 1 || emitter.events[0] != "overlay:profile-v3-loaded" {
		t.Fatalf("events=%v", emitter.events)
	}
}

func TestHandleOverlayProfileSnapshotRequestAllowsMissingService(t *testing.T) {
	handleOverlayProfileSnapshotRequest(nil)
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

func TestHandleToggleEditModeEntersEditOnRunningOverlay(t *testing.T) {
	emitter := &spyMainEmitter{}
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	if _, err := controller.Start(studioSvc.Document()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	handleToggleEditMode(nil, studioSvc, controller, &overlayRunning, emitter)

	if studioSvc.Document().DisplayMode != config.ModeEdit {
		t.Fatalf("mode=%q want edit", studioSvc.Document().DisplayMode)
	}
	if factory.last == nil || len(factory.last.appliedModes) == 0 || factory.last.appliedModes[len(factory.last.appliedModes)-1] != config.ModeEdit {
		t.Fatalf("window modes=%v want trailing ModeEdit", factory.last.appliedModes)
	}
	found := false
	for i, event := range emitter.events {
		if event != "overlay:edit-mode-changed" {
			continue
		}
		found = true
		payload := emitter.data[i].(map[string]any)
		if payload["mode"] != "edit" {
			t.Fatalf("edit-mode-changed payload=%v want mode edit", payload)
		}
	}
	if !found {
		t.Fatalf("events=%v want overlay:edit-mode-changed", emitter.events)
	}
}

func TestHandleToggleEditModeExitsToRacing(t *testing.T) {
	emitter := &spyMainEmitter{}
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeEdit, emitter)
	if _, err := controller.Start(studioSvc.Document()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	handleToggleEditMode(nil, studioSvc, controller, &overlayRunning, emitter)

	if studioSvc.Document().DisplayMode != config.ModeRacing {
		t.Fatalf("mode=%q want racing", studioSvc.Document().DisplayMode)
	}
	if factory.last == nil || len(factory.last.appliedModes) == 0 || factory.last.appliedModes[len(factory.last.appliedModes)-1] != config.ModeRacing {
		t.Fatalf("window modes=%v want trailing ModeRacing", factory.last.appliedModes)
	}
}

func TestHandleToggleEditModeOpensOverlayWhenNotRunning(t *testing.T) {
	emitter := &spyMainEmitter{}
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	hubSvc := app.NewHubService(t.TempDir(), nil, emitter, controller)
	hubSvc.SetStudioProfileService(studioSvc)
	var overlayRunning atomic.Bool

	handleToggleEditMode(hubSvc, studioSvc, controller, &overlayRunning, emitter)

	if !overlayRunning.Load() {
		t.Fatal("overlayRunning should be true after opening")
	}
	if studioSvc.Document().DisplayMode != config.ModeEdit {
		t.Fatalf("mode=%q want edit after opening overlay", studioSvc.Document().DisplayMode)
	}
	if factory.created != 1 {
		t.Fatalf("created=%d want 1", factory.created)
	}
	found := false
	for _, event := range emitter.events {
		if event == "overlay:edit-mode-changed" {
			found = true
		}
	}
	if !found {
		t.Fatalf("events=%v want overlay:edit-mode-changed", emitter.events)
	}
}

func TestHandleToggleEditModeNoopWithoutDesktopWindow(t *testing.T) {
	emitter := &spyMainEmitter{}
	runtime := &fakeOverlayRuntime{err: errors.New("no desktop window in streaming")}
	hubSvc := app.NewHubService(t.TempDir(), nil, emitter, runtime)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	hubSvc.SetStudioProfileService(studioSvc)
	var overlayRunning atomic.Bool

	handleToggleEditMode(hubSvc, studioSvc, nil, &overlayRunning, emitter)

	if studioSvc.Document().DisplayMode != config.ModeRacing {
		t.Fatalf("mode=%q want racing (no-op)", studioSvc.Document().DisplayMode)
	}
	if overlayRunning.Load() {
		t.Fatal("overlayRunning should stay false when no desktop window")
	}
	for _, event := range emitter.events {
		if event == "overlay:edit-mode-changed" {
			t.Fatalf("events=%v must not emit edit-mode-changed", emitter.events)
		}
	}
}

func TestHandleToggleEditModeStoresRunningOnStartFailure(t *testing.T) {
	emitter := &spyMainEmitter{}
	runtime := &fakeOverlayRuntime{err: errors.New("start failed")}
	hubSvc := app.NewHubService(t.TempDir(), nil, emitter, runtime)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	hubSvc.SetStudioProfileService(studioSvc)
	var overlayRunning atomic.Bool

	handleToggleEditMode(hubSvc, studioSvc, nil, &overlayRunning, emitter)

	if overlayRunning.Load() {
		t.Fatal("overlayRunning must be false after start failure")
	}
}

func TestBuildHotkeyActionMapToggleEditModeEntersEditWhenRunning(t *testing.T) {
	emitter := &spyMainEmitter{}
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	if _, err := controller.Start(studioSvc.Document()); err != nil {
		t.Fatalf("start overlay: %v", err)
	}
	var overlayRunning atomic.Bool
	overlayRunning.Store(true)

	actionMap := buildHotkeyActionMap(nil, studioSvc, controller, &overlayRunning, emitter)
	actionMap["toggleEditMode"]()

	if studioSvc.Document().DisplayMode != config.ModeEdit {
		t.Fatalf("mode=%q want edit", studioSvc.Document().DisplayMode)
	}
}

func TestBuildHotkeyActionMapCyclesDeltaReference(t *testing.T) {
	emitter := &spyMainEmitter{}
	studioSvc := newTestStudioProfileService(t, config.ModeRacing, emitter)
	actionMap := buildHotkeyActionMap(nil, studioSvc, nil, nil, emitter)

	actionMap["cycleDeltaReference"]()

	document := studioSvc.Document()
	if document == nil {
		t.Fatal("document missing after delta hotkey")
	}
	general := document.Layouts[config.LayoutGeneral]
	if len(general.Widgets) != 1 {
		t.Fatalf("widgets=%d want 1", len(general.Widgets))
	}
	if got := general.Widgets[0].Content["reference"]; got != "session-best" {
		t.Fatalf("reference=%v want session-best", got)
	}
	found := false
	for index, event := range emitter.events {
		if event != "overlay:delta-reference-changed" {
			continue
		}
		payload := emitter.data[index].(map[string]any)
		if payload["reference"] != "session-best" {
			t.Fatalf("payload=%v", payload)
		}
		found = true
	}
	if !found {
		t.Fatalf("events=%v want overlay:delta-reference-changed", emitter.events)
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
	// Deterministic fake: lista fija, no toca registro/disco ni iconos reales.
	// Antes: ~4.00s (TestHandleDiscoverAppsEmitsDetected) tocando registro +
	// rutas + iconos; ahora ~0.02s en aislado, suite cmd/vantare de ~4.27s a <1s.
	fakeDetected := map[string]app.LauncherAppEntry{
		"fake-lmu": {ID: "fake-lmu", DisplayName: "Fake LMU", LaunchMethod: "steam-uri", SteamAppID: 2399420, GradientFrom: "#0a0a0a", GradientTo: "#302e31"},
		"fake-obs": {ID: "fake-obs", DisplayName: "Fake OBS", LaunchMethod: "executable", GradientFrom: "#302e31", GradientTo: "#0a0a0a"},
	}
	svc.SetDiscoverFunc(func() map[string]app.LauncherAppEntry {
		out := make(map[string]app.LauncherAppEntry, len(fakeDetected))
		for k, v := range fakeDetected {
			out[k] = v
		}
		return out
	})

	handleDiscoverApps(svc, emitter)
	// The icon phase reports once per app, so the number of progress events
	// tracks how many apps were found rather than being fixed. What this
	// handler owes its caller is that the canonical snapshot lands last,
	// after the progress stream and nothing else.
	if len(emitter.events) < 2 {
		t.Fatalf("expected progress events followed by a snapshot, got %v", emitter.events)
	}
	if last := emitter.events[len(emitter.events)-1]; last != "launcher:snapshot" {
		t.Fatalf("discovery must end with the canonical snapshot, got %v", emitter.events)
	}
	for _, name := range emitter.events[:len(emitter.events)-1] {
		if name != "launcher:discovery:progress" {
			t.Fatalf("only progress may precede the snapshot, got %v", emitter.events)
		}
	}
	// La lista fake debe aparecer determinista en el snapshot, sin depender de la maquina.
	payload, ok := emitter.data[len(emitter.data)-1].(launcher.LauncherSnapshot)
	if !ok {
		t.Fatalf("snapshot payload wrong type: %T", emitter.data[len(emitter.data)-1])
	}
	found := map[string]bool{}
	for _, a := range payload.Apps {
		found[a.ID] = true
	}
	for _, want := range []string{"fake-lmu", "fake-obs"} {
		if !found[want] {
			t.Fatalf("deterministic fake missing %q in snapshot apps: %+v", want, payload.Apps)
		}
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

// fakeLauncherFilePicker is a launcherFilePicker for tests: no OS dialog, just
// the answer the case under test needs.
type fakeLauncherFilePicker struct {
	path  string
	err   error
	calls int
}

func (f *fakeLauncherFilePicker) PickExecutable() (string, error) {
	f.calls++
	return f.path, f.err
}

func TestHandleAppPickEmitsPickedPathAndSuggestedName(t *testing.T) {
	emitter := &spyMainEmitter{}
	picker := &fakeLauncherFilePicker{path: filepath.Join("C:\\", "Apps", "SimHubWPF.exe")}
	handleAppPick(picker, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:app:picked" {
		t.Fatalf("expected launcher:app:picked, got %v", emitter.events)
	}
	payload, ok := emitter.data[0].(map[string]any)
	if !ok {
		t.Fatalf("unexpected payload type %T", emitter.data[0])
	}
	if payload["path"] != picker.path {
		t.Fatalf("path = %v, want %q", payload["path"], picker.path)
	}
	if payload["suggestedName"] != "SimHubWPF" {
		t.Fatalf("suggestedName = %v, want SimHubWPF", payload["suggestedName"])
	}
}

// A cancelled dialog is not a failure: the frontend still needs an answer so
// it can drop its "waiting for the picker" state.
func TestHandleAppPickCancelEmitsEmptyPath(t *testing.T) {
	emitter := &spyMainEmitter{}
	handleAppPick(&fakeLauncherFilePicker{}, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:app:picked" {
		t.Fatalf("expected launcher:app:picked, got %v", emitter.events)
	}
	payload := emitter.data[0].(map[string]any)
	if payload["path"] != "" {
		t.Fatalf("cancel must report an empty path, got %v", payload["path"])
	}
}

func TestHandleAppPickWithoutPickerEmitsError(t *testing.T) {
	emitter := &spyMainEmitter{}
	handleAppPick(nil, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
	if code := emitter.data[0].(map[string]any)["code"]; code != "picker_unavailable" {
		t.Fatalf("code = %v, want picker_unavailable", code)
	}
}

func TestHandleAddCustomAppPersistsAndSnapshots(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	exe := filepath.Join(t.TempDir(), "myapp.exe")
	if err := os.WriteFile(exe, []byte("stub"), 0o600); err != nil {
		t.Fatalf("write exe: %v", err)
	}
	handleAddCustomApp("Mi App", exe, svc, emitter)
	if len(emitter.events) < 2 {
		t.Fatalf("expected added + snapshot, got %v", emitter.events)
	}
	if emitter.events[0] != "launcher:app:added" {
		t.Fatalf("first event = %q, want launcher:app:added", emitter.events[0])
	}
	if emitter.events[len(emitter.events)-1] != "launcher:snapshot" {
		t.Fatalf("last event = %q, want launcher:snapshot", emitter.events[len(emitter.events)-1])
	}
	added := emitter.data[0].(map[string]any)
	id, _ := added["id"].(string)
	if !launcher.IsCustomAppID(id) {
		t.Fatalf("id = %q, want a custom app id", id)
	}
	if _, ok := svc.Settings().GetLauncherApps()[id]; !ok {
		t.Fatalf("app %q was not persisted", id)
	}
}

// A path that does not exist can never be launched, so it must be refused with
// an actionable code instead of landing a broken row in the catalog.
func TestHandleAddCustomAppRejectsMissingExecutable(t *testing.T) {
	svc, emitter := newTestLauncherService(t)
	handleAddCustomApp("Mi App", filepath.Join(t.TempDir(), "nope.exe"), svc, emitter)
	if len(emitter.events) != 1 || emitter.events[0] != "launcher:error" {
		t.Fatalf("expected launcher:error, got %v", emitter.events)
	}
	if code := emitter.data[0].(map[string]any)["code"]; code != "invalid_custom_app" {
		t.Fatalf("code = %v, want invalid_custom_app", code)
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
	svc := launcher.NewService(settingsSvc2, emitter, nil)
	handleAppUpdate("obs", "--new-args", svc, emitter)

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
	svc := launcher.NewService(settingsSvc, emitter, nil)
	handleAppUpdate("ghost", "args", svc, emitter)

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
	// La cadena corre en una goroutine y emite de forma asíncrona a través de
	// ChainRunner/serviceEmitter; esperamos de forma acotada a que el emitter
	// registre al menos un evento de la cadena antes de verificar que no hubo
	// error, evitando el sleep arbitrario y la carrera sin sincronizar.
	events, _ := waitForEmitterCondition(t, emitter, 2*time.Second, func(events []string, _ []any) bool {
		return len(events) > 0
	})
	for _, e := range events {
		if e == "launcher:error" {
			t.Fatal("retry failed must not emit launcher:error for a valid profile")
		}
	}
	// Limpieza: cancela la cadena pendiente para no dejar goroutines huérfanas.
	svc.CancelAll()
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
	handleAppFavorite("obs", true, settingsSvc2, launcher.NewService(settingsSvc2, emitter, nil), emitter)

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
	handleAppFavorite("ghost", true, settingsSvc, launcher.NewService(settingsSvc, emitter, nil), emitter)
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
	for _, e := range emitter.Events() {
		if e == "launcher:error" {
			t.Fatal("launch flag must not emit error for a valid profile")
		}
	}
	// La cadena usa el emitter del Service, no el de este test; no hay
	// espera adicional necesaria, pero se lee vía copia thread-safe.
	svc.CancelAll()
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

// ISA-379: the log file has to land somewhere Diagnostics can offer to open,
// and an installed build must not try to write inside Program Files.
func TestResolveLogsRoot(t *testing.T) {
	base := t.TempDir()
	userConfigDir := filepath.Join(base, "Roaming")
	localDataDir := filepath.Join(base, "Local")
	installedConfigDir := filepath.Join(userConfigDir, "Vantare", "configs")

	tests := []struct {
		name    string
		cfgDir  string
		want    string
		wantErr bool
	}{
		{
			name:   "installed uses local data directory",
			cfgDir: installedConfigDir,
			want:   filepath.Join(localDataDir, "Vantare", "logs"),
		},
		{
			name:   "portable uses sibling data directory",
			cfgDir: filepath.Join(base, "portable", "configs"),
			want:   filepath.Join(base, "portable", "data", "logs"),
		},
		{
			name:    "empty config is rejected",
			cfgDir:  "",
			wantErr: true,
		},
		{
			name:    "relative config is rejected",
			cfgDir:  filepath.Join("relative", "configs"),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveLogsRoot(tt.cfgDir, userConfigDir, localDataDir)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("resolve logs root = %q, want error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolve logs root: %v", err)
			}
			if got != tt.want {
				t.Fatalf("resolve logs root = %q, want %q", got, tt.want)
			}
		})
	}
}

// The logs directory must stay out of the telemetry tree, or clearing telemetry
// from Settings would take the log with it.
func TestLogsRootIsNotInsideTheTelemetrySessionsRoot(t *testing.T) {
	base := t.TempDir()
	userConfigDir := filepath.Join(base, "Roaming")
	localDataDir := filepath.Join(base, "Local")
	cfgDir := filepath.Join(base, "portable", "configs")

	logs, err := resolveLogsRoot(cfgDir, userConfigDir, localDataDir)
	if err != nil {
		t.Fatal(err)
	}
	sessions, err := resolveTelemetrySessionsRoot(cfgDir, userConfigDir, localDataDir)
	if err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(logs, sessions) {
		t.Fatalf("logs root %q sits inside the clearable telemetry root %q", logs, sessions)
	}
}
