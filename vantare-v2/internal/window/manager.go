package window

import (
	"github.com/vantare/overlays/v2/pkg/config"
)

// WindowHandle abstracts the Wails WebviewWindow methods we need,
// enabling test doubles without importing Wails.
type WindowHandle interface {
	SetBounds(bounds WailsRect)
	SetSize(width, height int)
	SetPosition(x, y int)
	SetIgnoreMouseEvents(ignore bool)
	SetResizable(b bool)
	Fullscreen()
	UnFullscreen()
}

// Manager coordinates profile-driven window geometry.
type Manager struct {
	win WindowHandle
	pad int
}

// NewManager creates a window manager with the given padding (default 0).
func NewManager(win WindowHandle, pad int) *Manager {
	return &Manager{win: win, pad: pad}
}

// ApplyProfile applies the profile's display mode to the window.
// skipRefresh=true (skipWindowRefresh): resize bounds only — no mode toggles
// (avoids fullscreen flash / redundant WebView2 state changes on layout save).
// For ModeStreaming, the window is minimised/hidden since OBS provides the display.
func (m *Manager) ApplyProfile(p *config.ProfileConfig, skipRefresh bool) {
	switch p.DisplayMode {
	case config.ModeEdit:
		if !skipRefresh {
			m.win.SetIgnoreMouseEvents(false)
			m.win.SetResizable(true)
			m.win.Fullscreen()
			// Apply after Fullscreen as well: transparent layered windows on
			// Windows can retain click-through state across geometry changes.
			m.win.SetIgnoreMouseEvents(false)
		}
	case config.ModeStreaming:
		// In streaming mode the overlay window should not be visible on desktop.
		// Wails v3 does not support conditional window creation, so we minimise
		// and move it off-screen to avoid obstructing the sim. OBS serves as the
		// display via a Browser Source pointing at the embedded HTTP server.
		if !skipRefresh {
			m.win.UnFullscreen()
			m.win.SetIgnoreMouseEvents(true)
			m.win.SetResizable(false)
		}
		m.win.SetPosition(-9999, -9999)
		m.win.SetSize(1, 1)
	default: // racing
		// Desktop racing overlay must stay fullscreen so widget positions are
		// window-local coordinates. Shrink-wrap would clip widgets placed
		// outside the computed bounds.
		if !skipRefresh {
			m.win.SetIgnoreMouseEvents(true)
			m.win.SetResizable(false)
			m.win.Fullscreen()
			// Apply after Fullscreen as well: transparent layered windows on
			// Windows can retain click-through state across geometry changes.
			m.win.SetIgnoreMouseEvents(true)
		}
	}
}

// applyShrinkWrap resizes and repositions the window to tightly enclose
// all enabled widgets from the profile.
func (m *Manager) applyShrinkWrap(p *config.ProfileConfig) {
	bounds, _ := ShrinkWrap(p, m.pad)
	m.win.SetBounds(WailsRect{
		X:      bounds.X,
		Y:      bounds.Y,
		Width:  bounds.Width,
		Height: bounds.Height,
	})
}

// LayoutOrigin returns the window-local origin for the given profile.
// Fullscreen modes (racing and edit) use a {0,0} origin because widget
// positions are already window-local coordinates. Other modes fall back to
// the shrink-wrap origin for consumers that still need it.
func (m *Manager) LayoutOrigin(p *config.ProfileConfig) config.Rect {
	if p.DisplayMode == config.ModeRacing || p.DisplayMode == config.ModeEdit {
		return config.Rect{}
	}
	_, origin := ShrinkWrap(p, m.pad)
	return origin
}

// WindowLocalPos converts a widget position to window-local coords.
func (m *Manager) WindowLocalPos(p *config.ProfileConfig, widgetPos config.Rect) config.Rect {
	origin := m.LayoutOrigin(p)
	return WindowLocalPos(widgetPos, origin)
}
