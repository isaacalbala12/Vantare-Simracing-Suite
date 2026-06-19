package app

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/vantare/overlays/v2/pkg/config"
)

// SaveProfileAsOwnCopy persists an imported/read-only preset as a normal user profile.
func (s *HubService) SaveProfileAsOwnCopy(profile *config.ProfileConfig) error {
	if s.profilesDir == "" {
		return fmt.Errorf("profiles directory not configured")
	}
	if profile == nil {
		return fmt.Errorf("profile is required")
	}
	id := strings.TrimSpace(profile.ID)
	if id == "" {
		return fmt.Errorf("profile id is required")
	}
	basename := filepath.Base(id)
	if basename != id || strings.Contains(basename, "..") {
		return fmt.Errorf("invalid profile id")
	}
	if !strings.HasPrefix(id, "custom-") {
		id = "custom-" + id
		profile.ID = id
	}
	path := filepath.Join(s.profilesDir, id+".json")
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("profile already exists: %s", id)
	}
	return config.SaveFile(path, profile)
}

var invalidProfileNameChars = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

// ProfileEntry is a lightweight profile descriptor for hub listing.
type ProfileEntry struct {
	ID          string                `json:"id"`
	File        string                `json:"file"` // basename on disk (e.g. example-racing.json)
	Name        string                `json:"name,omitempty"`
	DisplayMode config.DisplayMode    `json:"displayMode"`
	Widgets     int                   `json:"widgets"`
	Profile     *config.ProfileConfig `json:"profile,omitempty"`
}

// OverlayRuntime is the interface HubService uses to start/stop the desktop overlay.
type OverlayRuntime interface {
	Start(profile *config.ProfileConfig) (OverlayStatus, error)
	Stop() OverlayStatus
	Status() OverlayStatus
}

// HubService manages profile CRUD from the hub frontend.
type HubService struct {
	profilesDir string
	profileSvc  *ProfileService
	emitter     EventEmitter
	overlay     OverlayRuntime
}

// NewHubService creates a hub service.
func NewHubService(profilesDir string, profileSvc *ProfileService, emitter EventEmitter, overlay OverlayRuntime) *HubService {
	return &HubService{
		profilesDir: profilesDir,
		profileSvc:  profileSvc,
		emitter:     emitter,
		overlay:     overlay,
	}
}

// ListProfiles returns all profile JSON files in the configs directory.
func (s *HubService) ListProfiles() ([]ProfileEntry, error) {
	if s.profilesDir == "" {
		return nil, fmt.Errorf("profiles directory not configured")
	}
	entries, err := os.ReadDir(s.profilesDir)
	if err != nil {
		return nil, fmt.Errorf("read profiles dir: %w", err)
	}

	var profiles []ProfileEntry
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		fullPath := filepath.Join(s.profilesDir, e.Name())
		p, err := config.LoadFile(fullPath)
		if err != nil {
			continue
		}
		id := p.ID
		if id == "" {
			id = strings.TrimSuffix(e.Name(), ".json")
		}
		profiles = append(profiles, ProfileEntry{
			ID:          id,
			File:        e.Name(),
			Name:        p.Name,
			DisplayMode: p.DisplayMode,
			Widgets:     len(p.Widgets),
			Profile:     p,
		})
	}
	return profiles, nil
}

// CreateProfile creates a new profile with default widgets.
func (s *HubService) CreateProfile(name string) error {
	if s.profilesDir == "" {
		return fmt.Errorf("profiles directory not configured")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("profile name is required")
	}

	safeName := strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	safeName = invalidProfileNameChars.ReplaceAllString(safeName, "-")
	if safeName == "" {
		safeName = "new-profile"
	}
	id := fmt.Sprintf("custom-%s", safeName)
	path := filepath.Join(s.profilesDir, fmt.Sprintf("%s.json", id))

	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("profile already exists: %s", id)
	}

	profile := &config.ProfileConfig{
		ID:           id,
		Name:         name,
		DisplayMode:  config.ModeEdit,
		MonitorIndex: 0,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, UpdateHz: 30, Position: config.Rect{X: 760, Y: 40, W: 400, H: 48}},
			{ID: "relative", Type: "relative", Enabled: true, UpdateHz: 15, Position: config.Rect{X: 40, Y: 600, W: 320, H: 280}},
			{ID: "standings", Type: "standings", Enabled: true, UpdateHz: 15, Position: config.Rect{X: 1560, Y: 40, W: 340, H: 420}},
		},
	}

	return config.SaveFile(path, profile)
}

// DeleteProfile removes a profile JSON file (by id or file basename).
func (s *HubService) DeleteProfile(idOrFile string) error {
	path, err := s.findProfilePath(idOrFile)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

// ActivateProfile loads a profile as the active save target.
// It does not create or mutate the desktop overlay window.
func (s *HubService) ActivateProfile(idOrFile string) error {
	path, err := s.findProfilePath(idOrFile)
	if err != nil {
		return err
	}
	return s.profileSvc.LoadActiveProfile(path)
}

// StartOverlay loads the profile and creates a fresh runtime overlay window.
func (s *HubService) StartOverlay(idOrFile string) (OverlayStatus, error) {
	if err := s.ActivateProfile(idOrFile); err != nil {
		status := OverlayStatus{}
		if s.overlay != nil {
			status = s.overlay.Status()
		}
		if s.emitter != nil {
			s.emitter.Emit("overlay:status", status)
		}
		return status, err
	}
	if s.overlay == nil {
		return OverlayStatus{}, fmt.Errorf("overlay runtime not configured")
	}
	profile := s.profileSvc.GetProfile()
	status, err := s.overlay.Start(profile)
	if s.emitter != nil {
		s.emitter.Emit("overlay:status", status)
	}
	if err != nil {
		return status, err
	}
	return status, nil
}

// StopOverlay closes the runtime overlay window.
func (s *HubService) StopOverlay() OverlayStatus {
	if s.overlay == nil {
		return OverlayStatus{}
	}
	status := s.overlay.Stop()
	if s.emitter != nil {
		s.emitter.Emit("overlay:status", status)
	}
	return status
}

// findProfilePath resolves id or file basename to an absolute profile path.
func (s *HubService) findProfilePath(idOrFile string) (string, error) {
	if s.profilesDir == "" {
		return "", fmt.Errorf("profiles directory not configured")
	}
	idOrFile = strings.TrimSpace(idOrFile)
	if idOrFile == "" {
		return "", fmt.Errorf("profile id is required")
	}

	basename := filepath.Base(idOrFile)
	if basename != idOrFile || strings.Contains(basename, "..") {
		return "", fmt.Errorf("invalid profile id")
	}
	if !strings.HasSuffix(basename, ".json") {
		basename += ".json"
	}

	direct := filepath.Join(s.profilesDir, basename)
	if _, err := os.Stat(direct); err == nil {
		return direct, nil
	}

	// Match by JSON id when filename differs (e.g. example-racing.json → id default-racing)
	stem := strings.TrimSuffix(basename, ".json")
	entries, err := os.ReadDir(s.profilesDir)
	if err != nil {
		return "", fmt.Errorf("read profiles dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		full := filepath.Join(s.profilesDir, e.Name())
		p, err := config.LoadFile(full)
		if err != nil {
			continue
		}
		pid := p.ID
		if pid == "" {
			pid = strings.TrimSuffix(e.Name(), ".json")
		}
		if pid == stem || pid == idOrFile || e.Name() == basename {
			return full, nil
		}
	}
	return "", fmt.Errorf("profile not found: %s", idOrFile)
}
