package app_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
	"github.com/stretchr/testify/require"
)

// fakeWindow implements window.WindowHandle for testing.
type fakeWindow struct {
	lastBounds    window.WailsRect
	ignoreMouse   bool
	resizable     bool
	fullscreen    bool
}

func (f *fakeWindow) SetBounds(bounds window.WailsRect) { f.lastBounds = bounds }
func (f *fakeWindow) SetSize(width, height int)          { f.lastBounds.Width = width; f.lastBounds.Height = height }
func (f *fakeWindow) SetPosition(x, y int)               { f.lastBounds.X = x; f.lastBounds.Y = y }
func (f *fakeWindow) SetIgnoreMouseEvents(ignore bool)   { f.ignoreMouse = ignore }
func (f *fakeWindow) SetResizable(b bool)                { f.resizable = b }
func (f *fakeWindow) Fullscreen()                        { f.fullscreen = true }
func (f *fakeWindow) UnFullscreen()                      { f.fullscreen = false }

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

	// Verify window was resized (skipRefresh=true)
	if fw.lastBounds.Width == 0 {
		t.Fatal("expected SetBounds to be called")
	}

	if len(spy.events) != 3 || spy.events[0] != "layout:saved" || spy.events[1] != "profile:saved" || spy.events[2] != "profile:loaded" {
		t.Fatalf("events=%v, want [layout:saved profile:saved profile:loaded]", spy.events)
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
