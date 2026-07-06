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
	DeltaMode              string                      `json:"deltaMode"`
	CpuSampling            bool                        `json:"cpuSampling"`
	Hotkeys                map[string]string           `json:"hotkeys"`
	ActiveOverlayProfileID string                      `json:"activeOverlayProfileId,omitempty"`
	BetaWelcomeCompleted   bool                        `json:"betaWelcomeCompleted,omitempty"`
	BetaUserRole           string                      `json:"betaUserRole,omitempty"`
	LauncherApps           map[string]LauncherAppEntry `json:"launcherApps,omitempty"`
	LauncherProfiles       []LaunchProfile             `json:"launcherProfiles,omitempty"`
}

// LauncherAppCategory clasifica una app para la UI.
type LauncherAppCategory string

const (
	AppCategorySimulator LauncherAppCategory = "simulator"
	AppCategoryStreaming LauncherAppCategory = "streaming"
	AppCategoryAudio     LauncherAppCategory = "audio"
	AppCategoryTelemetry LauncherAppCategory = "telemetry"
	AppCategoryUtility   LauncherAppCategory = "utility"
)

// LauncherAppEntry representa una app detectada o añadida manualmente.
type LauncherAppEntry struct {
	ID             string              `json:"id"`
	DisplayName    string              `json:"displayName"`
	Abbreviation   string              `json:"abbreviation"`
	Category       LauncherAppCategory `json:"category"`
	LaunchMethod   string              `json:"launchMethod"`
	SteamAppID     uint32              `json:"steamAppId,omitempty"`
	ExecutablePath string              `json:"executablePath,omitempty"`
	Args           string              `json:"args,omitempty"`
	Detected       bool                `json:"detected"`
	GradientFrom   string              `json:"gradientFrom"`
	GradientTo     string              `json:"gradientTo"`
}

// LaunchStep es un paso dentro de un perfil.
type LaunchStep struct {
	AppID string `json:"appId"`
	Delay int    `json:"delay"`
}

// LaunchProfile es un perfil de lanzamiento editable.
type LaunchProfile struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	Steps       []LaunchStep `json:"steps"`
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
		LauncherApps:     defaultLauncherApps(),
		LauncherProfiles: defaultLauncherProfiles(),
	}
}

func defaultLauncherApps() map[string]LauncherAppEntry {
	// LMU detectada por defecto (el discovery la sobreescribe si la encuentra)
	lmu := LauncherAppEntry{
		ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
		Category: AppCategorySimulator, LaunchMethod: "steam-uri",
		SteamAppID: 2399420, Detected: true,
		GradientFrom: "#ff3b3b", GradientTo: "#9a0606",
	}
	return map[string]LauncherAppEntry{"lmu": lmu}
}

func defaultLauncherProfiles() []LaunchProfile {
	return []LaunchProfile{
		{
			ID:   "creator",
			Name: "Creador de Contenido",
			Steps: []LaunchStep{
				{AppID: "lmu", Delay: 0},
				{AppID: "obs", Delay: 2},
				{AppID: "spotify", Delay: 2},
			},
		},
		{
			ID:   "pro",
			Name: "Pro",
			Steps: []LaunchStep{
				{AppID: "lmu", Delay: 0},
				{AppID: "crewchief", Delay: 2},
				{AppID: "spotify", Delay: 2},
				{AppID: "motec", Delay: 2},
			},
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

// GetLauncherApps returns the current launcher apps map.
func (s *SettingsService) GetLauncherApps() map[string]LauncherAppEntry {
	if s.settings == nil {
		return nil
	}
	return s.settings.LauncherApps
}

// SetLauncherApps replaces the entire LauncherApps map and persists the change.
func (s *SettingsService) SetLauncherApps(apps map[string]LauncherAppEntry) error {
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	s.settings.LauncherApps = make(map[string]LauncherAppEntry, len(apps))
	for k, v := range apps {
		s.settings.LauncherApps[k] = v
	}
	return s.Save(s.settings)
}

// GetLauncherProfiles returns the current launch profiles slice.
func (s *SettingsService) GetLauncherProfiles() []LaunchProfile {
	if s.settings == nil {
		return nil
	}
	return s.settings.LauncherProfiles
}

// SetLauncherProfiles replaces the entire LaunchProfiles slice and persists the change.
func (s *SettingsService) SetLauncherProfiles(profiles []LaunchProfile) error {
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	out := make([]LaunchProfile, len(profiles))
	copy(out, profiles)
	s.settings.LauncherProfiles = out
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
	if loaded.LauncherApps != nil {
		merged.LauncherApps = make(map[string]LauncherAppEntry, len(loaded.LauncherApps))
		for k, v := range loaded.LauncherApps {
			merged.LauncherApps[k] = v
		}
	}
	if loaded.LauncherProfiles != nil {
		merged.LauncherProfiles = make([]LaunchProfile, len(loaded.LauncherProfiles))
		copy(merged.LauncherProfiles, loaded.LauncherProfiles)
	}
	if merged.LauncherApps == nil {
		merged.LauncherApps = defaultLauncherApps()
	}
	if merged.LauncherProfiles == nil {
		merged.LauncherProfiles = defaultLauncherProfiles()
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

	if err := atomicWriteFile(s.path, data, 0644); err != nil {
		return fmt.Errorf("writing settings: %w", err)
	}

	s.settings = settings
	return nil
}

// atomicWriteFile writes data to path atomically: write to a temp file in the
// same directory, then rename. This prevents partial writes if the process
// crashes mid-write. The temp file is cleaned up on error.
func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			tmp.Close()
			_ = os.Remove(tmpPath)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		return fmt.Errorf("writing temp file: %w", err)
	}
	if err := tmp.Chmod(perm); err != nil {
		return fmt.Errorf("chmod temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing temp file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("renaming temp file: %w", err)
	}
	cleanup = false
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
