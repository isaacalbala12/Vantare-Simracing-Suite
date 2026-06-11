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
// skipRefresh=true avoids recreating the window (used on layout save).
func (m *Manager) ApplyProfile(p *config.ProfileConfig, skipRefresh bool) {
	switch p.DisplayMode {
	case config.ModeEdit:
		m.win.SetIgnoreMouseEvents(false)
		m.win.SetResizable(true)
		m.win.Fullscreen()
	default: // racing
		m.win.SetIgnoreMouseEvents(true)
		m.win.SetResizable(false)
		m.applyShrinkWrap(p, skipRefresh)
	}
}

// applyShrinkWrap resizes and repositions the window to tightly enclose
// all enabled widgets from the profile.
func (m *Manager) applyShrinkWrap(p *config.ProfileConfig, skipRefresh bool) {
	bounds, _ := ShrinkWrap(p, m.pad)
	m.win.SetBounds(WailsRect{
		X:      bounds.X,
		Y:      bounds.Y,
		Width:  bounds.Width,
		Height: bounds.Height,
	})
}

// LayoutOrigin returns the window-local origin for the given profile.
func (m *Manager) LayoutOrigin(p *config.ProfileConfig) config.Rect {
	_, origin := ShrinkWrap(p, m.pad)
	return origin
}

// WindowLocalPos converts a widget position to window-local coords.
func (m *Manager) WindowLocalPos(p *config.ProfileConfig, widgetPos config.Rect) config.Rect {
	origin := m.LayoutOrigin(p)
	return WindowLocalPos(widgetPos, origin)
}
