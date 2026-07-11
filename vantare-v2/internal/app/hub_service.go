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
// The profile is converted to schema v2 if needed and assigned a unique file id so
// copying the same preset multiple times never overwrites an existing profile.
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
	}
	if id == "custom-" {
		return fmt.Errorf("invalid profile id")
	}

	uniqueID, err := uniqueProfileFileID(s.profilesDir, id)
	if err != nil {
		return fmt.Errorf("resolving unique profile id: %w", err)
	}

	profileCopy := *profile
	profileCopy.ID = uniqueID

	// Editable copies must have schema v2 layouts and variants so WidgetStudio
	// can save column/filter changes without silent data loss.
	profileToSave := config.ConvertProfileToV2(&profileCopy)

	path := filepath.Join(s.profilesDir, uniqueID+".json")
	return config.SaveFile(path, profileToSave)
}

// uniqueProfileFileID returns a profile id whose JSON file does not yet exist,
// appending an incrementing numeric suffix when the base id is taken.
// Any os.Stat error other than os.ErrNotExist is propagated so the caller does
// not loop forever on unreadable directories.
func uniqueProfileFileID(profilesDir, baseID string) (string, error) {
	candidate := baseID
	_, err := os.Stat(filepath.Join(profilesDir, candidate+".json"))
	if err != nil {
		if os.IsNotExist(err) {
			return candidate, nil
		}
		return "", fmt.Errorf("stat profile %s: %w", candidate, err)
	}

	suffix := 1
	for {
		candidate = fmt.Sprintf("%s-%d", baseID, suffix)
		_, err := os.Stat(filepath.Join(profilesDir, candidate+".json"))
		if err != nil {
			if os.IsNotExist(err) {
				return candidate, nil
			}
			return "", fmt.Errorf("stat profile %s: %w", candidate, err)
		}
		suffix++
	}
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
	Start(document *config.ProfileDocumentV3) (OverlayStatus, error)
	Stop() OverlayStatus
	Status() OverlayStatus
}

// HubService manages profile CRUD from the hub frontend.
type HubService struct {
	profilesDir      string
	profileSvc       *ProfileService
	studioProfileSvc *StudioProfileService
	settingsSvc      *SettingsService
	emitter          EventEmitter
	overlay          OverlayRuntime
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

// SetStudioProfileService wires the canonical V3 runtime profile service.
func (s *HubService) SetStudioProfileService(svc *StudioProfileService) {
	s.studioProfileSvc = svc
}

func (s *HubService) activeOverlayDocument() (*config.ProfileDocumentV3, error) {
	if s.studioProfileSvc == nil {
		return nil, fmt.Errorf("studio profile service not configured")
	}
	if doc := s.studioProfileSvc.Document(); doc != nil {
		return doc, nil
	}
	path := s.profileSvc.Path()
	if path == "" {
		return nil, fmt.Errorf("no active profile")
	}
	if _, err := s.studioProfileSvc.Load(path); err != nil {
		return nil, err
	}
	if doc := s.studioProfileSvc.Document(); doc != nil {
		return doc, nil
	}
	return nil, fmt.Errorf("no active V3 profile")
}

// SetSettingsService attaches a settings service for active profile persistence.
// Call after construction; nil-safe (no-op if svc is nil).
func (s *HubService) SetSettingsService(svc *SettingsService) {
	s.settingsSvc = svc
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
		if !isListableProfile(p) {
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

func isListableProfile(p *config.ProfileConfig) bool {
	if p == nil || p.Widgets == nil {
		return false
	}
	switch p.DisplayMode {
	case config.ModeRacing, config.ModeEdit, config.ModeStreaming:
		return true
	default:
		return false
	}
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

	profile = config.ConvertProfileToV2(profile)

	return config.SaveFile(path, profile)
}

// DeleteProfile removes a profile JSON file (by id or file basename).
// If the deleted profile is the active overlay profile, the active setting is cleared.
func (s *HubService) DeleteProfile(idOrFile string) error {
	path, err := s.findProfilePath(idOrFile)
	if err != nil {
		return err
	}

	// Resolve the profile ID to check if it matches the active setting.
	resolvedID := idOrFile
	if s.settingsSvc != nil && s.settingsSvc.Settings().ActiveOverlayProfileID != "" {
		// Load the profile to get its real ID (may differ from filename).
		if p, loadErr := config.LoadFile(path); loadErr == nil && p.ID != "" {
			resolvedID = p.ID
		}
		activeID := s.settingsSvc.Settings().ActiveOverlayProfileID
		if activeID == idOrFile || activeID == resolvedID {
			s.settingsSvc.Settings().ActiveOverlayProfileID = ""
			if saveErr := s.settingsSvc.Save(s.settingsSvc.Settings()); saveErr != nil {
				return fmt.Errorf("clearing active profile setting: %w", saveErr)
			}
		}
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

// ResolveProfilePath resolves an id or file basename to an absolute profile path.
// Returns an error if the profile is not found.
func (s *HubService) ResolveProfilePath(idOrFile string) (string, error) {
	return s.findProfilePath(idOrFile)
}

// SetActiveProfile persists the given profile as the active overlay profile.
// It accepts either a profile ID or file name, loads the profile into
// ProfileService, persists the canonical profile ID in SettingsService, and
// emits profile:loaded + hub:profile-activated events.
func (s *HubService) SetActiveProfile(idOrFile string) error {
	if idOrFile == "" {
		return fmt.Errorf("profile id or file is required")
	}
	path, err := s.findProfilePath(idOrFile)
	if err != nil {
		return err
	}
	if err := s.profileSvc.LoadActiveProfile(path); err != nil {
		return fmt.Errorf("loading active profile: %w", err)
	}
	profile := s.profileSvc.GetProfile()
	if profile == nil || profile.ID == "" {
		return fmt.Errorf("loaded profile has no id")
	}
	if s.settingsSvc != nil {
		s.settingsSvc.Settings().ActiveOverlayProfileID = profile.ID
		if err := s.settingsSvc.Save(s.settingsSvc.Settings()); err != nil {
			return fmt.Errorf("persisting active profile id: %w", err)
		}
	}
	if s.emitter != nil {
		s.profileSvc.EmitLoaded()
		s.emitter.Emit("hub:profile-activated", map[string]any{"ok": true, "activeProfileId": profile.ID})
	}
	return nil
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
	document, err := s.activeOverlayDocument()
	if err != nil {
		return OverlayStatus{}, err
	}
	// Close any previous window to avoid ghost overlays when switching profiles.
	s.overlay.Stop()
	status, err := s.overlay.Start(document)
	if s.emitter != nil {
		s.emitter.Emit("overlay:status", status)
	}
	if err != nil {
		return status, err
	}
	if s.studioProfileSvc != nil {
		s.studioProfileSvc.EmitRuntimeLoaded()
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

// StartActiveOverlay starts the desktop overlay using the currently active profile.
// It is used by the global toggle-edit-mode hotkey when no overlay window is running.
func (s *HubService) StartActiveOverlay() (OverlayStatus, error) {
	if s.overlay == nil {
		return OverlayStatus{}, fmt.Errorf("overlay runtime not configured")
	}
	document, err := s.activeOverlayDocument()
	if err != nil {
		return OverlayStatus{}, err
	}
	// Close any previous window to avoid ghost overlays when switching profiles.
	s.overlay.Stop()
	status, err := s.overlay.Start(document)
	if s.emitter != nil {
		s.emitter.Emit("overlay:status", status)
	}
	if err != nil {
		return status, err
	}
	if s.studioProfileSvc != nil {
		s.studioProfileSvc.EmitRuntimeLoaded()
	}
	return status, nil
}

// StartEditOverlay opens the desktop overlay in edit mode for the active profile.
// It closes any running overlay window first to avoid ghost windows or racing renderers.
func (s *HubService) StartEditOverlay(idOrFile string) (OverlayStatus, error) {
	if err := s.ActivateProfile(idOrFile); err != nil {
		return OverlayStatus{}, err
	}
	document, err := s.activeOverlayDocument()
	if err != nil {
		return OverlayStatus{}, err
	}
	if s.studioProfileSvc != nil {
		if err := s.studioProfileSvc.SetDisplayMode(config.ModeEdit); err != nil {
			return OverlayStatus{}, err
		}
		document = s.studioProfileSvc.Document()
	} else {
		editDocument := *document
		editDocument.DisplayMode = config.ModeEdit
		document = &editDocument
	}
	if s.overlay != nil {
		s.overlay.Stop()
	}
	status, err := s.overlay.Start(document)
	if s.studioProfileSvc != nil {
		s.studioProfileSvc.EmitRuntimeLoaded()
	}
	return status, err
}

// SaveProfile persists the provided profile to disk via the profile service.
func (s *HubService) SaveProfile(profile *config.ProfileConfig) error {
	if profile.ID == "" {
		return fmt.Errorf("missing profile ID")
	}
	path, err := s.findProfilePath(profile.ID)
	if err != nil {
		return err
	}
	if err := config.SaveFile(path, profile); err != nil {
		return err
	}

	// If this is the active profile, sync the active profile service.
	active := s.profileSvc.GetProfile()
	if active != nil && active.ID == profile.ID {
		s.profileSvc.SetProfile(profile)
		s.profileSvc.EmitLoaded()
		if s.emitter != nil {
			s.emitter.Emit("hub:profile", map[string]any{"profile": profile})
			s.emitter.Emit("profile:saved", map[string]any{"ok": true})
		}
	} else if s.emitter != nil {
		// Even for inactive profiles, trigger a reload in Hub frontend to refresh the list
		s.emitter.Emit("hub:profiles:reload", nil)
	}
	return nil
}

// GetProfileConfig loads and returns the profile configuration for the given profile ID/file.
func (s *HubService) GetProfileConfig(idOrFile string) (*config.ProfileConfig, error) {
	path, err := s.findProfilePath(idOrFile)
	if err != nil {
		return nil, err
	}
	return config.LoadFile(path)
}

// SetWidgetEnabled toggles a widget's enabled state in the active profile.
func (s *HubService) SetWidgetEnabled(widgetID string, enabled bool) error {
	current := s.profileSvc.GetProfile()
	if current == nil {
		return fmt.Errorf("no active profile")
	}
	// Clone to avoid mutating the service's internal pointer.
	profile := *current
	found := false
	profile.Widgets = make([]config.WidgetConfig, len(current.Widgets))
	copy(profile.Widgets, current.Widgets)
	for i := range profile.Widgets {
		if profile.Widgets[i].ID == widgetID {
			profile.Widgets[i].Enabled = enabled
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("widget not found: %s", widgetID)
	}
	return s.SaveProfile(&profile)
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
