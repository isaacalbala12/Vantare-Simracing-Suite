package app

import (
	"context"
	"sync"
	"time"
)

// HubWindow is the native window surface controlled by HubLifecycle.
type HubWindow interface {
	Close()
	Hide()
	Show()
	Focus()
	Minimise()
	UnMinimise()
	IsMinimised() bool
}

type HubWindowFactory func() HubWindow
type HubSuspendProbe func(context.Context) bool

// HubLifecycle destroys the hidden hub when policy allows it and recreates it
// on demand. Wails alpha.98 has no CoreWebView2 TrySuspend API.
type HubLifecycle struct {
	mu             sync.Mutex
	current        HubWindow
	generation     uint64
	newWindow      HubWindowFactory
	effectiveLevel func() int
	canSuspend     HubSuspendProbe
	logBlocked     func()
	pendingCancel  context.CancelFunc
}

func NewHubLifecycle(newWindow HubWindowFactory, effectiveLevel func() int, canSuspend HubSuspendProbe, logBlocked func()) *HubLifecycle {
	if effectiveLevel == nil {
		effectiveLevel = func() int { return 1 }
	}
	return &HubLifecycle{newWindow: newWindow, effectiveLevel: effectiveLevel, canSuspend: canSuspend, logBlocked: logBlocked}
}

// Open recreates a destroyed hub or restores the existing one.
func (l *HubLifecycle) Open() (HubWindow, time.Duration) {
	started := time.Now()
	l.mu.Lock()
	// Invalida cualquier ACK de suspensión que estuviese esperando al frontend.
	if l.pendingCancel != nil {
		l.pendingCancel()
		l.pendingCancel = nil
	}
	l.generation++
	window := l.current
	if window == nil && l.newWindow != nil {
		window = l.newWindow()
		l.current = window
	}
	l.mu.Unlock()
	if window != nil {
		window.UnMinimise()
		window.Show()
		window.Focus()
	}
	return window, time.Since(started)
}

// HandleMinimise destroys the current hub at levels 3-5 only after the
// frontend confirms that Studio has no unsaved changes.
func (l *HubLifecycle) HandleMinimise(ctx context.Context) bool {
	if l.effectiveLevel() < 3 {
		return false
	}
	l.mu.Lock()
	window := l.current
	generation := l.generation
	minimised := window != nil && window.IsMinimised()
	l.mu.Unlock()
	if !minimised {
		return false
	}
	probeCtx, cancel := context.WithCancel(ctx)
	l.mu.Lock()
	if l.generation != generation || l.current != window || !window.IsMinimised() {
		l.mu.Unlock()
		cancel()
		return false
	}
	l.pendingCancel = cancel
	l.mu.Unlock()
	canSuspend := l.canSuspend != nil && l.canSuspend(probeCtx)
	cancel()

	l.mu.Lock()
	if l.generation == generation && l.current == window {
		l.pendingCancel = nil
	}
	l.mu.Unlock()
	if !canSuspend {
		if l.logBlocked != nil {
			l.logBlocked()
		}
		return false
	}

	l.mu.Lock()
	if l.generation != generation || l.current != window || !window.IsMinimised() {
		l.mu.Unlock()
		return false
	}
	l.current = nil
	l.generation++
	l.mu.Unlock()
	window.Hide()
	window.Close()
	return true
}

func (l *HubLifecycle) IsMinimised() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.current == nil || l.current.IsMinimised()
}
