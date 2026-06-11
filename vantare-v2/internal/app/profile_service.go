package app

import (
	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

// ProfileService exposes profile management to the Wails frontend.
type ProfileService struct {
	path    string
	profile *config.ProfileConfig
	mgr     *window.Manager
	emitter EventEmitter // for profile:loaded, layout:saved events
}

// NewProfileService creates a profile service bound to the given JSON file.
func NewProfileService(path string, mgr *window.Manager, emitter EventEmitter) *ProfileService {
	return &ProfileService{
		path:    path,
		mgr:     mgr,
		emitter: emitter,
	}
}

// Load reads the profile from disk and stores it in memory.
func (s *ProfileService) Load() error {
	p, err := config.LoadFile(s.path)
	if err != nil {
		return err
	}
	s.profile = p
	return nil
}

// GetProfile returns the current profile (callable from frontend).
func (s *ProfileService) GetProfile() *config.ProfileConfig {
	return s.profile
}

// SaveLayout updates widget positions and persists to disk.
// skipRefresh=true avoids recreating the window.
func (s *ProfileService) SaveLayout(widgets []config.WidgetConfig) error {
	s.profile.Widgets = widgets
	if err := config.SaveFile(s.path, s.profile); err != nil {
		return err
	}
	// Apply with skipRefresh=true — resize only, no recreate
	s.mgr.ApplyProfile(s.profile, true)

	// Emit layout:saved event
	if s.emitter != nil {
		s.emitter.Emit("layout:saved", map[string]any{
			"ok":      true,
			"profile": s.profile,
		})
	}
	return nil
}

// SetDisplayMode changes the mode and applies it to the window.
func (s *ProfileService) SetDisplayMode(mode config.DisplayMode) error {
	s.profile.DisplayMode = mode
	s.mgr.ApplyProfile(s.profile, false)
	return nil
}

// EmitLoaded emits the profile:loaded event with layout origin.
func (s *ProfileService) EmitLoaded() {
	if s.emitter == nil || s.profile == nil {
		return
	}
	origin := s.mgr.LayoutOrigin(s.profile)
	s.emitter.Emit("profile:loaded", map[string]any{
		"profile":      s.profile,
		"layoutOrigin": origin,
		"windowMode":   string(s.profile.DisplayMode),
	})
}

// Profile returns the loaded profile (for main.go startup).
func (s *ProfileService) Profile() *config.ProfileConfig {
	return s.profile
}

// SetProfile replaces the in-memory profile (for fallback defaults).
func (s *ProfileService) SetProfile(p *config.ProfileConfig) {
	s.profile = p
}

// ApplyToWindow applies the current profile to the window.
func (s *ProfileService) ApplyToWindow(skipRefresh bool) {
	if s.profile != nil && s.mgr != nil {
		s.mgr.ApplyProfile(s.profile, skipRefresh)
	}
}
