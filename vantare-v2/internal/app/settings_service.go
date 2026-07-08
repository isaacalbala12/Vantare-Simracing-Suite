package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

// ErrSettingsPathEmpty is returned when Save is called without a file path.
var ErrSettingsPathEmpty = errors.New("settings: path is empty")

// saveBackoffs defines the backoff durations for retries.
var saveBackoffs = []time.Duration{0, 100 * time.Millisecond, 500 * time.Millisecond, 1 * time.Second}

// AppSettings holds user-configurable global settings.
type AppSettings struct {
	SchemaVersion          int                         `json:"schemaVersion"`
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
	IsFavorite     bool                `json:"isFavorite,omitempty"`
}

// LaunchStep es un paso dentro de un perfil.
type LaunchStep struct {
	AppID string `json:"appId"`
	Delay int    `json:"delay"`
}

// LaunchProfile es un perfil de lanzamiento editable.
type LaunchProfile struct {
	ID                     string       `json:"id"`
	Name                   string       `json:"name"`
	Description            string       `json:"description,omitempty"`
	Steps                  []LaunchStep `json:"steps"`
	IsFavorite             bool         `json:"isFavorite,omitempty"`
	Notes                  string       `json:"notes,omitempty"`
	LaunchCount            int          `json:"launchCount,omitempty"`
	LastLaunchedAt         *time.Time   `json:"lastLaunchedAt,omitempty"`
	AvgChainDurationMs     int64        `json:"avgChainDurationMs,omitempty"`
	LaunchOnWindowsStartup bool         `json:"launchOnWindowsStartup,omitempty"`
	Hotkey                 string       `json:"hotkey,omitempty"`
}

// DefaultAppSettings returns settings with sensible defaults.
func DefaultAppSettings() *AppSettings {
	return &AppSettings{
		SchemaVersion: 1,
		DeltaMode:     "self",
		CpuSampling:   true,
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

// migrateSettings applies additive schema migrations in place.
// v0 (no SchemaVersion) -> v1: set version and ensure launcher collections exist.
func (s *SettingsService) migrateSettings(settings *AppSettings) {
	if settings.SchemaVersion == 0 {
		settings.SchemaVersion = 1
		if settings.LauncherApps == nil {
			settings.LauncherApps = defaultLauncherApps()
		}
		if settings.LauncherProfiles == nil {
			settings.LauncherProfiles = defaultLauncherProfiles()
		}
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
	mu       sync.RWMutex
	path     string
	settings *AppSettings
	emitter  EventEmitter
	logger   *slog.Logger
}

// NewSettingsService creates a settings service backed by the given JSON file.
// If logger is nil, slog.Default() is used.
func NewSettingsService(path string, emitter EventEmitter, logger *slog.Logger) *SettingsService {
	if logger == nil {
		logger = slog.Default()
	}
	return &SettingsService{
		path:    path,
		emitter: emitter,
		logger:  logger,
	}
}

// Settings returns the current in-memory settings with a read lock.
func (s *SettingsService) Settings() *AppSettings {
	s.mu.RLock()
	if s.settings != nil {
		s.mu.RUnlock()
		return s.settings
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	return s.settings
}

// GetLauncherApps returns the current launcher apps map with a read lock.
func (s *SettingsService) GetLauncherApps() map[string]LauncherAppEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.settings == nil {
		return nil
	}
	return s.settings.LauncherApps
}

// SetLauncherApps replaces the entire LauncherApps map and persists the change.
func (s *SettingsService) SetLauncherApps(apps map[string]LauncherAppEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	s.settings.LauncherApps = make(map[string]LauncherAppEntry, len(apps))
	for k, v := range apps {
		s.settings.LauncherApps[k] = v
	}
	return s.saveLocked(s.settings, 0)
}

// GetLauncherProfiles returns the current launch profiles slice with a read lock.
func (s *SettingsService) GetLauncherProfiles() []LaunchProfile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.settings == nil {
		return nil
	}
	return s.settings.LauncherProfiles
}

// SetLauncherProfiles replaces the entire LaunchProfiles slice and persists the change.
func (s *SettingsService) SetLauncherProfiles(profiles []LaunchProfile) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	out := make([]LaunchProfile, len(profiles))
	copy(out, profiles)
	s.settings.LauncherProfiles = out
	return s.saveLocked(s.settings, 0)
}

// Load reads settings from disk with tolerance for corruption.
// Priority order: .failed sidecar → main file → .bak → defaults.
func (s *SettingsService) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

// loadLocked performs the load with the mutex already held.
func (s *SettingsService) loadLocked() error {
	s.settings = DefaultAppSettings()
	s.migrateSettings(s.settings)
	if s.path == "" {
		return nil
	}

	// 1. Sidecar recovery: if a .failed file exists, check staleness and apply if valid.
	if sidecarData, err := os.ReadFile(s.path + ".failed"); err == nil {
		var sc AppSettings
		if err := json.Unmarshal(sidecarData, &sc); err == nil {
			mainStat, mainStatErr := os.Stat(s.path)
			sidecarStat, sidecarStatErr := os.Stat(s.path + ".failed")
			applySidecar := false
			if os.IsNotExist(mainStatErr) {
				// Main does not exist: apply sidecar.
				applySidecar = true
			} else if sidecarStatErr == nil && sidecarStat.ModTime().After(mainStat.ModTime()) {
				// Sidecar is newer than main: apply.
				applySidecar = true
			}
			if applySidecar {
				s.logger.Warn("settings recovered from sidecar", "path", s.path)
				s.applyLoaded(&sc)
				_ = os.Remove(s.path + ".failed")
				return s.persistSidecarApplied()
			}
			// Sidecar is stale (main is newer): remove it and continue with main.
			_ = os.Remove(s.path + ".failed")
			s.logger.Info("stale sidecar removed", "path", s.path)
		} else {
			// Unparseable sidecar: remove and continue.
			_ = os.Remove(s.path + ".failed")
		}
	}

	// 2. Try main file.
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // defaults already loaded
		}
		return fmt.Errorf("read: %w", err)
	}
	var loaded AppSettings
	if err := json.Unmarshal(data, &loaded); err != nil {
		// 3. Fallback to .bak.
		if bakData, bakErr := os.ReadFile(s.path + ".bak"); bakErr == nil {
			if err := json.Unmarshal(bakData, &loaded); err == nil {
				s.logger.Warn("settings main file corrupted, recovered from .bak", "path", s.path)
				s.applyLoaded(&loaded)
				return nil
			}
		}
		// 4. Everything failed, use defaults (already set).
		s.logger.Error("settings main and .bak both corrupted, using defaults — USER DATA LOST", "path", s.path)
		return nil
	}
	s.applyLoaded(&loaded)
	return nil
}

// applyLoaded merges the loaded settings over defaults, preserving
// fields not present in the persisted file.
func (s *SettingsService) applyLoaded(loaded *AppSettings) {
	merged := DefaultAppSettings()
	if loaded.DeltaMode != "" {
		merged.DeltaMode = loaded.DeltaMode
	}
	merged.CpuSampling = loaded.CpuSampling
	if loaded.Hotkeys != nil {
		merged.Hotkeys = make(map[string]string, len(loaded.Hotkeys))
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
	s.migrateSettings(merged)
	s.settings = merged
}

// persistSidecarApplied writes the current settings to disk (via .tmp + .bak + rename)
// after a sidecar was successfully applied. It does NOT write the sidecar file itself.
func (s *SettingsService) persistSidecarApplied() error {
	if s.settings == nil {
		return nil
	}
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := s.path + ".tmp"
	bakPath := s.path + ".bak"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return fmt.Errorf("persist sidecar write tmp: %w", err)
	}
	if _, err := os.Stat(s.path); err == nil {
		_ = os.Rename(s.path, bakPath)
	}
	if err := os.Rename(tmpPath, s.path); err != nil {
		return fmt.Errorf("persist sidecar rename: %w", err)
	}
	return nil
}

// Save persists settings to disk atomically with retry+backoff and .bak rotation.
func (s *SettingsService) Save(settings *AppSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(settings, 0)
}

// saveLocked performs the actual write with atomic tmp→rename, .bak rotation,
// and .failed sidecar cleanup. It is called with the mutex already held.
func (s *SettingsService) saveLocked(settings *AppSettings, attempt int) error {
	if s.path == "" {
		return ErrSettingsPathEmpty
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	tmpPath := s.path + ".tmp"
	bakPath := s.path + ".bak"
	sidecarPath := s.path + ".failed"

	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return s.retryOrSidecar(settings, attempt, data, sidecarPath, fmt.Errorf("write tmp: %w", err))
	}
	// Copy existing main to .bak before replacing it. We copy (not rename)
	// so the main file is never absent between the two operations.
	// If the copy fails, the .bak may be stale but the update proceeds.
	if _, err := os.Stat(s.path); err == nil {
		if bakData, err := os.ReadFile(s.path); err == nil {
			_ = os.WriteFile(bakPath, bakData, 0o644)
		}
	}
	// Atomically replace main with .tmp. If this fails, the old main is intact.
	if err := os.Rename(tmpPath, s.path); err != nil {
		return s.retryOrSidecar(settings, attempt, data, sidecarPath, fmt.Errorf("rename: %w", err))
	}
	// Save successful: remove stale sidecar if it exists.
	_ = os.Remove(sidecarPath)
	s.settings = settings
	return nil
}

// retryOrSidecar sleeps with backoff and retries, or writes a .failed sidecar
// when all retries are exhausted.
func (s *SettingsService) retryOrSidecar(settings *AppSettings, attempt int, data []byte, sidecarPath string, lastErr error) error {
	if attempt+1 < len(saveBackoffs) {
		time.Sleep(saveBackoffs[attempt+1])
		return s.saveLocked(settings, attempt+1)
	}
	// Exhausted: write payload to sidecar file.
	_ = os.WriteFile(sidecarPath, data, 0o644)
	return fmt.Errorf("save failed after retries: %w", lastErr)
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
