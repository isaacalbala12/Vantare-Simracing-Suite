package window_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

// fakeWindow implements WindowHandle for testing without Wails.
type fakeWindow struct {
	lastBounds    window.WailsRect
	ignoreMouse   bool
	resizable     bool
	fullscreen    bool
	setBoundsCalls int
}

func (f *fakeWindow) SetBounds(bounds window.WailsRect) {
	f.lastBounds = bounds
	f.setBoundsCalls++
}
func (f *fakeWindow) SetSize(width, height int) {
	f.lastBounds.Width = width
	f.lastBounds.Height = height
}
func (f *fakeWindow) SetPosition(x, y int) {
	f.lastBounds.X = x
	f.lastBounds.Y = y
}
func (f *fakeWindow) SetIgnoreMouseEvents(ignore bool) { f.ignoreMouse = ignore }
func (f *fakeWindow) SetResizable(b bool)              { f.resizable = b }
func (f *fakeWindow) Fullscreen()                      { f.fullscreen = true }
func (f *fakeWindow) UnFullscreen()                    { f.fullscreen = false }

func TestApplyRacingMode(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
			{Enabled: true, Position: config.Rect{X: 40, Y: 600, W: 320, H: 280}},
		},
	}
	mgr.ApplyProfile(p, false)

	if !fw.ignoreMouse {
		t.Fatal("racing mode should set ignoreMouseEvents=true")
	}
	if fw.resizable {
		t.Fatal("racing mode should set resizable=false")
	}
	if fw.fullscreen {
		t.Fatal("racing mode should NOT fullscreen")
	}
	// Shrink-wrap: minX=40, minY=200, maxX=500, maxY=880
	// Window: X=32, Y=192, W=476, H=696
	if fw.lastBounds.X != 32 || fw.lastBounds.Y != 192 {
		t.Fatalf("window pos=(%d,%d), want (32,192)", fw.lastBounds.X, fw.lastBounds.Y)
	}
	if fw.lastBounds.Width != 476 || fw.lastBounds.Height != 696 {
		t.Fatalf("window size=%dx%d, want 476x696", fw.lastBounds.Width, fw.lastBounds.Height)
	}
}

func TestApplyEditMode(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	mgr.ApplyProfile(p, false)

	if fw.ignoreMouse {
		t.Fatal("edit mode should set ignoreMouseEvents=false")
	}
	if !fw.resizable {
		t.Fatal("edit mode should set resizable=true")
	}
	if !fw.fullscreen {
		t.Fatal("edit mode should fullscreen")
	}
}

func TestApplyProfileSkipRefresh(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	}
	mgr.ApplyProfile(p, false)
	initialCalls := fw.setBoundsCalls

	// Apply again with skipRefresh — should still call SetBounds
	mgr.ApplyProfile(p, true)
	if fw.setBoundsCalls != initialCalls+1 {
		t.Fatalf("skipRefresh should still set bounds: calls=%d", fw.setBoundsCalls)
	}
}

func TestManagerLayoutOrigin(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
	}}
	origin := mgr.LayoutOrigin(p)
	if origin.X != 92 || origin.Y != 192 {
		t.Fatalf("origin=(%d,%d), want (92,192)", origin.X, origin.Y)
	}
}

func TestManagerWindowLocalPos(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	p := &config.ProfileConfig{Widgets: []config.WidgetConfig{
		{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
	}}
	local := mgr.WindowLocalPos(p, config.Rect{X: 100, Y: 200, W: 400, H: 48})
	if local.X != 0 || local.Y != 0 {
		t.Fatalf("local=(%d,%d), want (0,0)", local.X, local.Y)
	}
}
