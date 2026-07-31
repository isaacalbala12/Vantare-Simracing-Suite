package app

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

// ProfileService exposes profile management to the Wails frontend.
type ProfileService struct {
	mu          sync.RWMutex
	operationMu sync.Mutex
	path        string
	profile     *config.ProfileConfig
	mgr         *window.Manager
	emitter     EventEmitter // for profile:loaded, layout:saved events
	profilesDir string       // directory to scan for cycling; empty means cycling disabled
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
	s.mu.Lock()
	defer s.mu.Unlock()
	s.profilesDir = dir
}

// Load reads the profile from disk and stores it in memory.
func (s *ProfileService) Load() error {
	s.mu.RLock()
	path := s.path
	s.mu.RUnlock()
	return s.LoadActiveProfile(path)
}

// LoadActiveProfile loads a profile file and sets it as the active save target.
func (s *ProfileService) LoadActiveProfile(path string) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	p, err := config.LoadFile(path)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.path = path
	s.profile = config.CopyProfile(p)
	s.mu.Unlock()
	return nil
}

// GetProfile returns the current profile (callable from frontend).
func (s *ProfileService) GetProfile() *config.ProfileConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return config.CopyProfile(s.profile)
}

// SaveProfile persists the given profile to the configured profile path.
func (s *ProfileService) SaveProfile(p *config.ProfileConfig) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	candidate := config.CopyProfile(p)
	if candidate == nil {
		return fmt.Errorf("profile is required")
	}
	s.mu.RLock()
	path := s.path
	s.mu.RUnlock()
	if path == "" {
		return fmt.Errorf("profile path not configured")
	}
	if err := config.SaveFile(path, candidate); err != nil {
		return fmt.Errorf("save profile: %w", err)
	}
	s.mu.Lock()
	s.profile = candidate
	s.mu.Unlock()
	s.emitLoaded(config.CopyProfile(candidate))
	if s.emitter != nil {
		s.emitter.Emit("hub:profile", map[string]any{"profile": config.CopyProfile(candidate)})
		s.emitter.Emit("profile:saved", map[string]any{"ok": true})
	}
	return nil
}

// SaveLayout updates widget positions and persists to disk.
// Uses skipWindowRefresh (bounds-only resize) and re-emits profile:loaded for layoutOrigin sync.
func (s *ProfileService) SaveLayout(widgets []config.WidgetConfig) error {
	return s.SaveProfileState(widgets, nil)
}

// SaveProfileState updates widget positions and optional variants, then persists to disk.
// If variants is nil the existing variants are preserved (backwards compatibility).
// Uses skipWindowRefresh (bounds-only resize) and re-emits profile:loaded for layoutOrigin sync.
// On a disk write error the in-memory profile is rolled back to its previous state.
func (s *ProfileService) SaveProfileState(widgets []config.WidgetConfig, variants []config.WidgetVariantConfig) error {
	if len(widgets) == 0 {
		return fmt.Errorf("no widgets to save")
	}
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	s.mu.RLock()
	candidate := config.CopyProfile(s.profile)
	path := s.path
	s.mu.RUnlock()
	if candidate == nil {
		return fmt.Errorf("profile not loaded")
	}
	config.SetGeneralLayoutWidgets(candidate, widgets)
	if variants != nil {
		candidate.Variants = config.CopyProfileVariants(variants)
	}
	if err := config.SaveFile(path, candidate); err != nil {
		return err
	}
	s.mu.Lock()
	s.profile = candidate
	s.mu.Unlock()
	snapshot := config.CopyProfile(candidate)
	// skipWindowRefresh: bounds only, then refresh frontend layout origin
	if s.mgr != nil {
		s.mgr.ApplyProfile(snapshot, true)
	}

	if s.emitter != nil {
		s.emitter.Emit("layout:saved", map[string]any{
			"ok":      true,
			"profile": config.CopyProfile(snapshot),
		})
		s.emitter.Emit("profile:saved", map[string]any{"ok": true})
	}
	return nil
}

// SetDisplayMode changes the mode and applies it to the window.
func (s *ProfileService) SetDisplayMode(mode config.DisplayMode) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	s.mu.Lock()
	if s.profile == nil {
		s.mu.Unlock()
		return fmt.Errorf("profile not loaded")
	}
	s.profile.DisplayMode = mode
	snapshot := config.CopyProfile(s.profile)
	s.mu.Unlock()
	if s.mgr != nil {
		s.mgr.ApplyProfile(snapshot, false)
	}
	return nil
}

// EmitLoaded emits the profile:loaded event with layout origin.
func (s *ProfileService) EmitLoaded() {
	s.mu.RLock()
	profile := config.CopyProfile(s.profile)
	s.mu.RUnlock()
	s.emitLoaded(profile)
}

func (s *ProfileService) emitLoaded(profile *config.ProfileConfig) {
	if s.emitter == nil || profile == nil {
		return
	}
	var origin config.Rect
	if s.mgr != nil {
		// Desktop runtime overlay is always fullscreen for racing and edit modes,
		// so profile coordinates are already window-local. Streaming keeps the
		// shrink-wrap origin for any consumer that still needs it.
		if profile.DisplayMode == config.ModeRacing || profile.DisplayMode == config.ModeEdit {
			origin = config.Rect{}
		} else {
			origin = s.mgr.LayoutOrigin(profile)
		}
	} else {
		// The hub-owned runtime overlay is fullscreen, so profile coordinates
		// are already window-local.
		origin = config.Rect{}
	}
	s.emitter.Emit("profile:loaded", map[string]any{
		"profile":      config.CopyProfile(profile),
		"layoutOrigin": origin,
		"windowMode":   string(profile.DisplayMode),
	})
}

// Profile returns the loaded profile (for main.go startup).
func (s *ProfileService) Profile() *config.ProfileConfig {
	return s.GetProfile()
}

// Path returns the active profile file path.
func (s *ProfileService) Path() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.path
}

// SetProfile replaces the in-memory profile (for fallback defaults).
func (s *ProfileService) SetProfile(p *config.ProfileConfig) {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	s.mu.Lock()
	s.profile = config.CopyProfile(p)
	s.mu.Unlock()
}

// ApplyToWindow applies the current profile to the window.
func (s *ProfileService) ApplyToWindow(skipRefresh bool) {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	s.mu.RLock()
	profile := config.CopyProfile(s.profile)
	s.mu.RUnlock()
	if profile != nil && s.mgr != nil {
		s.mgr.ApplyProfile(profile, skipRefresh)
	}
}

// listProfileFiles returns sorted profile JSON file paths from profilesDir.
func (s *ProfileService) listProfileFiles() []string {
	s.mu.RLock()
	profilesDir := s.profilesDir
	s.mu.RUnlock()
	return listProfileFiles(profilesDir)
}

func listProfileFiles(profilesDir string) []string {
	if profilesDir == "" {
		return nil
	}
	entries, err := os.ReadDir(profilesDir)
	if err != nil {
		return nil
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") && !strings.Contains(e.Name(), "app-settings") {
			files = append(files, filepath.Join(profilesDir, e.Name()))
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
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	s.mu.RLock()
	profilesDir := s.profilesDir
	activePath := s.path
	s.mu.RUnlock()
	files := listProfileFiles(profilesDir)
	if len(files) == 0 {
		return fmt.Errorf("no profiles available")
	}

	// Find current index based on active path
	currentIdx := -1
	for i, f := range files {
		// Match by resolved path or filename
		if f == activePath || filepath.Base(f) == filepath.Base(activePath) {
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
	profile, err := config.LoadFile(target)
	if err != nil {
		return fmt.Errorf("loading profile %s: %w", target, err)
	}
	s.mu.Lock()
	s.path = target
	s.profile = config.CopyProfile(profile)
	s.mu.Unlock()
	s.emitLoaded(config.CopyProfile(profile))
	return nil
}
