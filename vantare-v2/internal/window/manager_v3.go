package window

import "github.com/vantare/overlays/v2/pkg/config"

// ApplyProfileV3 applies the profile document display mode to the window.
func (m *Manager) ApplyProfileV3(doc *config.ProfileDocumentV3, skipRefresh bool) {
	if doc == nil {
		return
	}
	switch doc.DisplayMode {
	case config.ModeEdit:
		if !skipRefresh {
			m.win.SetIgnoreMouseEvents(false)
			m.win.SetResizable(true)
			m.win.Fullscreen()
			m.win.SetIgnoreMouseEvents(false)
		}
	case config.ModeStreaming:
		if !skipRefresh {
			m.win.UnFullscreen()
			m.win.SetIgnoreMouseEvents(true)
			m.win.SetResizable(false)
		}
		m.win.SetPosition(-9999, -9999)
		m.win.SetSize(1, 1)
	default:
		if !skipRefresh {
			m.win.SetIgnoreMouseEvents(true)
			m.win.SetResizable(false)
			m.win.Fullscreen()
			m.win.SetIgnoreMouseEvents(true)
		}
	}
}

// LayoutOriginV3 returns the window-local origin for a V3 profile document.
func (m *Manager) LayoutOriginV3(doc *config.ProfileDocumentV3) config.Rect {
	if doc == nil {
		return config.Rect{}
	}
	if doc.DisplayMode == config.ModeRacing || doc.DisplayMode == config.ModeEdit {
		return config.Rect{}
	}
	return config.LayoutOriginV3(doc, m.pad)
}
