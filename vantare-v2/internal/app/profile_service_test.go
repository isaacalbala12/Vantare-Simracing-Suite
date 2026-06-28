package app_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

// fakeWindow implements window.WindowHandle for testing.
type fakeWindow struct {
	lastBounds  window.WailsRect
	ignoreMouse bool
	resizable   bool
	fullscreen  bool
}

func (f *fakeWindow) SetBounds(bounds window.WailsRect) { f.lastBounds = bounds }
func (f *fakeWindow) SetSize(width, height int) {
	f.lastBounds.Width = width
	f.lastBounds.Height = height
}
func (f *fakeWindow) SetPosition(x, y int)             { f.lastBounds.X = x; f.lastBounds.Y = y }
func (f *fakeWindow) SetIgnoreMouseEvents(ignore bool) { f.ignoreMouse = ignore }
func (f *fakeWindow) SetResizable(b bool)              { f.resizable = b }
func (f *fakeWindow) Fullscreen()                      { f.fullscreen = true }
func (f *fakeWindow) UnFullscreen()                    { f.fullscreen = false }

// spyEmitter records emitted events for assertions.
type spyEmitter struct {
	events []string
	data   []any
}

func (s *spyEmitter) Emit(name string, data any) {
	s.events = append(s.events, name)
	s.data = append(s.data, data)
}

func TestProfileServiceLoadAndGet(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	svc := app.NewProfileService("../../configs/example-racing.json", mgr, nil)

	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}
	p := svc.GetProfile()
	if p == nil {
		t.Fatal("expected profile")
	}
	if p.DisplayMode != config.ModeRacing {
		t.Fatalf("mode=%q, want racing", p.DisplayMode)
	}
	if len(p.Widgets) < 2 {
		t.Fatalf("expected at least 2 widgets, got %d", len(p.Widgets))
	}
}

func TestProfileServiceSaveLayout(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")

	// Create initial profile
	original := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	}
	config.SaveFile(path, original)

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	spy := &spyEmitter{}
	svc := app.NewProfileService(path, mgr, spy)
	svc.Load()

	// Update widget positions
	newWidgets := []config.WidgetConfig{
		{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 50, Y: 60, W: 200, H: 80}},
	}
	if err := svc.SaveLayout(newWidgets); err != nil {
		t.Fatal(err)
	}

	// Verify in-memory updated
	if svc.GetProfile().Widgets[0].Position.X != 50 {
		t.Fatalf("in-memory X=%d, want 50", svc.GetProfile().Widgets[0].Position.X)
	}

	// Verify file on disk
	reloaded, _ := config.LoadFile(path)
	if reloaded.Widgets[0].Position.X != 50 {
		t.Fatalf("disk X=%d, want 50", reloaded.Widgets[0].Position.X)
	}

	// Verify window mode was refreshed (skipRefresh=true): for fullscreen racing
	// this must not toggle any mode state, only bounds. The fake window starts
	// with default zero values, so we just verify no fullscreen/UnFullscreen or
	// ignoreMouse/resizable calls happened.
	if fw.fullscreen {
		t.Fatal("skipRefresh must not call Fullscreen")
	}
	if fw.ignoreMouse {
		t.Fatal("skipRefresh must not call SetIgnoreMouseEvents")
	}
	if fw.resizable {
		t.Fatal("skipRefresh must not call SetResizable")
	}

	if len(spy.events) != 3 || spy.events[0] != "layout:saved" || spy.events[1] != "profile:saved" || spy.events[2] != "profile:loaded" {
		t.Fatalf("events=%v, want [layout:saved profile:saved profile:loaded]", spy.events)
	}
}

func TestProfileServiceSaveLayoutShrinkWrapWhenNotFullscreen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")

	// Use a non-fullscreen mode to exercise the shrink-wrap path.
	original := &config.ProfileConfig{
		DisplayMode: config.DisplayMode("streaming"),
		Widgets: []config.WidgetConfig{
			{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	}
	config.SaveFile(path, original)

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	spy := &spyEmitter{}
	svc := app.NewProfileService(path, mgr, spy)
	svc.Load()

	newWidgets := []config.WidgetConfig{
		{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 50, Y: 60, W: 200, H: 80}},
	}
	if err := svc.SaveLayout(newWidgets); err != nil {
		t.Fatal(err)
	}

	// Streaming/off-screen mode still updates bounds via SetPosition/SetSize.
	if fw.lastBounds.Width == 0 {
		t.Fatal("expected SetSize to be called for non-fullscreen mode")
	}
}

func TestProfileServiceSetDisplayMode(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	svc := app.NewProfileService("../../configs/example-racing.json", mgr, nil)
	svc.Load()

	// Switch to edit mode
	svc.SetDisplayMode(config.ModeEdit)

	if svc.GetProfile().DisplayMode != config.ModeEdit {
		t.Fatal("display mode not updated")
	}
	if !fw.fullscreen {
		t.Fatal("edit mode should fullscreen")
	}
	if fw.ignoreMouse {
		t.Fatal("edit mode should not ignore mouse")
	}
}

func TestProfileServiceEmitLoadedEditModeOriginZero(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")
	if err := config.SaveFile(path, &config.ProfileConfig{
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
		},
	}); err != nil {
		t.Fatal(err)
	}

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	spy := &spyEmitter{}
	svc := app.NewProfileService(path, mgr, spy)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	svc.EmitLoaded()

	if len(spy.events) != 1 || spy.events[0] != "profile:loaded" {
		t.Fatalf("events=%v, want [profile:loaded]", spy.events)
	}
	payload, ok := spy.data[0].(map[string]any)
	if !ok {
		t.Fatalf("payload type=%T", spy.data[0])
	}
	origin, ok := payload["layoutOrigin"].(config.Rect)
	if !ok {
		t.Fatalf("layoutOrigin type=%T", payload["layoutOrigin"])
	}
	if origin.X != 0 || origin.Y != 0 {
		t.Fatalf("edit mode origin=(%d,%d), want (0,0)", origin.X, origin.Y)
	}
	if mode, ok := payload["windowMode"].(string); !ok || mode != string(config.ModeEdit) {
		t.Fatalf("windowMode=%v, want %q", payload["windowMode"], config.ModeEdit)
	}
}

func TestProfileServiceEmitLoadedRacingModeOriginZero(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")
	if err := config.SaveFile(path, &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
		},
	}); err != nil {
		t.Fatal(err)
	}

	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	spy := &spyEmitter{}
	svc := app.NewProfileService(path, mgr, spy)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	svc.EmitLoaded()

	if len(spy.events) != 1 || spy.events[0] != "profile:loaded" {
		t.Fatalf("events=%v, want [profile:loaded]", spy.events)
	}
	payload, ok := spy.data[0].(map[string]any)
	if !ok {
		t.Fatalf("payload type=%T", spy.data[0])
	}
	origin, ok := payload["layoutOrigin"].(config.Rect)
	if !ok {
		t.Fatalf("layoutOrigin type=%T", payload["layoutOrigin"])
	}
	if origin.X != 0 || origin.Y != 0 {
		t.Fatalf("racing mode origin=(%d,%d), want (0,0)", origin.X, origin.Y)
	}
	if mode, ok := payload["windowMode"].(string); !ok || mode != string(config.ModeRacing) {
		t.Fatalf("windowMode=%v, want %q", payload["windowMode"], config.ModeRacing)
	}
}

func TestProfileServiceEmitLoaded(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	spy := &spyEmitter{}
	svc := app.NewProfileService("../../configs/example-racing.json", mgr, spy)
	svc.Load()

	svc.EmitLoaded()

	if len(spy.events) != 1 || spy.events[0] != "profile:loaded" {
		t.Fatalf("events=%v, want [profile:loaded]", spy.events)
	}
}

func TestProfileServiceEmitLoadedWithoutWindowManagerUsesFullscreenOrigin(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")
	if err := config.SaveFile(path, &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
		},
	}); err != nil {
		t.Fatal(err)
	}

	spy := &spyEmitter{}
	svc := app.NewProfileService(path, nil, spy)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	svc.EmitLoaded()

	payload, ok := spy.data[0].(map[string]any)
	if !ok {
		t.Fatalf("payload type=%T", spy.data[0])
	}
	origin, ok := payload["layoutOrigin"].(config.Rect)
	if !ok {
		t.Fatalf("layoutOrigin type=%T", payload["layoutOrigin"])
	}
	if origin.X != 0 || origin.Y != 0 {
		t.Fatalf("origin=(%d,%d), want fullscreen origin (0,0)", origin.X, origin.Y)
	}
}

func TestProfileServiceSaveLayoutWithoutWindowManager(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")
	original := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	}
	if err := config.SaveFile(path, original); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updated := []config.WidgetConfig{
		{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 30, Y: 40, W: 120, H: 60}},
	}
	if err := svc.SaveLayout(updated); err != nil {
		t.Fatal(err)
	}

	reloaded, err := config.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Widgets[0].Position.X != 30 {
		t.Fatalf("X=%d, want 30", reloaded.Widgets[0].Position.X)
	}
}

func TestProfileServiceSaveLayoutWithoutLoadedProfileReturnsError(t *testing.T) {
	svc := app.NewProfileService(filepath.Join(t.TempDir(), "missing.json"), nil, nil)

	err := svc.SaveLayout([]config.WidgetConfig{
		{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 1, Y: 2, W: 3, H: 4}},
	})

	if err == nil {
		t.Fatal("expected error when saving without loaded profile")
	}
}

func TestProfileServiceSaveLayoutSyncsSchemaV2GeneralLayout(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "v2.json")
	profile := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "v2",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	})
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updated := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: profile.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 70, Y: 80, W: 320, H: 280}},
	}
	if err := svc.SaveLayout(updated); err != nil {
		t.Fatal(err)
	}

	reloaded, err := config.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Widgets[0].Position.X != 70 {
		t.Fatalf("compat X=%d, want 70", reloaded.Widgets[0].Position.X)
	}
	if reloaded.Layouts[config.LayoutGeneral].Widgets[0].Position.X != 70 {
		t.Fatalf("general X=%d, want 70", reloaded.Layouts[config.LayoutGeneral].Widgets[0].Position.X)
	}
	if len(reloaded.Variants) != 1 {
		t.Fatalf("variants len=%d, want 1", len(reloaded.Variants))
	}
}

func TestProfileServiceSaveLayoutRestoresSchemaV2LayoutsOnDiskError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "v2-error.json")
	profile := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "v2-error",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	})
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updated := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: profile.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 99, Y: 88, W: 320, H: 280}},
	}

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}

	if err := svc.SaveLayout(updated); err == nil {
		t.Fatal("expected save error")
	}
	if svc.GetProfile().Widgets[0].Position.X != 10 {
		t.Fatalf("compat X=%d, want 10 after failed save", svc.GetProfile().Widgets[0].Position.X)
	}
	if svc.GetProfile().Layouts[config.LayoutGeneral].Widgets[0].Position.X != 10 {
		t.Fatalf("general X=%d, want 10 after failed save", svc.GetProfile().Layouts[config.LayoutGeneral].Widgets[0].Position.X)
	}
}

func TestProfileServiceSaveProfileStatePersistsVariants(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "v2-variants.json")
	profile := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "v2-variants",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	})
	profile.Variants[0].Columns = []config.ColumnConfig{
		{ID: "position", MetricID: "position", Enabled: true},
		{ID: "bestLap", MetricID: "bestLap", Enabled: false},
	}
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updatedWidgets := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: profile.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 70, Y: 80, W: 320, H: 280}},
	}
	updatedVariants := []config.WidgetVariantConfig{
		{
			ID:         profile.Variants[0].ID,
			WidgetType: "relative",
			Columns: []config.ColumnConfig{
				{ID: "position", MetricID: "position", Enabled: true},
				{ID: "bestLap", MetricID: "bestLap", Enabled: true},
			},
		},
	}

	if err := svc.SaveProfileState(updatedWidgets, updatedVariants); err != nil {
		t.Fatal(err)
	}

	if svc.GetProfile().Widgets[0].Position.X != 70 {
		t.Fatalf("in-memory X=%d, want 70", svc.GetProfile().Widgets[0].Position.X)
	}
	bestLap := svc.GetProfile().Variants[0].Columns[1]
	if bestLap.ID != "bestLap" || !bestLap.Enabled {
		t.Fatalf("in-memory variant bestLap=%+v, want enabled", bestLap)
	}

	reloaded, err := config.LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Widgets[0].Position.X != 70 {
		t.Fatalf("disk X=%d, want 70", reloaded.Widgets[0].Position.X)
	}
	if len(reloaded.Variants) != 1 {
		t.Fatalf("disk variants len=%d, want 1", len(reloaded.Variants))
	}
	diskBestLap := reloaded.Variants[0].Columns[1]
	if diskBestLap.ID != "bestLap" || !diskBestLap.Enabled {
		t.Fatalf("disk variant bestLap=%+v, want enabled", diskBestLap)
	}
}

func TestProfileServiceSaveProfileStatePreservesVariantsWhenNil(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "v2-preserve.json")
	profile := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "v2-preserve",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	})
	profile.Variants[0].Columns = []config.ColumnConfig{
		{ID: "position", MetricID: "position", Enabled: true},
		{ID: "bestLap", MetricID: "bestLap", Enabled: true},
	}
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updatedWidgets := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: profile.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 55, Y: 66, W: 320, H: 280}},
	}

	// nil variants must keep the existing variants untouched (backwards compatibility).
	if err := svc.SaveProfileState(updatedWidgets, nil); err != nil {
		t.Fatal(err)
	}

	if len(svc.GetProfile().Variants) != 1 {
		t.Fatalf("variants len=%d, want 1", len(svc.GetProfile().Variants))
	}
	bestLap := svc.GetProfile().Variants[0].Columns[1]
	if !bestLap.Enabled {
		t.Fatalf("bestLap enabled=%v, want true", bestLap.Enabled)
	}
}

func TestProfileServiceSaveProfileStateRestoresVariantsOnDiskError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "v2-rollback.json")
	profile := config.ConvertProfileToV2(&config.ProfileConfig{
		ID:          "v2-rollback",
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{ID: "relative", Type: "relative", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	})
	profile.Variants[0].Columns = []config.ColumnConfig{
		{ID: "position", MetricID: "position", Enabled: true},
		{ID: "bestLap", MetricID: "bestLap", Enabled: false},
	}
	if err := config.SaveFile(path, profile); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updatedWidgets := []config.WidgetConfig{
		{ID: "relative", Type: "relative", VariantID: profile.Widgets[0].VariantID, Enabled: true, Position: config.Rect{X: 99, Y: 88, W: 320, H: 280}},
	}
	updatedVariants := []config.WidgetVariantConfig{
		{
			ID:         profile.Variants[0].ID,
			WidgetType: "relative",
			Columns: []config.ColumnConfig{
				{ID: "position", MetricID: "position", Enabled: true},
				{ID: "bestLap", MetricID: "bestLap", Enabled: true},
			},
		},
	}

	// Turn the file path into a directory so SaveFile fails.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}

	if err := svc.SaveProfileState(updatedWidgets, updatedVariants); err == nil {
		t.Fatal("expected save error")
	}

	if svc.GetProfile().Widgets[0].Position.X != 10 {
		t.Fatalf("compat X=%d, want 10 after failed save", svc.GetProfile().Widgets[0].Position.X)
	}
	bestLap := svc.GetProfile().Variants[0].Columns[1]
	if bestLap.Enabled {
		t.Fatalf("bestLap enabled=%v, want false after failed save", bestLap.Enabled)
	}
}

func TestProfileServiceSaveLayoutRestoresWidgetsOnDiskError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")
	original := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 10, Y: 20, W: 100, H: 50}},
		},
	}
	if err := config.SaveFile(path, original); err != nil {
		t.Fatal(err)
	}

	svc := app.NewProfileService(path, nil, nil)
	if err := svc.Load(); err != nil {
		t.Fatal(err)
	}

	updated := []config.WidgetConfig{
		{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{X: 99, Y: 88, W: 120, H: 60}},
	}

	// Turn the file path into a directory so SaveFile fails.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}

	if err := svc.SaveLayout(updated); err == nil {
		t.Fatal("expected save error")
	}

	if svc.GetProfile().Widgets[0].Position.X != 10 {
		t.Fatalf("in-memory X=%d, want 10 after failed save", svc.GetProfile().Widgets[0].Position.X)
	}
}

func TestProfileServiceSaveProfile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")
	initial := &config.ProfileConfig{
		ID:          "test",
		DisplayMode: config.ModeRacing,
		Widgets:     []config.WidgetConfig{{ID: "w1", Type: "delta", Enabled: true, Position: config.Rect{W: 100, H: 40}}},
	}
	require.NoError(t, config.SaveFile(path, initial))

	s := app.NewProfileService(path, nil, nil)
	require.NoError(t, s.Load())

	updated := &config.ProfileConfig{
		ID:          "test",
		DisplayMode: config.ModeRacing,
		Widgets:     []config.WidgetConfig{{ID: "w1", Type: "delta", Enabled: false, Position: config.Rect{W: 200, H: 80}}},
	}
	require.NoError(t, s.SaveProfile(updated))

	loaded, err := config.LoadFile(path)
	require.NoError(t, err)
	require.Equal(t, 200, loaded.Widgets[0].Position.W)
	require.False(t, loaded.Widgets[0].Enabled)
}
