package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/pkg/config"
)

type fakeOverlayWindow struct {
	closed       bool
	closeCalls   int
	boundsSet    bool
	ignoreMouse  bool
	appliedModes []config.DisplayMode
}

func (f *fakeOverlayWindow) Close() {
	f.closed = true
	f.closeCalls++
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

type fixedOverlayFactory struct {
	window app.OverlayWindow
}

func (f fixedOverlayFactory) NewOverlayWindow(*config.ProfileDocumentV3, config.Rect, config.Rect) (app.OverlayWindow, error) {
	return f.window, nil
}

type nonComparableOverlayWindow struct {
	values []int
}

func (nonComparableOverlayWindow) Close() {}

func (nonComparableOverlayWindow) ApplyProfileMode(*config.ProfileDocumentV3) error { return nil }

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

func TestOverlayControllerHandleWindowClosedIgnoresStaleWindowAndForgetsCurrentWithoutClosingIt(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	document := racingDocument("default-racing", config.ModeRacing)

	if _, err := controller.Start(document); err != nil {
		t.Fatal(err)
	}
	first := factory.last
	if _, err := controller.Start(document); err != nil {
		t.Fatal(err)
	}
	second := factory.last

	callbacks := 0
	status, matched := controller.HandleWindowClosed(first, func() { callbacks++ })
	if matched {
		t.Fatal("delayed close from previous window matched current window")
	}
	if !status.Running || controller.CurrentWindow() != second {
		t.Fatalf("stale close changed current state: status=%+v current=%p want=%p", status, controller.CurrentWindow(), second)
	}
	if second.closeCalls != 0 {
		t.Fatalf("stale close closed current window %d times", second.closeCalls)
	}

	status, matched = controller.HandleWindowClosed(second, func() { callbacks++ })
	if !matched {
		t.Fatal("current external close was not matched")
	}
	if status.Running || controller.CurrentWindow() != nil {
		t.Fatalf("current close did not clear state: status=%+v current=%v", status, controller.CurrentWindow())
	}
	if second.closeCalls != 0 {
		t.Fatalf("already-closing current window was closed %d extra times", second.closeCalls)
	}
	if callbacks != 1 {
		t.Fatalf("matched callbacks=%d want 1", callbacks)
	}
	if _, matched = controller.HandleWindowClosed(second, func() { callbacks++ }); matched {
		t.Fatal("duplicate close event matched a window already forgotten")
	}
	if callbacks != 1 {
		t.Fatalf("duplicate close changed callbacks=%d want 1", callbacks)
	}
	if second.closeCalls != 0 {
		t.Fatalf("duplicate close event closed window %d extra times", second.closeCalls)
	}
}

func TestOverlayControllerHandleWindowClosedRejectsNonComparableWindowWithoutPanic(t *testing.T) {
	window := nonComparableOverlayWindow{values: []int{1}}
	controller := app.NewOverlayController(fixedOverlayFactory{window: window})
	if _, err := controller.Start(racingDocument("non-comparable", config.ModeRacing)); err != nil {
		t.Fatal(err)
	}

	status, matched := controller.HandleWindowClosed(window, func() {
		t.Fatal("non-comparable window invoked matched callback")
	})
	if matched {
		t.Fatal("non-comparable window unexpectedly matched")
	}
	if !status.Running {
		t.Fatal("non-comparable close changed running status")
	}
}

func TestOverlayControllerHandleWindowClosedSerializesMatchedCallbackBeforeNextStart(t *testing.T) {
	factory := &fakeOverlayFactory{}
	controller := app.NewOverlayController(factory)
	if _, err := controller.Start(racingDocument("first", config.ModeRacing)); err != nil {
		t.Fatal(err)
	}
	first := factory.last

	callbackEntered := make(chan struct{})
	releaseCallback := make(chan struct{})
	handleDone := make(chan bool, 1)
	go func() {
		_, matched := controller.HandleWindowClosed(first, func() {
			close(callbackEntered)
			<-releaseCallback
		})
		handleDone <- matched
	}()
	<-callbackEntered

	startAttempted := make(chan struct{})
	startDone := make(chan app.OverlayStatus, 1)
	go func() {
		close(startAttempted)
		status, err := controller.Start(racingDocument("second", config.ModeRacing))
		if err != nil {
			t.Errorf("start second overlay: %v", err)
		}
		startDone <- status
	}()
	<-startAttempted
	select {
	case <-startDone:
		t.Fatal("next Start completed while matched close callback held controller lock")
	default:
	}

	close(releaseCallback)
	if matched := <-handleDone; !matched {
		t.Fatal("current close did not match")
	}
	status := <-startDone
	if !status.Running || status.ProfileID != "second" {
		t.Fatalf("second start status=%+v", status)
	}
	if controller.CurrentWindow() != factory.last {
		t.Fatal("second start did not install its window after callback completed")
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
