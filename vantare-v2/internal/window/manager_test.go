package window_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

// fakeWindow implements WindowHandle for testing without Wails.
type fakeWindow struct {
	lastBounds     window.WailsRect
	ignoreMouse    bool
	resizable      bool
	fullscreen     bool
	setBoundsCalls int
	ignoreCalls    []bool
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
func (f *fakeWindow) SetIgnoreMouseEvents(ignore bool) {
	f.ignoreMouse = ignore
	f.ignoreCalls = append(f.ignoreCalls, ignore)
}
func (f *fakeWindow) SetResizable(b bool) { f.resizable = b }
func (f *fakeWindow) Fullscreen()         { f.fullscreen = true }
func (f *fakeWindow) UnFullscreen()       { f.fullscreen = false }

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
	if !fw.fullscreen {
		t.Fatal("racing mode should fullscreen")
	}
	// Fullscreen racing must not shrink-wrap the window.
	if fw.setBoundsCalls != 0 {
		t.Fatalf("racing mode should not call SetBounds, got %d calls", fw.setBoundsCalls)
	}
	// SetIgnoreMouseEvents is applied before and after Fullscreen.
	if len(fw.ignoreCalls) != 2 || fw.ignoreCalls[0] != true || fw.ignoreCalls[1] != true {
		t.Fatalf("racing mode should enable click-through before and after fullscreen, calls=%v", fw.ignoreCalls)
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
	if len(fw.ignoreCalls) != 2 || fw.ignoreCalls[0] || fw.ignoreCalls[1] {
		t.Fatalf("edit mode should disable click-through before and after fullscreen, calls=%v", fw.ignoreCalls)
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

	mgr.ApplyProfile(p, true)
	if fw.setBoundsCalls != initialCalls {
		t.Fatalf("skipRefresh should not change SetBounds calls: got=%d want=%d", fw.setBoundsCalls, initialCalls)
	}
}

func TestApplyProfileSkipRefreshSkipsModeToggle(t *testing.T) {
	fw := &fakeWindow{fullscreen: true, ignoreMouse: false}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	mgr.ApplyProfile(p, true)

	if !fw.fullscreen {
		t.Fatal("skipRefresh should not call UnFullscreen in edit mode")
	}
	if fw.setBoundsCalls != 0 {
		t.Fatal("edit mode skipRefresh should not shrink-wrap")
	}
}

func TestRacingAfterEditKeepsFullscreen(t *testing.T) {
	fw := &fakeWindow{fullscreen: true}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	mgr.ApplyProfile(p, false)
	if !fw.fullscreen {
		t.Fatal("expected racing to stay fullscreen when switching from edit")
	}
	if !fw.ignoreMouse {
		t.Fatal("expected click-through after switching to racing")
	}
	if fw.resizable {
		t.Fatal("expected non-resizable in racing")
	}
}

func TestManagerLayoutOriginEditIsZero(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	origin := mgr.LayoutOrigin(p)
	if origin.X != 0 || origin.Y != 0 {
		t.Fatalf("edit origin=(%d,%d), want (0,0)", origin.X, origin.Y)
	}
}

func TestManagerLayoutOriginStreamingUsesShrinkWrap(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeStreaming,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	origin := mgr.LayoutOrigin(p)
	if origin.X != 92 || origin.Y != 192 {
		t.Fatalf("streaming origin=(%d,%d), want (92,192)", origin.X, origin.Y)
	}
}

func TestEditToRacingKeepsFullscreenAndClickThrough(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 0)
	editProfile := &config.ProfileConfig{
		DisplayMode: config.ModeEdit,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 50, Y: 50, W: 200, H: 100}},
		},
	}
	mgr.ApplyProfile(editProfile, false)
	if !fw.fullscreen || fw.ignoreMouse {
		t.Fatalf("edit setup failed: fullscreen=%v ignoreMouse=%v", fw.fullscreen, fw.ignoreMouse)
	}

	racingProfile := &config.ProfileConfig{
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 50, Y: 50, W: 200, H: 100}},
		},
	}
	mgr.ApplyProfile(racingProfile, false)

	if !fw.fullscreen {
		t.Fatal("racing should remain fullscreen after edit")
	}
	if !fw.ignoreMouse {
		t.Fatal("racing should be click-through after edit")
	}
	if fw.resizable {
		t.Fatal("racing should be non-resizable after edit")
	}
}

func TestApplyStreamingMode(t *testing.T) {
	fw := &fakeWindow{}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeStreaming,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	mgr.ApplyProfile(p, false)

	if fw.ignoreMouse != true {
		t.Fatal("streaming mode should set ignoreMouseEvents=true")
	}
	if fw.resizable {
		t.Fatal("streaming mode should set resizable=false")
	}
	if fw.fullscreen {
		t.Fatal("streaming mode should NOT fullscreen")
	}
	// Window should be moved off-screen and minimised
	if fw.lastBounds.Width != 1 || fw.lastBounds.Height != 1 {
		t.Fatalf("streaming window size=%dx%d, want 1x1", fw.lastBounds.Width, fw.lastBounds.Height)
	}
	if fw.lastBounds.X != -9999 || fw.lastBounds.Y != -9999 {
		t.Fatalf("streaming window pos=(%d,%d), want (-9999,-9999)", fw.lastBounds.X, fw.lastBounds.Y)
	}
}

func TestApplyStreamingModeExitsFullscreen(t *testing.T) {
	fw := &fakeWindow{fullscreen: true}
	mgr := window.NewManager(fw, 8)
	p := &config.ProfileConfig{
		DisplayMode: config.ModeStreaming,
		Widgets: []config.WidgetConfig{
			{Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	mgr.ApplyProfile(p, false)

	if fw.fullscreen {
		t.Fatal("streaming mode should call UnFullscreen when switching from edit")
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
