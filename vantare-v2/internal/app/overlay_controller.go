package app

import (
	"sync"

	"github.com/vantare/overlays/v2/pkg/config"
)

// OverlayStatus reports the current desktop overlay runtime state.
type OverlayStatus struct {
	Running   bool               `json:"running"`
	ProfileID string             `json:"profileId,omitempty"`
	Mode      config.DisplayMode `json:"mode,omitempty"`
}

// OverlayWindow is the minimal interface the controller needs from a desktop overlay window.
type OverlayWindow interface {
	Close()
	ApplyProfileMode(profile *config.ProfileConfig) error
}

// OverlayWindowFactory creates a new desktop overlay window for a profile.
type OverlayWindowFactory interface {
	NewOverlayWindow(profile *config.ProfileConfig, origin config.Rect, bounds config.Rect) (OverlayWindow, error)
}

// OverlayController owns the lifetime of the desktop overlay window.
// It creates a fresh window on Start and closes it on Stop.
type OverlayController struct {
	mu      sync.Mutex
	factory OverlayWindowFactory
	current OverlayWindow
	status  OverlayStatus
}

// NewOverlayController creates an overlay controller with the given factory.
func NewOverlayController(factory OverlayWindowFactory) *OverlayController {
	return &OverlayController{factory: factory}
}

// Start loads the profile, closes any existing overlay window, and creates a clean one.
// For streaming profiles it returns a non-running status without creating a desktop window.
func (c *OverlayController) Start(profile *config.ProfileConfig) (OverlayStatus, error) {
	// Close previous window and decide whether a desktop window is needed.
	// Keep the critical section short; window creation can be slow.
	c.mu.Lock()
	if c.current != nil {
		c.current.Close()
		c.current = nil
	}

	if profile == nil {
		c.status = OverlayStatus{}
		c.mu.Unlock()
		return c.status, nil
	}

	mode := profile.DisplayMode
	if mode == config.ModeStreaming {
		c.status = OverlayStatus{Running: false, ProfileID: profile.ID, Mode: config.ModeStreaming}
		c.mu.Unlock()
		return c.status, nil
	}

	// Keep the mode as-is (could be config.ModeRacing or config.ModeEdit)
	runtimeProfile := *profile
	c.status = OverlayStatus{Running: false, ProfileID: profile.ID, Mode: mode}
	c.mu.Unlock()

	// Create the window outside the lock so concurrent Status() calls are not blocked.
	bounds := config.Rect{}
	origin := config.Rect{}
	win, err := c.factory.NewOverlayWindow(&runtimeProfile, origin, bounds)

	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		c.status = OverlayStatus{Running: false, ProfileID: profile.ID, Mode: mode}
		return c.status, err
	}

	c.current = win
	c.status = OverlayStatus{Running: true, ProfileID: profile.ID, Mode: mode}
	return c.status, nil
}

// Stop closes the current overlay window.
func (c *OverlayController) Stop() OverlayStatus {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.current != nil {
		c.current.Close()
		c.current = nil
	}
	c.status.Running = false
	return c.status
}

// CurrentWindow returns the active overlay window, or nil if none is running.
func (c *OverlayController) CurrentWindow() OverlayWindow {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.current
}

// Status returns the current overlay status.
func (c *OverlayController) Status() OverlayStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}
