package app_test

import (
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/pkg/config"
)

// gatedOverlayFactory simulates a slow native window creation (NewWithOptions
// takes hundreds of ms while WebView2 spins up). Every created window is
// recorded; creation stays blocked until the test releases it.
type gatedOverlayFactory struct {
	mu      sync.Mutex
	windows []*fakeOverlayWindow
	entered chan struct{}
	release chan struct{}
}

func (f *gatedOverlayFactory) NewOverlayWindow(*config.ProfileDocumentV3, config.Rect, config.Rect) (app.OverlayWindow, error) {
	w := &fakeOverlayWindow{level: 1}
	f.mu.Lock()
	f.windows = append(f.windows, w)
	f.mu.Unlock()
	f.entered <- struct{}{}
	<-f.release
	return w, nil
}

// syncCloseOverlayWindow simulates a native runtime that dispatches its
// closing event on the caller's stack of Close().
type syncCloseOverlayWindow struct {
	fakeOverlayWindow
	onClosed func(app.OverlayWindow)
}

func (w *syncCloseOverlayWindow) Close() {
	w.fakeOverlayWindow.Close()
	if w.onClosed != nil {
		w.onClosed(w)
	}
}

// Two concurrent Starts (e.g. the user opening an overlay while a Studio save
// refresh recreates it, or a double click) each create a window; the loser
// must close its own. Before the fix both stayed open and the loser became an
// unreachable always-on-top window.
func TestOverlayControllerConcurrentStartClosesSupersededWindow(t *testing.T) {
	factory := &gatedOverlayFactory{entered: make(chan struct{}, 4), release: make(chan struct{})}
	controller := app.NewOverlayController(factory)
	doc := racingDocument("race", config.ModeRacing)

	done := make(chan app.OverlayStatus, 2)
	go func() { s, _ := controller.Start(doc); done <- s }()
	<-factory.entered // A is inside native creation
	go func() { s, _ := controller.Start(doc); done <- s }()
	// B either enters the factory (interleaved creation) or stays serialized
	// behind A; the wait is bounded so the test works before and after the fix.
	select {
	case <-factory.entered:
	case <-time.After(500 * time.Millisecond):
	}
	close(factory.release)
	<-done
	<-done

	factory.mu.Lock()
	windows := append([]*fakeOverlayWindow(nil), factory.windows...)
	factory.mu.Unlock()
	if len(windows) != 2 {
		t.Fatalf("created=%d want 2", len(windows))
	}
	closed := 0
	for _, w := range windows {
		if w.closed {
			closed++
		}
	}
	if closed != 1 {
		t.Fatalf("superseded overlay window leaked open: closed=%d want 1", closed)
	}
	if !controller.Status().Running {
		t.Fatal("the winning start must remain running")
	}
}

// A Stop issued while a Start is still creating the window must leave the
// controller stopped: the created window is closed, not installed as a ghost.
func TestOverlayControllerStopDuringInFlightStartClosesCreatedWindow(t *testing.T) {
	factory := &gatedOverlayFactory{entered: make(chan struct{}, 4), release: make(chan struct{})}
	controller := app.NewOverlayController(factory)
	doc := racingDocument("race", config.ModeRacing)

	startDone := make(chan app.OverlayStatus, 1)
	go func() { s, _ := controller.Start(doc); startDone <- s }()
	<-factory.entered // creation in flight, current still nil

	stopDone := make(chan struct{})
	go func() { controller.Stop(); close(stopDone) }()

	// Order Stop before creation is released. With the fix Stop stays queued
	// behind the serialized Start and only the timeout expires; on the old
	// code Stop returns immediately after observing no window. Releasing
	// earlier would let a delayed Stop goroutine land after Start installs the
	// window and mask the bug the test is meant to catch.
	select {
	case <-stopDone:
	case <-time.After(2 * time.Second):
	}
	close(factory.release)

	select {
	case <-stopDone:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop did not complete after releasing the in-flight creation")
	}
	select {
	case <-startDone:
	case <-time.After(2 * time.Second):
		t.Fatal("Start did not complete after releasing the creation gate")
	}

	factory.mu.Lock()
	windows := append([]*fakeOverlayWindow(nil), factory.windows...)
	factory.mu.Unlock()
	if len(windows) != 1 {
		t.Fatalf("created=%d want 1", len(windows))
	}
	if status := controller.Status(); status.Running {
		t.Fatalf("window created during Start resurrected after Stop: status=%+v", status)
	}
	if controller.CurrentWindow() != nil {
		t.Fatal("CurrentWindow must be nil after Stop")
	}
	if !windows[0].closed {
		t.Fatal("window created during in-flight Start was left open after Stop")
	}
}

// Close() must run outside the controller mutex: a native runtime that fires
// WindowClosing on the caller's stack would otherwise deadlock against
// HandleWindowClosed, which needs the same mutex. The timeout bounds deadlock
// detection; it is not an arbitrary sleep.
func TestOverlayControllerCloseDoesNotDeadlockOnSyncCloseCallback(t *testing.T) {
	win := &syncCloseOverlayWindow{}
	win.level = 1
	controller := app.NewOverlayController(fixedOverlayFactory{window: win})
	win.onClosed = func(closed app.OverlayWindow) {
		controller.HandleWindowClosed(closed, nil)
	}
	if _, err := controller.Start(racingDocument("race", config.ModeRacing)); err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	go func() { controller.Stop(); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("deadlock: Close() under the controller mutex blocks a synchronous close callback")
	}
}
