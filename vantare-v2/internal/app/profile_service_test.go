package app_test

import (
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
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

	// Verify event emitted
	if len(spy.events) != 1 || spy.events[0] != "layout:saved" {
		t.Fatalf("events=%v, want [layout:saved]", spy.events)
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
