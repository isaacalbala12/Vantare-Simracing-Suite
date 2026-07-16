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

func (f *fakeOverlayWindow) ApplyProfileMode(document *config.ProfileDocumentV3) error {
	if f.appliedModes == nil {
		f.appliedModes = make([]config.DisplayMode, 0)
	}
	if document != nil {
		f.appliedModes = append(f.appliedModes, document.DisplayMode)
	}
	return nil
}

type fakeOverlayFactory struct {
	created int
	last    *fakeOverlayWindow
	origin  config.Rect
	bounds  config.Rect
}

func (f *fakeOverlayFactory) NewOverlayWindow(document *config.ProfileDocumentV3, origin config.Rect, bounds config.Rect) (app.OverlayWindow, error) {
	f.created++
	f.origin = origin
	f.bounds = bounds
	f.last = &fakeOverlayWindow{boundsSet: true, ignoreMouse: true}
	return f.last, nil
}

func racingDocument(id string, mode config.DisplayMode) *config.ProfileDocumentV3 {
	return &config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            id,
		Name:          id,
		DisplayMode:   mode,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral},
		},
	}
}

func TestOverlayControllerStartCreatesCleanWindow(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)

	status, err := controller.Start(racingDocument("default-racing", config.ModeRacing))
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
	document := racingDocument("default-racing", config.ModeRacing)

	_, err := controller.Start(document)
	if err != nil {
		t.Fatal(err)
	}
	first := factory.last

	_, err = controller.Start(document)
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

	_, err := controller.Start(racingDocument("default-racing", config.ModeRacing))
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

	status, err := controller.Start(racingDocument("default-streaming", config.ModeStreaming))
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