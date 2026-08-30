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

// SetProfilesDir sets the directory used to discover profiles for cycling.
func (s *StudioProfileService) SetProfilesDir(dir string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.profilesDir = dir
}

// SetWindowManager binds the desktop window manager used for runtime display modes.
func (s *StudioProfileService) SetWindowManager(mgr *window.Manager) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.mgr = mgr
}

func (s *StudioProfileService) SetOnPerformanceSaved(callback func(*config.ProfileDocumentV4)) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.onPerformanceSaved = callback
}

func (s *StudioProfileService) SetPerformanceSaveCoordinator(coordinator *PerformanceSaveCoordinator) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.performanceSaves = coordinator
}

// Path returns the active profile file path.
func (s *StudioProfileService) Path() string {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.path
}

// Document returns the loaded V3 profile document.
func (s *StudioProfileService) Document() *config.ProfileDocumentV3 {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	if s.loaded == nil || s.loaded.Document == nil {
		return nil
	}
	return config.NormalizeProfileDocumentV3(s.loaded.Document)
}

// PerformanceProfile returns the canonical V4 document used to resolve the
// active profile policy. Runtime layout consumers keep using the V3 adapter.
func (s *StudioProfileService) PerformanceProfile() *config.ProfileDocumentV4 {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	if s.loaded == nil || s.loaded.DocumentV4 == nil {
		return nil
	}
	return config.NormalizeProfileDocumentV4(s.loaded.DocumentV4)
}

// Revision returns the loaded profile revision hash.
func (s *StudioProfileService) Revision() string {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	if s.loaded == nil {
		return ""
	}
	return s.loaded.Revision
}

// LoadActiveProfile loads a profile file and sets it as the active save target.
func (s *StudioProfileService) LoadActiveProfile(path string) error {
	_, err := s.Load(path)
	return err
}

// SetDisplayMode changes the active document mode and applies it to the window.
func (s *StudioProfileService) SetDisplayMode(mode config.DisplayMode) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()
	s.stateMu.Lock()
	if s.loaded == nil || s.loaded.Document == nil {
		s.stateMu.Unlock()
		return fmt.Errorf("profile not loaded")
	}
	s.loaded.Document.DisplayMode = mode
	document := config.NormalizeProfileDocumentV3(s.loaded.Document)
	mgr := s.mgr
	s.stateMu.Unlock()
	if mgr != nil {
		mgr.ApplyProfileV3(document, false)
	}
	return nil
}

// ApplyToWindow applies the current document to the window manager.
func (s *StudioProfileService) ApplyToWindow(skipRefresh bool) {
	s.stateMu.RLock()
	if s.loaded == nil || s.loaded.Document == nil || s.mgr == nil {
		s.stateMu.RUnlock()
		return
	}
	document := config.NormalizeProfileDocumentV3(s.loaded.Document)
	mgr := s.mgr
	s.stateMu.RUnlock()
	mgr.ApplyProfileV3(document, skipRefresh)
}

// EmitRuntimeLoaded broadcasts overlay:profile-v3-loaded for desktop/OBS runtimes.
func (s *StudioProfileService) EmitRuntimeLoaded() {
	s.stateMu.RLock()
	if s.emitter == nil || s.loaded == nil || s.loaded.Document == nil {
		s.stateMu.RUnlock()
		return
	}
	document := config.NormalizeProfileDocumentV3(s.loaded.Document)
	revision := s.loaded.Revision
	mgr := s.mgr
	s.stateMu.RUnlock()
	var origin config.Rect
	if mgr != nil {
		origin = mgr.LayoutOriginV3(document)
	}
	s.emitter.Emit("overlay:profile-v3-loaded", map[string]any{
		"document":     document,
		"revision":     revision,
		"layoutOrigin": origin,
		"windowMode":   string(document.DisplayMode),
	})
}

// NextProfile loads the next profile alphabetically and emits the runtime broadcast.
func (s *StudioProfileService) NextProfile() error {
	return s.cycleProfile(1)
}

// PreviousProfile loads the previous profile alphabetically and emits the runtime broadcast.
func (s *StudioProfileService) PreviousProfile() error {
	return s.cycleProfile(-1)
}

func (s *StudioProfileService) listProfileFiles() []string {
	s.stateMu.RLock()
	profilesDir := s.profilesDir
	s.stateMu.RUnlock()
	if profilesDir == "" {
		return nil
	}
	entries, err := os.ReadDir(profilesDir)
	if err != nil {
		return nil
	}
	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") && !strings.Contains(entry.Name(), "app-settings") {
			files = append(files, filepath.Join(profilesDir, entry.Name()))
		}
	}
	sort.Strings(files)
	return files
}

func (s *StudioProfileService) cycleProfile(direction int) error {
	files := s.listProfileFiles()
	if len(files) == 0 {
		return fmt.Errorf("no profiles available")
	}

	currentPath := s.Path()
	currentIdx := -1
	for i, file := range files {
		if file == currentPath || filepath.Base(file) == filepath.Base(currentPath) {
			currentIdx = i
			break
		}
	}

	if currentIdx < 0 {
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
		return fmt.Errorf("loading profile %s: %w", filepath.Base(target), err)
	}
	s.EmitRuntimeLoaded()
	return nil
}
