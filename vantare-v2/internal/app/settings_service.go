package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// AppSettings holds user-configurable global settings.
type AppSettings struct {
	DeltaMode              string                    `json:"deltaMode"`
	CpuSampling            bool                      `json:"cpuSampling"`
	Hotkeys                map[string]string         `json:"hotkeys"`
	ActiveOverlayProfileID string                    `json:"activeOverlayProfileId,omitempty"`
	BetaWelcomeCompleted   bool                      `json:"betaWelcomeCompleted,omitempty"`
	BetaUserRole           string                    `json:"betaUserRole,omitempty"`
	Launchers              map[string]LauncherConfig `json:"launchers,omitempty"`
}

// LauncherConfig is the persisted shape of a single launcher entry. The
// launcher package defines its own equivalent type but the on-disk shape is
// owned by this struct so the JSON contract stays in one place.
type LauncherConfig struct {
	SimulatorID    string   `json:"simulatorId"`
	LaunchMethod   string   `json:"launchMethod"`
	ExecutablePath string   `json:"executablePath,omitempty"`
	SteamAppID     uint32   `json:"steamAppId,omitempty"`
	AssociatedApps []string `json:"associatedApps,omitempty"`
}

// DefaultAppSettings returns settings with sensible defaults.
func DefaultAppSettings() *AppSettings {
	return &AppSettings{
		DeltaMode:   "self",
		CpuSampling: true,
		Hotkeys: map[string]string{
			"toggleOverlay":  "ctrl+shift+v",
			"toggleEditMode": "ctrl+shift+e",
			"nextProfile":    "ctrl+shift+right",
			"prevProfile":    "ctrl+shift+left",
		},
	}
}

// SettingsService persists AppSettings to a JSON file and emits Wails events.
type SettingsService struct {
	path     string
	settings *AppSettings
	emitter  EventEmitter
}

// NewSettingsService creates a settings service backed by the given JSON file.
func NewSettingsService(path string, emitter EventEmitter) *SettingsService {
	return &SettingsService{
		path:    path,
		emitter: emitter,
	}
}

// Settings returns the current in-memory settings.
func (s *SettingsService) Settings() *AppSettings {
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	return s.settings
}

// GetLaunchers returns the current launcher configuration map. Used by the
// launcher service to read its persisted state.
func (s *SettingsService) GetLaunchers() map[string]LauncherConfig {
	if s.settings == nil {
		return nil
	}
	return s.settings.Launchers
}

// SetLaunchers replaces the entire Launchers map and persists the change.
// The launcher service calls this after validating a new configuration.
func (s *SettingsService) SetLaunchers(launchers map[string]LauncherConfig) error {
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	if launchers == nil {
		s.settings.Launchers = nil
	} else {
		s.settings.Launchers = make(map[string]LauncherConfig, len(launchers))
		for k, v := range launchers {
			s.settings.Launchers[k] = v
		}
	}
	return s.Save(s.settings)
}

// Load reads settings from disk. If the file does not exist or is corrupt,
// it falls back to defaults without error.
func (s *SettingsService) Load() error {
	s.settings = DefaultAppSettings()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // first run, defaults are fine
		}
		return fmt.Errorf("reading settings: %w", err)
	}

	var loaded AppSettings
	if err := json.Unmarshal(data, &loaded); err != nil {
		return fmt.Errorf("parsing settings: %w", err)
	}

	// Merge: start from defaults, overlay persisted values.
	merged := DefaultAppSettings()
	if loaded.DeltaMode != "" {
		merged.DeltaMode = loaded.DeltaMode
	}
	merged.CpuSampling = loaded.CpuSampling
	if loaded.Hotkeys != nil {
		for k, v := range loaded.Hotkeys {
			merged.Hotkeys[k] = v
		}
	}
	merged.ActiveOverlayProfileID = loaded.ActiveOverlayProfileID
	merged.BetaWelcomeCompleted = loaded.BetaWelcomeCompleted
	merged.BetaUserRole = loaded.BetaUserRole
	if loaded.Launchers != nil {
		merged.Launchers = make(map[string]LauncherConfig, len(loaded.Launchers))
		for k, v := range loaded.Launchers {
			merged.Launchers[k] = v
		}
	}
	s.settings = merged
	return nil
}

// Save validates and persists settings to disk.
func (s *SettingsService) Save(settings *AppSettings) error {
	if settings == nil {
		return fmt.Errorf("settings cannot be nil")
	}

	// Validate delta mode
	switch settings.DeltaMode {
	case "self", "session", "global":
		// valid
	default:
		return fmt.Errorf("invalid delta mode: %q", settings.DeltaMode)
	}

	// Validate hotkeys
	for name, combo := range settings.Hotkeys {
		if err := ValidateHotkeyCombo(combo); err != nil {
			return fmt.Errorf("hotkey %q: %w", name, err)
		}
	}

	// Ensure parent dir exists
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("creating settings dir: %w", err)
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding settings: %w", err)
	}

	if err := os.WriteFile(s.path, data, 0644); err != nil {
		return fmt.Errorf("writing settings: %w", err)
	}

	s.settings = settings
	return nil
}

// ValidateHotkeyCombo checks that a hotkey string has at least two parts (modifier+key).
func ValidateHotkeyCombo(combo string) error {
	if combo == "" {
		return fmt.Errorf("hotkey cannot be empty")
	}
	parts := strings.Split(strings.ToLower(combo), "+")
	if len(parts) < 2 {
		return fmt.Errorf("hotkey %q must have at least 2 keys (e.g. ctrl+shift+v)", combo)
	}
	// Validate modifiers
	mods := parts[:len(parts)-1]
	for _, m := range mods {
		switch m {
		case "ctrl", "alt", "shift", "win":
			// valid
		default:
			return fmt.Errorf("unknown modifier %q in hotkey %q", m, combo)
		}
	}
	// Key part must not be empty
	key := parts[len(parts)-1]
	if key == "" {
		return fmt.Errorf("missing key in hotkey %q", combo)
	}
	return nil
}
