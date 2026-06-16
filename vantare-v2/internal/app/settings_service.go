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
	DeltaMode   string            `json:"deltaMode"`
	CpuSampling bool              `json:"cpuSampling"`
	Hotkeys     map[string]string `json:"hotkeys"`
}

// DefaultAppSettings returns settings with sensible defaults.
func DefaultAppSettings() *AppSettings {
	return &AppSettings{
		DeltaMode:   "self",
		CpuSampling: true,
		Hotkeys: map[string]string{
			"toggleOverlay": "ctrl+shift+v",
			"nextProfile":   "ctrl+shift+right",
			"prevProfile":   "ctrl+shift+left",
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
