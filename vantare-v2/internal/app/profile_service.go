package app

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

// ProfileService exposes profile management to the Wails frontend.
type ProfileService struct {
	path        string
	profile     *config.ProfileConfig
	mgr         *window.Manager
	emitter     EventEmitter // for profile:loaded, layout:saved events
	profilesDir string      // directory to scan for cycling; empty means cycling disabled
}

// NewProfileService creates a profile service bound to the given JSON file.
func NewProfileService(path string, mgr *window.Manager, emitter EventEmitter) *ProfileService {
	return &ProfileService{
		path:    path,
		mgr:     mgr,
		emitter: emitter,
	}
}

// SetProfilesDir sets the directory used to discover profiles for cycling.
func (s *ProfileService) SetProfilesDir(dir string) {
	s.profilesDir = dir
}

// Load reads the profile from disk and stores it in memory.
func (s *ProfileService) Load() error {
	return s.LoadActiveProfile(s.path)
}

// LoadActiveProfile loads a profile file and sets it as the active save target.
func (s *ProfileService) LoadActiveProfile(path string) error {
	p, err := config.LoadFile(path)
	if err != nil {
		return err
	}
	s.path = path
	s.profile = p
	return nil
}

// GetProfile returns the current profile (callable from frontend).
func (s *ProfileService) GetProfile() *config.ProfileConfig {
	return s.profile
}

// SaveProfile persists the given profile to the configured profile path.
func (s *ProfileService) SaveProfile(p *config.ProfileConfig) error {
	if s.path == "" {
		return fmt.Errorf("profile path not configured")
	}
	if err := config.SaveFile(s.path, p); err != nil {
		return fmt.Errorf("save profile: %w", err)
	}
	s.profile = p
	s.EmitLoaded()
	if s.emitter != nil {
		s.emitter.Emit("hub:profile", map[string]any{"profile": p})
		s.emitter.Emit("profile:saved", map[string]any{"ok": true})
	}
	return nil
}
// SaveLayout updates widget positions and persists to disk.
// Uses skipWindowRefresh (bounds-only resize) and re-emits profile:loaded for layoutOrigin sync.
func (s *ProfileService) SaveLayout(widgets []config.WidgetConfig) error {
	if s.profile == nil {
		return fmt.Errorf("profile not loaded")
	}
	// Persist first; only mutate memory after success so an I/O error leaves
	// the in-memory profile consistent with disk.
	backup := s.profile.Widgets
	s.profile.Widgets = widgets
	if err := config.SaveFile(s.path, s.profile); err != nil {
		s.profile.Widgets = backup
		return err
	}
	// skipWindowRefresh: bounds only, then refresh frontend layout origin
	if s.mgr != nil {
		s.mgr.ApplyProfile(s.profile, true)
	}

	if s.emitter != nil {
		s.emitter.Emit("layout:saved", map[string]any{
			"ok":      true,
			"profile": s.profile,
		})
		s.emitter.Emit("profile:saved", map[string]any{"ok": true})
		s.EmitLoaded()
	}
	return nil
}

// SetDisplayMode changes the mode and applies it to the window.
func (s *ProfileService) SetDisplayMode(mode config.DisplayMode) error {
	if s.profile == nil {
		return fmt.Errorf("profile not loaded")
	}
	s.profile.DisplayMode = mode
	if s.mgr != nil {
		s.mgr.ApplyProfile(s.profile, false)
	}
	return nil
}

// EmitLoaded emits the profile:loaded event with layout origin.
func (s *ProfileService) EmitLoaded() {
	if s.emitter == nil || s.profile == nil {
		return
	}
	var origin config.Rect
	if s.mgr != nil {
		origin = s.mgr.LayoutOrigin(s.profile)
	} else {
		// The hub-owned runtime overlay is fullscreen, so profile coordinates
		// are already window-local.
		origin = config.Rect{}
	}
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

// listProfileFiles returns sorted profile JSON file paths from profilesDir.
func (s *ProfileService) listProfileFiles() []string {
	if s.profilesDir == "" {
		return nil
	}
	entries, err := os.ReadDir(s.profilesDir)
	if err != nil {
		return nil
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") && !strings.Contains(e.Name(), "app-settings") {
			files = append(files, filepath.Join(s.profilesDir, e.Name()))
		}
	}
	sort.Strings(files)
	return files
}

// NextProfile loads the next profile (alphabetically) and emits profile:loaded.
func (s *ProfileService) NextProfile() error {
	return s.cycleProfile(1)
}

// PreviousProfile loads the previous profile (alphabetically) and emits profile:loaded.
func (s *ProfileService) PreviousProfile() error {
	return s.cycleProfile(-1)
}

func (s *ProfileService) cycleProfile(direction int) error {
	files := s.listProfileFiles()
	if len(files) == 0 {
		return fmt.Errorf("no profiles available")
	}

	// Find current index based on active path
	currentIdx := -1
	for i, f := range files {
		// Match by resolved path or filename
		if f == s.path || filepath.Base(f) == filepath.Base(s.path) {
			currentIdx = i
			break
		}
	}

	if currentIdx < 0 {
		// Current profile not in list; start at beginning or end
		if direction > 0 {
			currentIdx = 0
		} else {
			currentIdx = len(files) - 1
		}
	} else {
		currentIdx = (currentIdx + direction + len(files)) % len(files)
	}

	target := files[currentIdx]
	if err := s.LoadActiveProfile(target); err != nil {
		return fmt.Errorf("loading profile %s: %w", target, err)
	}

	s.EmitLoaded()
	return nil
}
