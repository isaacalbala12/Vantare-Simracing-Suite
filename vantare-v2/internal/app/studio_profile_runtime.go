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
	s.profilesDir = dir
}

// SetWindowManager binds the desktop window manager used for runtime display modes.
func (s *StudioProfileService) SetWindowManager(mgr *window.Manager) {
	s.mgr = mgr
}

// Path returns the active profile file path.
func (s *StudioProfileService) Path() string {
	return s.path
}

// Document returns the loaded V3 profile document.
func (s *StudioProfileService) Document() *config.ProfileDocumentV3 {
	if s.loaded == nil {
		return nil
	}
	return s.loaded.Document
}

// Revision returns the loaded profile revision hash.
func (s *StudioProfileService) Revision() string {
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
	if s.loaded == nil || s.loaded.Document == nil {
		return fmt.Errorf("profile not loaded")
	}
	s.loaded.Document.DisplayMode = mode
	if s.mgr != nil {
		s.mgr.ApplyProfileV3(s.loaded.Document, false)
	}
	return nil
}

// ApplyToWindow applies the current document to the window manager.
func (s *StudioProfileService) ApplyToWindow(skipRefresh bool) {
	if s.loaded == nil || s.loaded.Document == nil || s.mgr == nil {
		return
	}
	s.mgr.ApplyProfileV3(s.loaded.Document, skipRefresh)
}

// EmitRuntimeLoaded broadcasts overlay:profile-v3-loaded for desktop/OBS runtimes.
func (s *StudioProfileService) EmitRuntimeLoaded() {
	if s.emitter == nil || s.loaded == nil || s.loaded.Document == nil {
		return
	}
	var origin config.Rect
	if s.mgr != nil {
		origin = s.mgr.LayoutOriginV3(s.loaded.Document)
	}
	s.emitter.Emit("overlay:profile-v3-loaded", map[string]any{
		"document":     s.loaded.Document,
		"revision":     s.loaded.Revision,
		"layoutOrigin": origin,
		"windowMode":   string(s.loaded.Document.DisplayMode),
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
	if s.profilesDir == "" {
		return nil
	}
	entries, err := os.ReadDir(s.profilesDir)
	if err != nil {
		return nil
	}
	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") && !strings.Contains(entry.Name(), "app-settings") {
			files = append(files, filepath.Join(s.profilesDir, entry.Name()))
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

	currentIdx := -1
	for i, file := range files {
		if file == s.path || filepath.Base(file) == filepath.Base(s.path) {
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
