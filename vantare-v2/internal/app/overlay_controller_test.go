package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/pkg/config"
)

type fakeOverlayWindow struct {
	closed       bool
	boundsSet    bool
	ignoreMouse  bool
	appliedModes []config.DisplayMode
}

func (f *fakeOverlayWindow) Close() {
	f.closed = true
}

func (f *fakeOverlayWindow) ApplyProfileMode(profile *config.ProfileConfig) error {
	if f.appliedModes == nil {
		f.appliedModes = make([]config.DisplayMode, 0)
	}
	f.appliedModes = append(f.appliedModes, profile.DisplayMode)
	return nil
}

type fakeOverlayFactory struct {
	created int
	last    *fakeOverlayWindow
	origin  config.Rect
	bounds  config.Rect
}

func (f *fakeOverlayFactory) NewOverlayWindow(profile *config.ProfileConfig, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
	f.created++
	f.origin = origin
	f.bounds = bounds
	f.last = &fakeOverlayWindow{boundsSet: true, ignoreMouse: true}
	return f.last, nil
}

func TestOverlayControllerStartCreatesCleanWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	profile := &config.ProfileConfig{
		ID:          "default-racing",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
		},
	}

	status, err := controller.Start(profile)
	if err != nil {
		t.Fatal(err)
	}
	if factory.created != 1 {
		t.Fatalf("created=%d, want 1", factory.created)
	}
	if !status.Running {
		t.Fatal("status should be running")
	}
	if status.ProfileID != "default-racing" {
		t.Fatalf("profile id=%q", status.ProfileID)
	}
	if status.Mode != config.ModeRacing {
		t.Fatalf("mode=%q, want racing", status.Mode)
	}
	if factory.origin.X != 0 || factory.origin.Y != 0 {
		t.Fatalf("origin=(%d,%d), want fullscreen origin (0,0)", factory.origin.X, factory.origin.Y)
	}
}

func TestOverlayControllerStartClosesPreviousWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	profile := &config.ProfileConfig{
		ID:          "default-racing",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	}

	_, err := controller.Start(profile)
	if err != nil {
		t.Fatal(err)
	}
	first := factory.last

	_, err = controller.Start(profile)
	if err != nil {
		t.Fatal(err)
	}
	if !first.closed {
		t.Fatal("previous overlay window should be closed before creating a new one")
	}
	if factory.created != 2 {
		t.Fatalf("created=%d, want 2", factory.created)
	}
}

func TestOverlayControllerStopClosesWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	profile := &config.ProfileConfig{
		ID:          "default-racing",
		DisplayMode: config.ModeRacing,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	}

	_, err := controller.Start(profile)
	if err != nil {
		t.Fatal(err)
	}
	win := factory.last

	status := controller.Stop()
	if !win.closed {
		t.Fatal("window should be closed")
	}
	if status.Running {
		t.Fatal("status should not be running after stop")
	}
}

func TestOverlayControllerStreamingDoesNotCreateDesktopWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	profile := &config.ProfileConfig{
		ID:          "default-streaming",
		DisplayMode: config.ModeStreaming,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 0, Y: 0, W: 100, H: 50}},
		},
	}

	status, err := controller.Start(profile)
	if err != nil {
		t.Fatal(err)
	}
	if factory.created != 0 {
		t.Fatalf("streaming created desktop windows=%d, want 0", factory.created)
	}
	if status.Running {
		t.Fatal("desktop overlay should not be running for streaming")
	}
	if status.Mode != config.ModeStreaming {
		t.Fatalf("mode=%q, want streaming", status.Mode)
	}
}
