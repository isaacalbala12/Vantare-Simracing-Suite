package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ErrSettingsPathEmpty is returned when Save is called without a file path.
var ErrSettingsPathEmpty = errors.New("settings: path is empty")

// ErrSettingsNotLoaded is returned when an operation requires loaded settings.
var ErrSettingsNotLoaded = errors.New("settings: not loaded")

// ErrAppNotFound is returned when an app ID is not found in LauncherApps.
var ErrAppNotFound = errors.New("settings: app not found")

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

// LauncherAvailability is the canonical availability contract for a
// launcher app. The flags are independent facts/derivations and are not a
// replacement for the legacy Detected field during migration.
type LauncherAvailability struct {
	Catalogued bool `json:"catalogued"`
	Found      bool `json:"found"`
	Installed  bool `json:"installed"`
	Launchable bool `json:"launchable"`
}

// LauncherAppEntry representa una app detectada o añadida manualmente.
type LauncherAppEntry struct {
	ID                 string               `json:"id"`
	DisplayName        string               `json:"displayName"`
	Abbreviation       string               `json:"abbreviation"`
	Category           LauncherAppCategory  `json:"category"`
	LaunchMethod       string               `json:"launchMethod"`
	SteamAppID         uint32               `json:"steamAppId,omitempty"`
	ExecutablePath     string               `json:"executablePath,omitempty"`
	Args               string               `json:"args,omitempty"`
	Availability       LauncherAvailability `json:"availability"`
	PathSource         string               `json:"pathSource,omitempty"`
	UserExecutablePath string               `json:"userExecutablePath,omitempty"`
	IconOverridePath   string               `json:"iconOverridePath,omitempty"`
	// Deprecated: use Availability instead. Kept for settings migration.
	Detected     bool   `json:"detected"`
	GradientFrom string `json:"gradientFrom"`
	GradientTo   string `json:"gradientTo"`
	IsFavorite   bool   `json:"isFavorite,omitempty"`
	IconURL      string `json:"iconUrl,omitempty"`
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
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	s.settings.LauncherApps = make(map[string]LauncherAppEntry, len(apps))
	for k, v := range apps {
		s.settings.LauncherApps[k] = v
	}
	// Marshal under lock for data consistency, then persist without the lock.
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()

	return s.saveWithRetry(settings, data, 0)
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
	if s.settings == nil {
		s.settings = DefaultAppSettings()
	}
	out := make([]LaunchProfile, len(profiles))
	copy(out, profiles)
	s.settings.LauncherProfiles = out
	// Marshal under lock for data consistency, then persist without the lock.
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()

	return s.saveWithRetry(settings, data, 0)
}

// UpdateLauncherAppArgs updates the Args field of a launcher app entry and
// persists the change. It returns ErrAppNotFound if the app ID does not exist.
func (s *SettingsService) UpdateLauncherAppArgs(id, args string) error {
	s.mu.Lock()
	if s.settings == nil {
		s.mu.Unlock()
		return ErrSettingsNotLoaded
	}
	entry, ok := s.settings.LauncherApps[id]
	if !ok {
		s.mu.Unlock()
		return ErrAppNotFound
	}
	entry.Args = args
	s.settings.LauncherApps[id] = entry
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()

	return s.saveWithRetry(settings, data, 0)
}

// SetLauncherAppFavorite updates the IsFavorite field of a launcher app entry
// and persists the change. Returns ErrAppNotFound if the app ID does not exist.
func (s *SettingsService) SetLauncherAppFavorite(id string, favorite bool) error {
	s.mu.Lock()
	if s.settings == nil {
		s.mu.Unlock()
		return ErrSettingsNotLoaded
	}
	entry, ok := s.settings.LauncherApps[id]
	if !ok {
		s.mu.Unlock()
		return ErrAppNotFound
	}
	entry.IsFavorite = favorite
	s.settings.LauncherApps[id] = entry
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("marshal: %w", err)
	}
	settings := s.settings
	s.mu.Unlock()
	return s.saveWithRetry(settings, data, 0)
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

// applyLoaded merges the loaded settings, using defaults only for nil
// map/slice fields. It does NOT allocate default maps unless the loaded
// file lacks them, preserving SchemaVersion from the persisted data.
func (s *SettingsService) applyLoaded(loaded *AppSettings) {
	if loaded == nil {
		s.settings = DefaultAppSettings()
		s.migrateSettings(s.settings)
		return
	}
	merged := &AppSettings{
		SchemaVersion:          loaded.SchemaVersion,
		DeltaMode:              loaded.DeltaMode,
		CpuSampling:            loaded.CpuSampling,
		ActiveOverlayProfileID: loaded.ActiveOverlayProfileID,
		BetaWelcomeCompleted:   loaded.BetaWelcomeCompleted,
		BetaUserRole:           loaded.BetaUserRole,
	}
	if loaded.Hotkeys != nil {
		merged.Hotkeys = make(map[string]string, len(loaded.Hotkeys))
		for k, v := range loaded.Hotkeys {
			merged.Hotkeys[k] = v
		}
	} else {
		merged.Hotkeys = map[string]string{
			"toggleOverlay":  "ctrl+shift+v",
			"toggleEditMode": "ctrl+shift+e",
			"nextProfile":    "ctrl+shift+right",
			"prevProfile":    "ctrl+shift+left",
		}
	}
	if loaded.LauncherApps != nil {
		merged.LauncherApps = make(map[string]LauncherAppEntry, len(loaded.LauncherApps))
		for k, v := range loaded.LauncherApps {
			merged.LauncherApps[k] = v
		}
	} else {
		merged.LauncherApps = defaultLauncherApps()
	}
	if loaded.LauncherProfiles != nil {
		merged.LauncherProfiles = make([]LaunchProfile, len(loaded.LauncherProfiles))
		copy(merged.LauncherProfiles, loaded.LauncherProfiles)
	} else {
		merged.LauncherProfiles = defaultLauncherProfiles()
	}
	s.migrateSettings(merged)
	s.settings = merged
}

// persistSidecarApplied writes the current settings to disk (via atomicWrite)
// after a sidecar was successfully applied. Called under the loadLocked lock.
func (s *SettingsService) persistSidecarApplied() error {
	if s.settings == nil {
		return nil
	}
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		return err
	}
	if dir := filepath.Dir(s.path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("mkdir: %w", err)
		}
	}
	if err := s.atomicWrite(data); err != nil {
		return fmt.Errorf("persist sidecar: %w", err)
	}
	return nil
}

// Save persists settings to disk atomically with retry+backoff and .bak rotation.
// It marshals the settings under the write lock for data consistency, then
// releases the lock before I/O and sleep so the mutex is never held during
// backoff delays.
func (s *SettingsService) Save(settings *AppSettings) error {
	if settings == nil {
		return fmt.Errorf("settings cannot be nil")
	}
	if s.path == "" {
		return ErrSettingsPathEmpty
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	// Directory is ensured at the top of saveWithRetry (idempotent).
	return s.saveWithRetry(settings, data, 0)
}

// saveWithRetry attempts to persist data atomically, retrying with backoff
// on failure. The caller must NOT hold s.mu — this function takes the lock
// only briefly to update s.settings after a successful write.
func (s *SettingsService) saveWithRetry(settings *AppSettings, data []byte, attempt int) error {
	if dir := filepath.Dir(s.path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("mkdir: %w", err)
		}
	}
	err := s.atomicWrite(data)
	if err == nil {
		_ = os.Remove(s.path + ".failed")
		s.mu.Lock()
		s.settings = settings
		s.mu.Unlock()
		return nil
	}
	if attempt+1 < len(saveBackoffs) {
		time.Sleep(saveBackoffs[attempt+1])
		return s.saveWithRetry(settings, data, attempt+1)
	}
	// Exhausted: write payload to sidecar file.
	_ = os.WriteFile(s.path+".failed", data, 0o644)
	return fmt.Errorf("save failed after retries: %w", err)
}

// atomicWrite performs a safe write: .tmp → rename → .bak rotation.
// It does NOT take s.mu; callers that need memory consistency
// (e.g. s.settings = settings) must do so separately.
func (s *SettingsService) atomicWrite(data []byte) error {
	tmpPath := s.path + ".tmp"
	bakPath := s.path + ".bak"

	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}

	var oldData []byte
	if existing, err := os.ReadFile(s.path); err == nil {
		oldData = existing
	}

	if err := os.Rename(tmpPath, s.path); err != nil {
		return fmt.Errorf("rename tmp: %w", err)
	}

	// Rotate .bak with the old main content. Failure is non-fatal.
	if oldData != nil {
		if err := os.WriteFile(bakPath, oldData, 0o644); err != nil {
			s.logger.Warn("failed to write .bak, continuing", "err", err)
		}
	}

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
